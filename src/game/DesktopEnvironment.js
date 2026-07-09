import * as THREE from 'three';
import { DEFAULT_WORLD_BASIS } from '../modules/math/WorldBasis.js';
import { DEFAULT_PRNG } from '../modules/math/RandomUtils.js';
import { disposeObject3D } from '../modules/world/Object3DUtils.js';
import { createWorldBoundsColliders } from '../modules/world/environment/WorldBoundsColliderFactory.js';
import { SpawnAreaSampler, SPAWN_REGION_TYPES } from '../modules/world/environment/SpawnAreaSampler.js';
import { FOLDER_BLUE, TRASH_GRAY } from './Palette.js';
import { createContactShadow } from './ContactShadow.js';

// Provisional macOS-ish tones. The real wallpaper texture is added once the
// actual portfolio wallpaper asset exists (none is committed yet in the
// portfolio repo) - `wallpaperTexture` lets it be swapped in without
// touching this class.
const PLACEHOLDER_GROUND_COLOR = 0x8fadd1;
const PLACEHOLDER_SKY_COLOR = 0xc7d7ea;
const FOLDER_COLOR = FOLDER_BLUE;
const COURSE_PLATFORM_COLOR = TRASH_GRAY;
const FOLDER_SHADOW_RADIUS = 3.2;

const FOLDER_BODY_SIZE = Object.freeze({ right: 4.4, up: 3.0, forward: 3.2 });
const FOLDER_TAB_SIZE = Object.freeze({ right: 1.85, up: 0.66, forward: 1.6 });
const FOLDER_GRID_SPACING = 13;
const FOLDER_GRID_RADIUS_CELLS = 2;
const FOLDER_JITTER = 3;
const FOLDER_WORLD_MARGIN = 9;
const SPAWN_KEEPOUT_RADIUS = 12;
const FOLDER_COLLIDER_FRICTION = 0.9;

// The easy jump-platforming course: a couple of stepping platforms at
// increasing height, leading to one extra folder standing normally on the
// ground - its roof (reachable with one more easy hop) holds the final
// fragment. Built along `COURSE_DIRECTION`, a fixed diagonal in (right,
// forward) chosen to match the screen-right direction of this game's fixed
// isometric camera (`CAMERA_RIG_OPTIONS.azimuth = Math.PI / 4` in
// `main.js`): with that azimuth, screen-right is world direction
// `(cos(azimuth), -sin(azimuth))`, i.e. exactly `(√2/2, -√2/2)`. This class
// stays camera-agnostic otherwise, so the direction is a plain constant
// rather than an imported azimuth.
const COURSE_DIRECTION = Object.freeze({ right: Math.SQRT1_2, forward: -Math.SQRT1_2 });
const COURSE_ENTRY_DISTANCE = 18;
const COURSE_PLATFORM_1_HEIGHT = 1.0;
const COURSE_PLATFORM_2_HEIGHT = 2.0;
// Wider than long: a comfortable landing pad. Rotated to face along
// COURSE_DIRECTION (see `courseYaw` below), so its "forward" span is the
// half-length actually eaten into the jump distance, not a diagonal corner.
const COURSE_PLATFORM_SIZE = Object.freeze({ right: 3.5, up: 0.5, forward: 2 });
const COURSE_PLATFORM_ALONG_HALF = COURSE_PLATFORM_SIZE.forward / 2;
const FOLDER_ALONG_HALF = FOLDER_BODY_SIZE.forward / 2;
// Clear horizontal air gap aimed for at each jump - comfortably inside the
// jump range given `jumpVelocity`/`gravity`/`walkSpeed` (BaseCharacterMotionController).
const COURSE_AIR_GAP = 3;
// Small enough to sit inside each gap's open-air span without reaching
// either platform's own footprint (verified against COURSE_AIR_GAP above).
const COURSE_FALL_CAPTURE_RADIUS = 1;
// Generous exclusion so no folder/spawn/fragment appears on or too close to
// the course, regardless of platform rotation.
const COURSE_KEEPOUT_RADIUS = 5;

const FRAGMENT_SAMPLE_ATTEMPTS = 30;
const FRAGMENT_MIN_DISTANCE_FROM_SPAWN = 14;
const FRAGMENT_MIN_DISTANCE_BETWEEN = 8;

const WORLD_BOUNDS_WALL_HEIGHT = 16;
const WORLD_BOUNDS_WALL_THICKNESS = 1.6;

const AMBIENT_LIGHT_COLOR = 0xffffff;
const SHADOW_MAP_SIZE = 2048;

// Selected via the optional `?theme=dark|light` integration contract (see
// main.js) so the desktop can match the portfolio's own theme.
const THEME_PALETTES = {
  light: {
    skyColor: PLACEHOLDER_SKY_COLOR,
    groundColor: PLACEHOLDER_GROUND_COLOR,
    ambientIntensity: 0.65,
    directionalColor: 0xfff3e0,
    directionalIntensity: 1.15,
  },
  dark: {
    skyColor: 0x1c2230,
    groundColor: 0x3a4152,
    ambientIntensity: 0.42,
    directionalColor: 0xdce6ff,
    directionalIntensity: 0.85,
  },
};

const folderBodyGeometry = new THREE.BoxGeometry(
  FOLDER_BODY_SIZE.right,
  FOLDER_BODY_SIZE.up,
  FOLDER_BODY_SIZE.forward
);
const folderTabGeometry = new THREE.BoxGeometry(
  FOLDER_TAB_SIZE.right,
  FOLDER_TAB_SIZE.up,
  FOLDER_TAB_SIZE.forward
);
// Folders are visually identical low-poly buildings: one shared material for
// every instance instead of one per folder.
const folderMaterial = new THREE.MeshStandardMaterial({
  color: FOLDER_COLOR,
  roughness: 0.75,
  metalness: 0.05,
  flatShading: true,
});

const coursePlatformGeometry = new THREE.BoxGeometry(
  COURSE_PLATFORM_SIZE.right,
  COURSE_PLATFORM_SIZE.up,
  COURSE_PLATFORM_SIZE.forward
);
// A distinct neutral tone from the folders' blue: signals "this is just a
// stepping stone", not a collectible-bearing folder.
const coursePlatformMaterial = new THREE.MeshStandardMaterial({
  color: COURSE_PLATFORM_COLOR,
  roughness: 0.8,
  metalness: 0.05,
  flatShading: true,
});

// Planar (right, forward) position at the given distance along the course.
function pointAlongCourse(distance) {
  return {
    right: COURSE_DIRECTION.right * distance,
    forward: COURSE_DIRECTION.forward * distance,
  };
}

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

    // Yaw that turns an object's local "forward" span to point along
    // COURSE_DIRECTION, so a platform/folder's own along-travel half-extent
    // is a plain half-length instead of a diagonal corner distance.
    this.courseYaw = this.basis.forwardToYaw(
      this.basis.fromBasisComponents(COURSE_DIRECTION.right, 0, COURSE_DIRECTION.forward)
    );

    // Distance-along-the-course for each element, spaced so the open-air gap
    // between consecutive footprints is COURSE_AIR_GAP (the entry point has
    // no footprint of its own, hence the 0 below).
    const gapToPlatform1 = COURSE_PLATFORM_ALONG_HALF + COURSE_AIR_GAP;
    const gapToPlatform2 = COURSE_PLATFORM_ALONG_HALF * 2 + COURSE_AIR_GAP;
    const gapToFolder = COURSE_PLATFORM_ALONG_HALF + COURSE_AIR_GAP + FOLDER_ALONG_HALF;
    const entryDistance = COURSE_ENTRY_DISTANCE;
    const platform1Distance = entryDistance + gapToPlatform1;
    const platform2Distance = platform1Distance + gapToPlatform2;
    const folderDistance = platform2Distance + gapToFolder;

    this.courseEntryPlanar = pointAlongCourse(entryDistance);
    this.coursePlatform1Planar = pointAlongCourse(platform1Distance);
    this.coursePlatform2Planar = pointAlongCourse(platform2Distance);
    this.courseFolderPlanar = pointAlongCourse(folderDistance);

    // One checkpoint per gap, at its open-air midpoint (accounting for the
    // differing footprint half-extents on each side) rather than either
    // platform's own center - see getCourseFallCheckpoints().
    this.courseFallCheckpoints = [
      {
        planar: pointAlongCourse(entryDistance + (gapToPlatform1 - COURSE_PLATFORM_ALONG_HALF) / 2),
        height: COURSE_PLATFORM_1_HEIGHT,
      },
      {
        planar: pointAlongCourse(platform1Distance + gapToPlatform2 / 2),
        height: COURSE_PLATFORM_2_HEIGHT,
      },
      {
        planar: pointAlongCourse(platform2Distance + (gapToFolder + COURSE_PLATFORM_ALONG_HALF - FOLDER_ALONG_HALF) / 2),
        height: FOLDER_BODY_SIZE.up,
      },
    ];

    const courseKeepoutPoints = [this.coursePlatform1Planar, this.coursePlatform2Planar, this.courseFolderPlanar];

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
    this.createCourse();
    this.scene.add(this.group);
    return this;
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
      color: this.wallpaperTexture ? 0xffffff : this.palette.groundColor,
      map: this.wallpaperTexture,
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

    const body = new THREE.Mesh(folderBodyGeometry, folderMaterial);
    body.position.copy(this.basis.fromBasisComponents(0, FOLDER_BODY_SIZE.up * 0.5, 0));
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const tab = new THREE.Mesh(folderTabGeometry, folderMaterial);
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

  createCoursePlatformMesh() {
    const mesh = new THREE.Mesh(coursePlatformGeometry, coursePlatformMaterial);
    mesh.quaternion.copy(this.folderRotation(this.courseYaw));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.add(createContactShadow({ radius: FOLDER_SHADOW_RADIUS, basis: this.basis }));
    return mesh;
  }

  // Easy jump course, in the continuity of the desktop (no separate scene or
  // teleport): two stepping platforms at increasing height, then one extra
  // folder standing normally on the ground whose roof - one more easy hop up
  // - holds the final fragment.
  createCourse() {
    const platform1 = this.createCoursePlatformMesh();
    platform1.position.copy(this.basis.fromBasisComponents(
      this.coursePlatform1Planar.right,
      this.floorUp + COURSE_PLATFORM_1_HEIGHT - COURSE_PLATFORM_SIZE.up * 0.5,
      this.coursePlatform1Planar.forward
    ));
    this.group.add(platform1);

    const platform2 = this.createCoursePlatformMesh();
    platform2.position.copy(this.basis.fromBasisComponents(
      this.coursePlatform2Planar.right,
      this.floorUp + COURSE_PLATFORM_2_HEIGHT - COURSE_PLATFORM_SIZE.up * 0.5,
      this.coursePlatform2Planar.forward
    ));
    this.group.add(platform2);

    const courseFolder = this.createFolderMesh();
    courseFolder.position.copy(this.basis.fromBasisComponents(
      this.courseFolderPlanar.right,
      this.floorUp,
      this.courseFolderPlanar.forward
    ));
    courseFolder.quaternion.copy(this.folderRotation(this.courseYaw));
    this.group.add(courseFolder);
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
  // and from each other, never inside a folder or the course footprint (same
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

  // Ground point just before the first platform: where a missed jump sends
  // the player back to.
  getCourseEntryPoint() {
    return this.basis.fromBasisComponents(this.courseEntryPlanar.right, this.floorUp, this.courseEntryPlanar.forward);
  }

  // Roof of the final folder, where the last fragment sits (PickupObject
  // floats it a bit further above whatever height it's given).
  getCourseFragmentPosition() {
    return this.basis.fromBasisComponents(
      this.courseFolderPlanar.right,
      this.floorUp + FOLDER_BODY_SIZE.up,
      this.courseFolderPlanar.forward
    );
  }

  // One checkpoint per jump of the course, at each gap's open-air midpoint
  // and the far platform's expected height: used to detect a missed jump
  // (player fallen well below that height while still over the gap) and
  // send them back to getCourseEntryPoint().
  getCourseFallCheckpoints() {
    return this.courseFallCheckpoints.map(({ planar, height }) => ({
      position: this.basis.fromBasisComponents(planar.right, this.floorUp + height, planar.forward),
      captureRadius: COURSE_FALL_CAPTURE_RADIUS,
    }));
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

    const coursePlatforms = [
      { planar: this.coursePlatform1Planar, height: COURSE_PLATFORM_1_HEIGHT },
      { planar: this.coursePlatform2Planar, height: COURSE_PLATFORM_2_HEIGHT },
    ];
    for (const platform of coursePlatforms) {
      const platformBox = {
        right: platform.planar.right,
        up: this.floorUp + platform.height - COURSE_PLATFORM_SIZE.up * 0.5,
        forward: platform.planar.forward,
        spanRight: COURSE_PLATFORM_SIZE.right,
        spanUp: COURSE_PLATFORM_SIZE.up,
        spanForward: COURSE_PLATFORM_SIZE.forward,
      };
      this.physicsColliders.push(
        this.createStaticCuboidCollider(platformBox, this.folderRotation(this.courseYaw), FOLDER_COLLIDER_FRICTION)
      );
    }

    const courseFolderBox = {
      right: this.courseFolderPlanar.right,
      up: this.floorUp + FOLDER_BODY_SIZE.up * 0.5,
      forward: this.courseFolderPlanar.forward,
      spanRight: FOLDER_BODY_SIZE.right,
      spanUp: FOLDER_BODY_SIZE.up,
      spanForward: FOLDER_BODY_SIZE.forward,
    };
    this.physicsColliders.push(
      this.createStaticCuboidCollider(courseFolderBox, this.folderRotation(this.courseYaw), FOLDER_COLLIDER_FRICTION)
    );

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
  }

  dispose() {
    this.disposePhysicsColliders();
    disposeObject3D(this.group);
  }
}
