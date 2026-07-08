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

const WORLD_SIZE = 70;
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

function pointerEventToNdc(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
    y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
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

function start({ renderer, scene, camera, playerCursor, environment }) {
  const clock = new Clock();
  let previousSeconds = clock.nowSeconds();
  let firstFrame = true;

  const keyboard = createKeyboardState();
  const cameraRig = new PositionFollowCameraRig({ ...CAMERA_RIG_OPTIONS, basis });
  const clickToMove = setupClickToMove({
    canvas: renderer.domElement,
    camera,
    playerCursor,
    environment,
    scene,
    basis,
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  });

  function frame() {
    const nowSeconds = clock.nowSeconds();
    const deltaSeconds = clamp(nowSeconds - previousSeconds, 0, MAX_DELTA_SECONDS);
    previousSeconds = nowSeconds;

    const snapshot = playerCursor.update({ deltaSeconds, keyboard });
    cameraRig.step({
      targetPosition: snapshot.position,
      deltaSeconds,
      camera,
      snapToTarget: firstFrame,
    });
    firstFrame = false;

    clickToMove.update(deltaSeconds);

    // No explicit physicsWorld.step() here: PlayerCursor.update() already steps
    // the world once per frame via KinematicBatchResolver.resolveQueuedMoves().
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

const physicsWorld = await createPhysicsWorld();

const scene = new Scene();
const environment = new DesktopEnvironment({ scene, worldSize: WORLD_SIZE, basis });
environment.create();
environment.createPhysicsColliders(physicsWorld, RAPIER);

const playerSpawn = environment.samplePlayerSpawn();
const playerCursor = new PlayerCursor({
  scene,
  physicsWorld,
  rapier: RAPIER,
  basis,
  spawnPosition: playerSpawn,
});

start({
  renderer: createRenderer(document.getElementById('game-canvas')),
  scene,
  camera: createCamera(),
  playerCursor,
  environment,
});
