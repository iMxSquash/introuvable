import RAPIER from '@dimforge/rapier3d-compat';
import { PCFSoftShadowMap, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { DEFAULT_WORLD_BASIS } from './modules/math/WorldBasis.js';
import { Clock } from './modules/math/TimeUtils.js';
import { clamp } from './modules/math/ScalarUtils.js';
import { PositionFollowCameraRig } from './modules/camera/PositionFollowCameraRig.js';
import { AimResolver } from './modules/gameplay/AimResolver.js';
import { GroundClickIndicator } from './modules/world/visual-effects/GroundClickIndicator.js';
import { DesktopEnvironment } from './game/DesktopEnvironment.js';
import { PlayerCursor } from './game/PlayerCursor.js';
import { FragmentSystem } from './game/FragmentSystem.js';
import { createHudView } from './game/HudView.js';
import { TrashCanInterior } from './game/TrashCanInterior.js';
import { Guard } from './game/Guard.js';
import { triggerForceQuitEffect } from './game/ForceQuitEffect.js';
import { GameProgress } from './game/GameProgress.js';
import { RestorationCinematic } from './game/RestorationCinematic.js';
import { createFinderWindow } from './game/FinderWindow.js';
import { createStartScreen } from './game/StartScreen.js';

const WORLD_SIZE = 70;
const DEFAULT_FILE_NAME = 'page.html';
const MAX_FILE_NAME_LENGTH = 40;
const GRAVITY_MAGNITUDE = 9.81;
// Cap the frame delta so a backgrounded tab does not produce a huge physics step.
const MAX_DELTA_SECONDS = 0.1;
const CAMERA_FOV_DEGREES = 50;
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 500;
const MAX_PIXEL_RATIO = 2;
const CAMERA_RIG_OPTIONS = {
  azimuth: Math.PI / 4,
  distance: 26,
  height: 32,
  lookHeight: 1.5,
  positionLag: 0.15,
  lookLag: 0.12,
};
// A narrow/portrait viewport (phone, tablet in the portfolio's iOS mode) sees
// less of the world at a given height; pull the camera back and up a bit to
// compensate, per the TODO's "caméra légèrement plus haute" note.
const NARROW_VIEWPORT_MAX_WIDTH = 820;
const NARROW_VIEWPORT_HEIGHT_BONUS = 6;
const NARROW_VIEWPORT_DISTANCE_BONUS = 2;

const THEMES = { light: 'light', dark: 'dark' };

const DESKTOP_GUARD_PATROL_RADIUS = 10;
const DESKTOP_GUARD_WAYPOINT_COUNT = 8;
const DESKTOP_GUARD_SPEED = 3;
const DESKTOP_GUARD_CATCH_RADIUS = 2.6;
// Two guard-free arcs and a mid-gap: [0, 0.10], [0.42, 0.55], [0.90, 1] of a full turn.
const INTERIOR_GUARD_ARCS = [
  [0.10, 0.42],
  [0.55, 0.90],
];
const INTERIOR_GUARD_WAYPOINTS_PER_ARC = 4;
const INTERIOR_GUARD_SPEED = 2.5;
const INTERIOR_GUARD_CATCH_RADIUS = 2.2;
const ZONE_ENTER_RADIUS = 5;
const ZONE_REARM_RADIUS = ZONE_ENTER_RADIUS + 2;
const ZONE_TRANSITION_COOLDOWN_MS = 1200;

const KEY_TO_MOVE_AXIS = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'backward',
  ArrowDown: 'backward',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
};

const basis = DEFAULT_WORLD_BASIS;

function createRenderer(canvas) {
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  return renderer;
}

function createCamera() {
  return new PerspectiveCamera(
    CAMERA_FOV_DEGREES,
    window.innerWidth / window.innerHeight,
    CAMERA_NEAR,
    CAMERA_FAR
  );
}

async function createPhysicsWorld() {
  await RAPIER.init();
  const gravity = basis.downVector().multiplyScalar(GRAVITY_MAGNITUDE);
  return new RAPIER.World(gravity);
}

function createKeyboardState() {
  const keyboard = { forward: 0, backward: 0, left: 0, right: 0 };

  function setAxis(code, value) {
    const axis = KEY_TO_MOVE_AXIS[code];
    if (axis) keyboard[axis] = value;
  }

  window.addEventListener('keydown', (event) => setAxis(event.code, 1));
  window.addEventListener('keyup', (event) => setAxis(event.code, 0));
  window.addEventListener('blur', () => {
    keyboard.forward = 0;
    keyboard.backward = 0;
    keyboard.left = 0;
    keyboard.right = 0;
  });

  return keyboard;
}

// Integration contract with the portfolio's `?path=` query param: max length,
// safe character allowlist, fallback to a default name for anything else
// (missing param, empty slug, unicode-only slug, injection attempts...).
function getRequestedFileName() {
  const rawPath = new URLSearchParams(window.location.search).get('path');
  if (!rawPath) return DEFAULT_FILE_NAME;

  const lastSegment = rawPath.split('/').filter(Boolean).pop() ?? '';
  const safeSegment = lastSegment.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, MAX_FILE_NAME_LENGTH);
  return safeSegment || DEFAULT_FILE_NAME;
}

// Optional `?theme=dark|light` contract so the portfolio can match its own
// theme; anything else (missing, garbage) keeps the game's own default look.
function getRequestedTheme() {
  const rawTheme = new URLSearchParams(window.location.search).get('theme');
  return rawTheme === THEMES.dark ? THEMES.dark : THEMES.light;
}

function getCameraRigOptions() {
  const isNarrowViewport = window.innerWidth < NARROW_VIEWPORT_MAX_WIDTH;
  return {
    ...CAMERA_RIG_OPTIONS,
    height: CAMERA_RIG_OPTIONS.height + (isNarrowViewport ? NARROW_VIEWPORT_HEIGHT_BONUS : 0),
    distance: CAMERA_RIG_OPTIONS.distance + (isNarrowViewport ? NARROW_VIEWPORT_DISTANCE_BONUS : 0),
  };
}

function buildCirclePatrol({ center, radius, count, angleOffset, floorUp, basis }) {
  const waypoints = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2 + angleOffset;
    waypoints.push(basis.fromBasisComponents(
      center.right + radius * Math.cos(angle),
      floorUp,
      center.forward + radius * Math.sin(angle)
    ));
  }
  return waypoints;
}

// Turns a one-way path into a closed loop that walks it forward then back,
// so a plain closed-loop WaypointProgressTracker yields a back-and-forth patrol.
function buildPingPongWaypoints(points) {
  return [...points, ...points.slice(1, -1).reverse()];
}

function createDesktopGuards({ scene, environment, basis }) {
  const center = environment.trashCanPlanar;
  return [0, Math.PI].map((angleOffset) => new Guard({
    scene,
    basis,
    maxSpeed: DESKTOP_GUARD_SPEED,
    catchRadius: DESKTOP_GUARD_CATCH_RADIUS,
    waypoints: buildCirclePatrol({
      center,
      radius: DESKTOP_GUARD_PATROL_RADIUS,
      count: DESKTOP_GUARD_WAYPOINT_COUNT,
      angleOffset,
      floorUp: environment.floorUp,
      basis,
    }),
  }));
}

function createInteriorGuards({ scene, trashCanInterior, basis }) {
  return INTERIOR_GUARD_ARCS.map(([startRatio, endRatio]) => new Guard({
    scene,
    basis,
    maxSpeed: INTERIOR_GUARD_SPEED,
    catchRadius: INTERIOR_GUARD_CATCH_RADIUS,
    waypoints: buildPingPongWaypoints(
      trashCanInterior.getArcWaypoints(startRatio, endRatio, INTERIOR_GUARD_WAYPOINTS_PER_ARC)
    ),
  }));
}

function pointerEventToNdc(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
    y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
  };
}

// Guards the Trash Can: 2 patrol its desktop entry ring, 2 patrol the spiral
// inside. Contact sends the player back to the main spawn (Force Quit effect,
// no fragment loss); walking onto the entry ring/spiral top transitions zones.
function createTrashCanChallenge({ scene, environment, playerCursor, playerSpawn, basis }) {
  const trashCanInterior = new TrashCanInterior({
    scene,
    trashCanPlanar: environment.trashCanPlanar,
    floorUp: environment.floorUp,
    basis,
  });
  trashCanInterior.create();

  const desktopGuards = createDesktopGuards({ scene, environment, basis });
  const interiorGuards = createInteriorGuards({ scene, trashCanInterior, basis });

  let zone = 'desktop';
  let lastTransitionAtMs = -Infinity;
  let pendingCameraSnap = false;
  // A transition disarms itself until the player walks away from where it
  // just dropped them - otherwise standing still on the entry/exit point
  // would flip zones again as soon as the cooldown below expires.
  let transitionArmed = true;
  let lastDestination = null;

  function inCooldown(nowMs) {
    return nowMs - lastTransitionAtMs < ZONE_TRANSITION_COOLDOWN_MS;
  }

  function transitionTo(nextZone, destination, nowMs) {
    playerCursor.teleportTo(destination);
    zone = nextZone;
    lastTransitionAtMs = nowMs;
    pendingCameraSnap = true;
    transitionArmed = false;
    lastDestination = destination.clone();
  }

  function updateArming() {
    if (transitionArmed || !lastDestination) return;
    if (playerCursor.position.distanceTo(lastDestination) > ZONE_REARM_RADIUS) transitionArmed = true;
  }

  function checkZoneTransition(nowMs) {
    if (!transitionArmed || inCooldown(nowMs)) return;

    if (zone === 'desktop') {
      const playerPlanar = basis.toPlanar(playerCursor.position);
      const distance = Math.hypot(
        playerPlanar.right - trashCanInterior.center.right,
        playerPlanar.forward - trashCanInterior.center.forward
      );
      if (distance <= ZONE_ENTER_RADIUS) transitionTo('interior', trashCanInterior.getEntryPoint(), nowMs);
    } else {
      const distance = playerCursor.position.distanceTo(trashCanInterior.getEntryPoint());
      if (distance <= ZONE_ENTER_RADIUS) transitionTo('desktop', environment.trashCanPosition, nowMs);
    }
  }

  function checkGuardContact(nowMs) {
    if (inCooldown(nowMs)) return;

    const activeGuards = zone === 'desktop' ? desktopGuards : interiorGuards;
    const catchRadius = zone === 'desktop' ? DESKTOP_GUARD_CATCH_RADIUS : INTERIOR_GUARD_CATCH_RADIUS;
    const playerPosition = playerCursor.position;

    for (const guard of activeGuards) {
      const distanceSq = basis.distanceSqPlanar(playerPosition, guard.position);
      if (distanceSq <= catchRadius * catchRadius) {
        triggerForceQuitEffect();
        transitionTo('desktop', playerSpawn, nowMs);
        break;
      }
    }
  }

  return {
    trashCanInterior,

    createPhysicsColliders(world, rapier) {
      trashCanInterior.createPhysicsColliders(world, rapier);
    },

    consumeCameraSnap() {
      const shouldSnap = pendingCameraSnap;
      pendingCameraSnap = false;
      return shouldSnap;
    },

    update(deltaSeconds, nowMs) {
      for (const guard of desktopGuards) guard.update(deltaSeconds, desktopGuards);
      for (const guard of interiorGuards) guard.update(deltaSeconds, interiorGuards);

      updateArming();
      checkZoneTransition(nowMs);
      checkGuardContact(nowMs);
    },
  };
}

function setupClickToMove({ canvas, camera, playerCursor, environment, scene, basis }) {
  const aimResolver = new AimResolver({ basis });
  const clickIndicators = [];

  canvas.addEventListener('pointerdown', (event) => {
    const ndc = pointerEventToNdc(event, canvas);
    const aim = aimResolver.getAimFromCamera({
      camera,
      crosshairNdc: ndc,
      launchPosition: playerCursor.position,
      objects: environment.getRaycastTargets(),
    });
    if (!aim.hasHit) return;

    playerCursor.setMoveTarget(aim.hitPosition);
    const indicator = new GroundClickIndicator({ position: aim.hitPosition, basis });
    scene.add(indicator.group);
    clickIndicators.push(indicator);
  });

  return {
    update(deltaSeconds) {
      for (let i = clickIndicators.length - 1; i >= 0; i -= 1) {
        const indicator = clickIndicators[i];
        if (!indicator.step(deltaSeconds)) {
          indicator.dispose();
          clickIndicators.splice(i, 1);
        }
      }
    },
  };
}

function start({
  renderer,
  scene,
  camera,
  playerCursor,
  environment,
  fragmentSystem,
  trashCanChallenge,
  cinematic,
  isGameEnded,
}) {
  const clock = new Clock();
  let previousSeconds = clock.nowSeconds();
  let firstFrame = true;

  const keyboard = createKeyboardState();
  const cameraRig = new PositionFollowCameraRig({ ...getCameraRigOptions(), basis });
  const clickToMove = setupClickToMove({
    canvas: renderer.domElement,
    camera,
    playerCursor,
    environment,
    scene,
    basis,
  });

  // rAF-throttled: the portfolio embeds this in a continuously resizable
  // desktop window, which fires many resize events per drag. Coalescing to
  // one update per rendered frame avoids redundant framebuffer reallocations
  // without the visible lag a timeout-based debounce would add here (the
  // canvas should keep visually tracking the window during the drag).
  let resizePending = false;
  window.addEventListener('resize', () => {
    if (resizePending) return;
    resizePending = true;
    requestAnimationFrame(() => {
      resizePending = false;
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    });
  });

  function frame() {
    const nowSeconds = clock.nowSeconds();
    const deltaSeconds = clamp(nowSeconds - previousSeconds, 0, MAX_DELTA_SECONDS);
    previousSeconds = nowSeconds;

    // Once the last fragment is restored, freeze normal gameplay (movement,
    // guards, click-to-move) and let only the restoration cinematic play.
    if (!isGameEnded()) {
      playerCursor.update({ deltaSeconds, keyboard });
      trashCanChallenge.update(deltaSeconds, performance.now());
      // Read the position fresh: trashCanChallenge.update() may have just
      // teleported the player (zone transition or Force Quit).
      const playerPosition = playerCursor.position;

      cameraRig.step({
        targetPosition: playerPosition,
        deltaSeconds,
        camera,
        snapToTarget: firstFrame || trashCanChallenge.consumeCameraSnap(),
      });
      firstFrame = false;

      clickToMove.update(deltaSeconds);
      fragmentSystem.update(deltaSeconds, playerPosition);
    }
    cinematic.update(deltaSeconds);

    // No explicit physicsWorld.step() here: PlayerCursor.update() already steps
    // the world once per frame via KinematicBatchResolver.resolveQueuedMoves().
    renderer.render(scene, camera);
    rafHandle = requestAnimationFrame(frame);
  }

  // This is a 404 page: it may be left open in a background tab indefinitely.
  // Stop rendering entirely while hidden instead of burning GPU/battery, and
  // avoid one huge clamped delta by resetting the clock on resume.
  let rafHandle = requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (rafHandle != null) cancelAnimationFrame(rafHandle);
      rafHandle = null;
    } else if (rafHandle == null) {
      previousSeconds = clock.nowSeconds();
      rafHandle = requestAnimationFrame(frame);
    }
  });
}

const theme = getRequestedTheme();
document.documentElement.dataset.theme = theme;

const physicsWorld = await createPhysicsWorld();

const scene = new Scene();
const environment = new DesktopEnvironment({ scene, worldSize: WORLD_SIZE, basis, theme });
environment.create();
environment.createPhysicsColliders(physicsWorld, RAPIER);

const playerSpawn = environment.samplePlayerSpawn();
const playerCursor = new PlayerCursor({
  scene,
  physicsWorld,
  rapier: RAPIER,
  basis,
  spawnPosition: playerSpawn,
  // Keyboard/joystick input is expressed as basis forward/right; rotate it by
  // the isometric camera's azimuth so "forward" moves the cursor away from
  // the camera on screen instead of along a world axis that reads diagonal.
  cameraAzimuth: CAMERA_RIG_OPTIONS.azimuth,
});

const trashCanChallenge = createTrashCanChallenge({ scene, environment, playerCursor, playerSpawn, basis });
trashCanChallenge.createPhysicsColliders(physicsWorld, RAPIER);

const fragmentSystem = new FragmentSystem({
  scene,
  environment,
  basis,
  playerSpawnPosition: playerSpawn,
  finalFragmentPosition: trashCanChallenge.trashCanInterior.getFragmentPosition(),
  fileName: getRequestedFileName(),
});
createHudView({
  uiState: fragmentSystem.uiState,
  notifications: fragmentSystem.notifications,
  fileName: fragmentSystem.fileName,
});

const gameProgress = new GameProgress();
const cinematic = new RestorationCinematic({ scene, basis });

let gameEnded = false;
let gameStartAtMs = null;

fragmentSystem.uiState.subscribe((state) => {
  if (gameEnded || state.collectedCount < state.totalCount) return;
  gameEnded = true;

  const elapsedMs = gameStartAtMs == null ? 0 : performance.now() - gameStartAtMs;
  cinematic.play(playerCursor.position, () => {
    gameProgress.recordRestoration(elapsedMs);
    createFinderWindow({ fileName: fragmentSystem.fileName }).show();
  });
});

createStartScreen({
  restoredCount: gameProgress.getRestoredCount(),
  bestTimeMs: gameProgress.getBestTimeMs(),
  onStart() {
    gameStartAtMs = performance.now();
    start({
      renderer: createRenderer(document.getElementById('game-canvas')),
      scene,
      camera: createCamera(),
      playerCursor,
      environment,
      fragmentSystem,
      trashCanChallenge,
      cinematic,
      isGameEnded: () => gameEnded,
    });
  },
});
