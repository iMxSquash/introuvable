import * as THREE from 'three';
import { DEFAULT_WORLD_BASIS } from '../modules/math/WorldBasis.js';
import { DEFAULT_PRNG } from '../modules/math/RandomUtils.js';
import { disposeObject3D } from '../modules/world/Object3DUtils.js';
import { createWorldBoundsColliders } from '../modules/world/environment/WorldBoundsColliderFactory.js';
import { SpawnAreaSampler, SPAWN_REGION_TYPES } from '../modules/world/environment/SpawnAreaSampler.js';
import { FOLDER_FRONT_BLUE, FOLDER_BACK_BLUE } from './Palette.js';
import { createContactShadow } from './ContactShadow.js';
import { JumpCourse } from './JumpCourse.js';

// Provisional macOS-ish tones. The real wallpaper texture is added once the
// actual portfolio wallpaper asset exists (none is committed yet in the
// portfolio repo) - `wallpaperTexture` lets it be swapped in without
// touching this class.
const PLACEHOLDER_GROUND_COLOR = 0x8fadd1;
const PLACEHOLDER_SKY_COLOR = 0xc7d7ea;
const FOLDER_SHADOW_RADIUS = 3.2;

const FOLDER_BODY_SIZE = Object.freeze({ right: 4.4, up: 3.0, forward: 3.2 });
const FOLDER_TAB_SIZE = Object.freeze({ right: 1.85, up: 0.66, forward: 1.6 });
// Rounding is an inset of the existing box footprint, never a protrusion, so
// the unchanged cuboid Rapier colliders in createPhysicsColliders() stay
// visually consistent with the mesh.
const FOLDER_BODY_CORNER_RADIUS = 0.55;
const FOLDER_TAB_CORNER_RADIUS = 0.35;
const FOLDER_GRID_SPACING = 13;
const FOLDER_GRID_RADIUS_CELLS = 2;
const FOLDER_JITTER = 3;
const FOLDER_WORLD_MARGIN = 9;
const SPAWN_KEEPOUT_RADIUS = 12;
const FOLDER_COLLIDER_FRICTION = 0.9;

// Screen-relative directions for this game's fixed isometric camera
// (`CAMERA_RIG_OPTIONS.azimuth = Math.PI / 4` in `main.js`): screen-right is
// world direction `(cos(azimuth), -sin(azimuth))`, screen-forward (away from
// camera) is `(sin(azimuth), cos(azimuth))` - with that azimuth both reduce
// to plain `±Math.SQRT1_2`. Kept as constants here (rather than importing
// the azimuth) so this class stays camera-agnostic otherwise.
const SCREEN_RIGHT = Object.freeze({ right: Math.SQRT1_2, forward: -Math.SQRT1_2 });
const SCREEN_FORWARD = Object.freeze({ right: Math.SQRT1_2, forward: Math.SQRT1_2 });
const SCREEN_BACKWARD = Object.freeze({ right: -Math.SQRT1_2, forward: -Math.SQRT1_2 });

// Small enough that a fall-recovery checkpoint sits inside each gap's
// open-air span without reaching either platform's own footprint.
const COURSE_FALL_CAPTURE_RADIUS = 1;
// Generous exclusion so no folder/spawn/fragment appears on or too close to
// any course.
const COURSE_KEEPOUT_RADIUS = 5;

// Three jump-platforming courses of increasing difficulty, each heading in a
// different screen direction so they never cross paths. Easy: two static
// stepping platforms. Medium: adds one moving (back-and-forth) platform.
// Hard: narrower platforms, bigger gaps, two moving platforms running at
// different rhythms. All three end on an extra folder standing normally on
// the ground, whose roof (one more easy hop up) holds a fragment - total
// course length is kept comfortably inside the world bounds (`worldSize=70`,
// walls at ±35).
const COURSE_CONFIGS = {
  easy: {
    direction: SCREEN_RIGHT,
    entryDistance: 18,
    airGap: 3,
    platformSize: Object.freeze({ right: 3.5, up: 0.5, forward: 2 }),
    platforms: [{ height: 1.0 }, { height: 2.0 }],
  },
  medium: {
    direction: SCREEN_FORWARD,
    entryDistance: 12,
    airGap: 3,
    platformSize: Object.freeze({ right: 3, up: 0.5, forward: 2 }),
    platforms: [
      { height: 1.0 },
      { height: 2.0, moving: { amplitude: 0.7, periodSeconds: 2.2 } },
      { height: 2.6 },
    ],
  },
  hard: {
    direction: SCREEN_BACKWARD,
    entryDistance: 8,
    airGap: 3.5,
    platformSize: Object.freeze({ right: 2.5, up: 0.5, forward: 1.6 }),
    platforms: [
      { height: 1.0, moving: { amplitude: 0.8, periodSeconds: 2.0 } },
      { height: 1.8 },
      { height: 2.5, moving: { amplitude: 1.0, periodSeconds: 1.7 } },
    ],
  },
};

const WORLD_BOUNDS_WALL_HEIGHT = 16;
const WORLD_BOUNDS_WALL_THICKNESS = 1.6;

const AMBIENT_LIGHT_COLOR = 0xffffff;
const SHADOW_MAP_SIZE = 2048;

const FRAGMENT_SAMPLE_ATTEMPTS = 30;
const FRAGMENT_MIN_DISTANCE_FROM_SPAWN = 14;
const FRAGMENT_MIN_DISTANCE_BETWEEN = 8;

// Selected via the optional `?theme=dark|light` integration contract (see
// main.js) so the desktop can match the portfolio's own theme.
const THEME_PALETTES = {
  light: {
    skyColor: PLACEHOLDER_SKY_COLOR,
    groundColor: PLACEHOLDER_GROUND_COLOR,
    groundColorCenter: 0xa8c6e8,
    ambientIntensity: 0.65,
    directionalColor: 0xfff3e0,
    directionalIntensity: 1.15,
  },
  dark: {
    skyColor: 0x1c2230,
    groundColor: 0x3a4152,
    groundColorCenter: 0x4a5468,
    ambientIntensity: 0.42,
    directionalColor: 0xdce6ff,
    directionalIntensity: 0.85,
  },
};

// A rounded-rect footprint extruded to `size.up`, following the same
// THREE.Shape -> ExtrudeGeometry technique as CursorMesh.js/FileIconMesh.js.
// The shape's bounding box always equals `size.right x size.forward` (the
// rounding is an inset, via absarc corners, never a protrusion), so it stays
// a strict subset of the unchanged cuboid collider volume.
function buildRoundedBoxGeometry(size, cornerRadius) {
  const halfW = size.right * 0.5;
  const halfF = size.forward * 0.5;
  const shape = new THREE.Shape();
  shape.moveTo(-halfW + cornerRadius, -halfF);
  shape.lineTo(halfW - cornerRadius, -halfF);
  shape.absarc(halfW - cornerRadius, -halfF + cornerRadius, cornerRadius, -Math.PI / 2, 0, false);
  shape.lineTo(halfW, halfF - cornerRadius);
  shape.absarc(halfW - cornerRadius, halfF - cornerRadius, cornerRadius, 0, Math.PI / 2, false);
  shape.lineTo(-halfW + cornerRadius, halfF);
  shape.absarc(-halfW + cornerRadius, halfF - cornerRadius, cornerRadius, Math.PI / 2, Math.PI, false);
  shape.lineTo(-halfW, -halfF + cornerRadius);
  shape.absarc(-halfW + cornerRadius, -halfF + cornerRadius, cornerRadius, Math.PI, Math.PI * 1.5, false);
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: size.up,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.08,
    bevelSegments: 2,
    curveSegments: 6,
  });
  geometry.rotateX(-Math.PI / 2);
  // ExtrudeGeometry spans [0, depth] along the post-rotation Y axis;
  // recenter to [-depth/2, depth/2] to match BoxGeometry's centered origin
  // (createFolderMesh positions these by their center, same as before).
  geometry.translate(0, -size.up * 0.5, 0);
  return geometry;
}

// Diagonal light-to-dark gradient across the folder body, approximating a
// real Big Sur folder icon's sheen. Driven by vertex position (not a UV
// texture): ExtrudeGeometry's default UV generator emits raw, unnormalized
// shape-space coordinates for both cap and side-wall faces (see three.js's
// WorldUVGenerator), which would clamp a texture to a near-solid edge color
// rather than spanning it - per-vertex color sidesteps that entirely and
// reads consistently across every face.
function applyDiagonalGradientVertexColors(geometry, colorFromHex, colorToHex) {
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  const spanX = max.x - min.x || 1;
  const spanY = max.y - min.y || 1;
  const colorFrom = new THREE.Color(colorFromHex);
  const colorTo = new THREE.Color(colorToHex);

  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const blended = new THREE.Color();
  for (let i = 0; i < position.count; i += 1) {
    const normalizedX = (position.getX(i) - min.x) / spanX;
    const normalizedY = (position.getY(i) - min.y) / spanY;
    blended.copy(colorFrom).lerp(colorTo, (normalizedX + normalizedY) * 0.5);
    colors[i * 3] = blended.r;
    colors[i * 3 + 1] = blended.g;
    colors[i * 3 + 2] = blended.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

const GROUND_TEXTURE_SIZE = 512;
const groundTextureCache = new Map();
// Procedural radial-gradient ground texture (center -> edge), reused until a
// real wallpaper asset exists (see wallpaperTexture). The edge stop reuses
// the theme's own groundColor/skyColor tone so the gradient blends into the
// existing fog instead of creating a seam. Cached per theme's color pair.
function getGroundTexture(centerColorHex, edgeColorHex) {
  const key = `${centerColorHex}:${edgeColorHex}`;
  const cached = groundTextureCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = GROUND_TEXTURE_SIZE;
  canvas.height = GROUND_TEXTURE_SIZE;
  const context = canvas.getContext('2d');
  const center = GROUND_TEXTURE_SIZE * 0.5;
  const gradient = context.createRadialGradient(center, center, 0, center, center, center);
  gradient.addColorStop(0, `#${centerColorHex.toString(16).padStart(6, '0')}`);
  gradient.addColorStop(1, `#${edgeColorHex.toString(16).padStart(6, '0')}`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, GROUND_TEXTURE_SIZE, GROUND_TEXTURE_SIZE);

  const texture = new THREE.CanvasTexture(canvas);
  groundTextureCache.set(key, texture);
  return texture;
}

const folderBodyGeometry = buildRoundedBoxGeometry(FOLDER_BODY_SIZE, FOLDER_BODY_CORNER_RADIUS);
applyDiagonalGradientVertexColors(folderBodyGeometry, FOLDER_FRONT_BLUE, FOLDER_BACK_BLUE);
const folderTabGeometry = buildRoundedBoxGeometry(FOLDER_TAB_SIZE, FOLDER_TAB_CORNER_RADIUS);
// Folders are visually identical buildings: shared materials for every
// instance instead of one per folder. Two-tone: gradient-colored front
// body, flat darker tab reading as the flap behind it.
const folderBodyMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  color: 0xffffff,
  roughness: 0.55,
  metalness: 0.05,
});
const folderTabMaterial = new THREE.MeshStandardMaterial({
  color: FOLDER_BACK_BLUE,
  roughness: 0.7,
  metalness: 0.05,
});

function buildFolderGridCells(worldSize, prng, courseKeepoutPoints) {
  const halfSize = worldSize * 0.5 - FOLDER_WORLD_MARGIN;
  const cells = [];

  for (let row = -FOLDER_GRID_RADIUS_CELLS; row <= FOLDER_GRID_RADIUS_CELLS; row += 1) {
    for (let col = -FOLDER_GRID_RADIUS_CELLS; col <= FOLDER_GRID_RADIUS_CELLS; col += 1) {
      const right = col * FOLDER_GRID_SPACING + prng.uniform(-FOLDER_JITTER, FOLDER_JITTER);
      const forward = row * FOLDER_GRID_SPACING + prng.uniform(-FOLDER_JITTER, FOLDER_JITTER);

      if (Math.abs(right) > halfSize || Math.abs(forward) > halfSize) continue;
      if (Math.hypot(right, forward) < SPAWN_KEEPOUT_RADIUS) continue;
      if (courseKeepoutPoints.some((point) => (
        Math.hypot(right - point.right, forward - point.forward) < COURSE_KEEPOUT_RADIUS
      ))) continue;

      cells.push({ right, forward, yaw: prng.uniform(0, Math.PI * 2) });
    }
  }

  return cells;
}

export class DesktopEnvironment {
  constructor({
    scene,
    worldSize = 70,
    floorUp = 0,
    basis = DEFAULT_WORLD_BASIS,
    prng = DEFAULT_PRNG,
    wallpaperTexture = null,
    theme = 'light',
  }) {
    this.scene = scene;
    this.worldSize = worldSize;
    this.floorUp = floorUp;
    this.basis = basis;
    this.prng = prng;
    this.wallpaperTexture = wallpaperTexture;
    this.palette = THEME_PALETTES[theme] ?? THEME_PALETTES.light;

    this.objectRotation = this.basis.threeObjectCanonicalToBasisQuaternion();
    this.planeRotation = this.basis.threePlaneCanonicalToBasisQuaternion();
    this.group = new THREE.Group();
    this.group.name = 'DesktopEnvironment';

    this.courses = {};
    for (const [id, config] of Object.entries(COURSE_CONFIGS)) {
      this.courses[id] = new JumpCourse({
        basis: this.basis,
        floorUp: this.floorUp,
        objectRotation: this.objectRotation,
        createFolderMesh: () => this.createFolderMesh(),
        folderBodySize: FOLDER_BODY_SIZE,
        fallCaptureRadius: COURSE_FALL_CAPTURE_RADIUS,
        keepoutRadius: COURSE_KEEPOUT_RADIUS,
        ...config,
      });
    }

    const courseKeepoutPoints = Object.values(this.courses).flatMap((course) => course.getKeepoutPoints());

    this.folderLayout = buildFolderGridCells(this.worldSize, this.prng, courseKeepoutPoints);
    this.spawnSampler = this.createSpawnSampler(courseKeepoutPoints);

    this.physicsWorld = null;
    this.rapier = null;
    this.physicsColliders = [];
  }

  create() {
    this.scene.background = new THREE.Color(this.palette.skyColor);
    this.scene.fog = new THREE.Fog(
      this.palette.skyColor,
      this.worldSize * 0.35,
      this.worldSize * 0.95
    );

    this.createLighting();
    this.createGround();
    this.createFolders();
    for (const course of Object.values(this.courses)) {
      course.create();
      this.group.add(course.group);
    }
    this.scene.add(this.group);
    return this;
  }

  // Advances every course's moving platforms.
  update(deltaSeconds) {
    for (const course of Object.values(this.courses)) course.update(deltaSeconds);
  }

  createLighting() {
    const ambientLight = new THREE.AmbientLight(AMBIENT_LIGHT_COLOR, this.palette.ambientIntensity);
    this.group.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(
      this.palette.directionalColor,
      this.palette.directionalIntensity
    );
    directionalLight.position.copy(
      this.basis.fromBasisComponents(this.worldSize * 0.25, this.worldSize * 0.5, -this.worldSize * 0.2)
    );
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    directionalLight.shadow.camera.near = 1;
    directionalLight.shadow.camera.far = this.worldSize * 1.5;
    directionalLight.shadow.camera.left = -this.worldSize * 0.6;
    directionalLight.shadow.camera.right = this.worldSize * 0.6;
    directionalLight.shadow.camera.top = this.worldSize * 0.6;
    directionalLight.shadow.camera.bottom = -this.worldSize * 0.6;
    directionalLight.shadow.bias = -0.0015;
    this.group.add(directionalLight);
  }

  createGround() {
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.wallpaperTexture ?? getGroundTexture(this.palette.groundColorCenter, this.palette.groundColor),
      roughness: 1,
      metalness: 0,
    });

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(this.worldSize, this.worldSize),
      material
    );
    ground.position.copy(this.basis.fromBasisComponents(0, this.floorUp, 0));
    ground.quaternion.copy(this.planeRotation);
    ground.receiveShadow = true;
    this.group.add(ground);
    this.groundMesh = ground;
  }

  // Raycast targets for click-to-move aiming (AimResolver).
  getRaycastTargets() {
    return [this.groundMesh];
  }

  createFolderMesh() {
    const group = new THREE.Group();

    const body = new THREE.Mesh(folderBodyGeometry, folderBodyMaterial);
    body.position.copy(this.basis.fromBasisComponents(0, FOLDER_BODY_SIZE.up * 0.5, 0));
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const tab = new THREE.Mesh(folderTabGeometry, folderTabMaterial);
    tab.position.copy(this.basis.fromBasisComponents(
      -(FOLDER_BODY_SIZE.right * 0.5 - FOLDER_TAB_SIZE.right * 0.5),
      FOLDER_BODY_SIZE.up + FOLDER_TAB_SIZE.up * 0.5,
      -(FOLDER_BODY_SIZE.forward * 0.5 - FOLDER_TAB_SIZE.forward * 0.5)
    ));
    tab.castShadow = true;
    group.add(tab);

    group.add(createContactShadow({ radius: FOLDER_SHADOW_RADIUS, basis: this.basis }));

    return group;
  }

  folderRotation(yaw) {
    return new THREE.Quaternion()
      .setFromAxisAngle(this.basis.upVector(), yaw)
      .multiply(this.objectRotation);
  }

  createFolders() {
    for (const folder of this.folderLayout) {
      const mesh = this.createFolderMesh();
      mesh.position.copy(this.basis.fromBasisComponents(folder.right, this.floorUp, folder.forward));
      mesh.quaternion.copy(this.folderRotation(folder.yaw));
      this.group.add(mesh);
      folder.mesh = mesh;
    }
  }

  createSpawnSampler(courseKeepoutPoints) {
    const halfSize = this.worldSize * 0.5 - FOLDER_WORLD_MARGIN;

    const blockRegions = this.folderLayout.map((folder) => ({
      type: SPAWN_REGION_TYPES.CIRCLE,
      center: { right: folder.right, forward: folder.forward },
      radius: Math.hypot(FOLDER_BODY_SIZE.right, FOLDER_BODY_SIZE.forward) * 0.5,
      clearance: 1.5,
    }));

    for (const point of courseKeepoutPoints) {
      blockRegions.push({
        type: SPAWN_REGION_TYPES.CIRCLE,
        center: point,
        radius: COURSE_KEEPOUT_RADIUS,
        clearance: 0,
      });
    }

    return new SpawnAreaSampler({
      bounds: { rightMin: -halfSize, rightMax: halfSize, forwardMin: -halfSize, forwardMax: halfSize },
      spawnRegions: [{
        type: SPAWN_REGION_TYPES.RECT,
        center: { right: 0, forward: 0 },
        size: { right: halfSize * 2, forward: halfSize * 2 },
      }],
      blockRegions,
    });
  }

  samplePlayerSpawn(prng = this.prng) {
    const planar = this.spawnSampler.sample(prng) ?? { right: 0, forward: 0 };
    return this.basis.fromBasisComponents(planar.right, this.floorUp, planar.forward);
  }

  // Desktop-scattered fragment positions: away from the player's spawn point
  // and from each other, never inside a folder or a course footprint (same
  // exclusions as samplePlayerSpawn, via the shared spawnSampler).
  sampleFragmentPositions(count, prng = this.prng, spawnPlanar = { right: 0, forward: 0 }) {
    const planarPoints = [];

    for (let i = 0; i < count; i += 1) {
      let accepted = null;
      for (let attempt = 0; attempt < FRAGMENT_SAMPLE_ATTEMPTS; attempt += 1) {
        const candidate = this.spawnSampler.sample(prng);
        if (!candidate) break;

        const farFromSpawn = Math.hypot(
          candidate.right - spawnPlanar.right,
          candidate.forward - spawnPlanar.forward
        ) >= FRAGMENT_MIN_DISTANCE_FROM_SPAWN;
        const farFromOthers = planarPoints.every((point) => Math.hypot(
          candidate.right - point.right,
          candidate.forward - point.forward
        ) >= FRAGMENT_MIN_DISTANCE_BETWEEN);

        if (farFromSpawn && farFromOthers) {
          accepted = candidate;
          break;
        }
      }
      if (accepted) planarPoints.push(accepted);
    }

    return planarPoints.map((point) => this.basis.fromBasisComponents(point.right, this.floorUp, point.forward));
  }

  // Ground point just before a course's first platform: where a missed jump
  // on that course sends the player back to.
  getCourseEntryPoint(courseId) {
    return this.courses[courseId].getEntryPoint();
  }

  // Roof of a course's final folder, where its fragment sits (PickupObject
  // floats it a bit further above whatever height it's given).
  getCourseFragmentPosition(courseId) {
    return this.courses[courseId].getFragmentPosition();
  }

  // Every fall-checkpoint across all 3 courses, each already carrying its
  // own course's entry point - a missed jump always sends the player back to
  // the start of whichever course they were on.
  getAllCourseFallCheckpoints() {
    return Object.values(this.courses).flatMap((course) => course.getFallCheckpoints());
  }

  // Every moving platform across all 3 courses, for the moving-platform
  // rider (see main.js) to carry the player along.
  getAllMovingPlatforms() {
    return Object.values(this.courses).flatMap((course) => course.getMovingPlatforms());
  }

  createStaticCuboidCollider(box, rotation, friction = 1) {
    const position = this.basis.fromBasisComponents(box.right, box.up, box.forward);
    const body = this.physicsWorld.createRigidBody(
      this.rapier.RigidBodyDesc.fixed()
        .setTranslation(position.x, position.y, position.z)
        .setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w })
    );
    const collider = this.physicsWorld.createCollider(
      this.rapier.ColliderDesc.cuboid(box.spanRight * 0.5, box.spanUp * 0.5, box.spanForward * 0.5)
        .setFriction(friction)
        .setRestitution(0),
      body
    );
    return { body, collider };
  }

  createPhysicsColliders(world, rapier) {
    this.disposePhysicsColliders();
    this.physicsWorld = world;
    this.rapier = rapier;
    this.physicsColliders = [];

    const groundBox = {
      right: 0,
      up: this.floorUp - 0.1,
      forward: 0,
      spanRight: this.worldSize,
      spanUp: 0.2,
      spanForward: this.worldSize,
    };
    this.physicsColliders.push(this.createStaticCuboidCollider(groundBox, this.objectRotation, 1));

    for (const folder of this.folderLayout) {
      const folderBox = {
        right: folder.right,
        up: this.floorUp + FOLDER_BODY_SIZE.up * 0.5,
        forward: folder.forward,
        spanRight: FOLDER_BODY_SIZE.right,
        spanUp: FOLDER_BODY_SIZE.up,
        spanForward: FOLDER_BODY_SIZE.forward,
      };
      this.physicsColliders.push(
        this.createStaticCuboidCollider(folderBox, this.folderRotation(folder.yaw), FOLDER_COLLIDER_FRICTION)
      );
    }

    for (const course of Object.values(this.courses)) course.createPhysicsColliders(world, rapier);

    const halfSize = this.worldSize * 0.5;
    const boundsWalls = createWorldBoundsColliders({
      world,
      rapier,
      minRight: -halfSize,
      maxRight: halfSize,
      minForward: -halfSize,
      maxForward: halfSize,
      wallThickness: WORLD_BOUNDS_WALL_THICKNESS,
      wallHeight: WORLD_BOUNDS_WALL_HEIGHT,
      centerUp: this.floorUp + WORLD_BOUNDS_WALL_HEIGHT * 0.5,
      basis: this.basis,
    });
    this.physicsColliders.push(...boundsWalls);

    return this.physicsColliders;
  }

  disposePhysicsColliders() {
    if (this.physicsWorld) {
      for (const entry of this.physicsColliders) {
        this.physicsWorld.removeRigidBody(entry.body);
      }
    }
    this.physicsColliders = [];
    this.physicsWorld = null;
    this.rapier = null;
    for (const course of Object.values(this.courses ?? {})) course.disposePhysicsColliders();
  }

  dispose() {
    this.disposePhysicsColliders();
    for (const course of Object.values(this.courses)) course.dispose();
    disposeObject3D(this.group);
  }
}
