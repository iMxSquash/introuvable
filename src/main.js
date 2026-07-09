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
import { GameProgress } from './game/GameProgress.js';
import { RestorationCinematic } from './game/RestorationCinematic.js';
import { createFinderWindow } from './game/FinderWindow.js';
import { createStartScreen } from './game/StartScreen.js';
import { createTouchJoystick } from './game/TouchJoystick.js';
import { createTouchJumpButton } from './game/TouchJumpButton.js';

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

// How far below a gap's expected floor height the player must fall before
// it counts as a missed jump (as opposed to still mid-air crossing it).
const COURSE_FALL_TOLERANCE = 1.5;
// Avoids re-triggering the reset teleport for a couple of frames while the
// player is still settling at the course entry point.
const COURSE_RESET_COOLDOWN_MS = 800;

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
const JUMP_KEY_CODE = 'Space';

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
  const keyboard = { forward: 0, backward: 0, left: 0, right: 0, jump: 0 };

  function setAxis(code, value) {
    const axis = KEY_TO_MOVE_AXIS[code];
    if (axis) keyboard[axis] = value;
  }

  window.addEventListener('keydown', (event) => {
    setAxis(event.code, 1);
    if (event.code === JUMP_KEY_CODE) {
      keyboard.jump = 1;
      // Prevent the page from scrolling on Space while the game is played.
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    setAxis(event.code, 0);
    if (event.code === JUMP_KEY_CODE) keyboard.jump = 0;
  });
  window.addEventListener('blur', () => {
    keyboard.forward = 0;
    keyboard.backward = 0;
    keyboard.left = 0;
    keyboard.right = 0;
    keyboard.jump = 0;
  });

  return keyboard;
}

// Combines the keyboard state with the mobile/tablet on-screen joystick and
// jump button (both share the same forward/backward/left/right/jump shape)
// so either input source alone is enough to move and jump.
function combineMoveInputs(keyboard, joystickAxes, touchJumpButton) {
  return {
    forward: Math.max(keyboard.forward, joystickAxes.forward),
    backward: Math.max(keyboard.backward, joystickAxes.backward),
    left: Math.max(keyboard.left, joystickAxes.left),
    right: Math.max(keyboard.right, joystickAxes.right),
    jump: Math.max(keyboard.jump, touchJumpButton.pressed ? 1 : 0),
  };
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

function pointerEventToNdc(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
    y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
  };
}

// Watches the desktop's jump course (built in DesktopEnvironment, in the
// continuity of the world - no separate scene, no teleport to get there):
// a missed jump is the player sunk well below a gap's expected floor height
// while still over it, which sends them back to the course entry. No
// fragment loss, matching the project's "never frustrating" philosophy.
function createCourseFallRecovery({ environment, playerCursor, basis }) {
  const checkpoints = environment.getCourseFallCheckpoints();
  let lastResetAtMs = -Infinity;
  let pendingCameraSnap = false;

  function checkFallThrough(nowMs) {
    if (nowMs - lastResetAtMs < COURSE_RESET_COOLDOWN_MS) return;

    const playerPosition = playerCursor.position;
    for (const checkpoint of checkpoints) {
      const distanceSq = basis.distanceSqPlanar(playerPosition, checkpoint.position);
      if (distanceSq > checkpoint.captureRadius * checkpoint.captureRadius) continue;

      const heightBelowFloor = basis.upComponent(checkpoint.position) - basis.upComponent(playerPosition);
      if (heightBelowFloor >= COURSE_FALL_TOLERANCE) {
        playerCursor.teleportTo(environment.getCourseEntryPoint());
        lastResetAtMs = nowMs;
        pendingCameraSnap = true;
        break;
      }
    }
  }

  return {
    consumeCameraSnap() {
      const shouldSnap = pendingCameraSnap;
      pendingCameraSnap = false;
      return shouldSnap;
    },

    update(nowMs) {
      checkFallThrough(nowMs);
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
  courseFallRecovery,
  cinematic,
  isGameEnded,
}) {
  const clock = new Clock();
  let previousSeconds = clock.nowSeconds();
  let firstFrame = true;

  const keyboard = createKeyboardState();
  const touchJoystick = createTouchJoystick();
  const touchJumpButton = createTouchJumpButton();
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
    // jump course, click-to-move) and let only the restoration cinematic play.
    if (!isGameEnded()) {
      const moveInput = combineMoveInputs(keyboard, touchJoystick.axes, touchJumpButton);
      playerCursor.update({ deltaSeconds, keyboard: moveInput });
      courseFallRecovery.update(performance.now());
      // Read the position fresh: courseFallRecovery.update() may have just
      // teleported the player back to the course entry after a missed jump.
      const playerPosition = playerCursor.position;

      cameraRig.step({
        targetPosition: playerPosition,
        deltaSeconds,
        camera,
        snapToTarget: firstFrame || courseFallRecovery.consumeCameraSnap(),
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

const courseFallRecovery = createCourseFallRecovery({ environment, playerCursor, basis });

const fragmentSystem = new FragmentSystem({
  scene,
  environment,
  basis,
  playerSpawnPosition: playerSpawn,
  finalFragmentPosition: environment.getCourseFragmentPosition(),
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
      courseFallRecovery,
      cinematic,
      isGameEnded: () => gameEnded,
    });
  },
});
