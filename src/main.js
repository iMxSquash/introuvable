import RAPIER from '@dimforge/rapier3d-compat';
import { PCFSoftShadowMap, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import { DEFAULT_WORLD_BASIS } from './modules/math/WorldBasis.js';
import { Clock } from './modules/math/TimeUtils.js';
import { clamp } from './modules/math/ScalarUtils.js';
import { DesktopEnvironment } from './game/DesktopEnvironment.js';

const WORLD_SIZE = 70;
const GRAVITY_MAGNITUDE = 9.81;
// Cap the frame delta so a backgrounded tab does not produce a huge physics step.
const MAX_DELTA_SECONDS = 0.1;
const CAMERA_FOV_DEGREES = 50;
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 500;
const MAX_PIXEL_RATIO = 2;
const CAMERA_OFFSET = { right: 0, up: 30, forward: -28 };

const basis = DEFAULT_WORLD_BASIS;

function createRenderer(canvas) {
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  return renderer;
}

function createCamera(lookAtTarget) {
  const camera = new PerspectiveCamera(
    CAMERA_FOV_DEGREES,
    window.innerWidth / window.innerHeight,
    CAMERA_NEAR,
    CAMERA_FAR
  );
  camera.position.copy(lookAtTarget.clone().add(
    basis.fromBasisComponents(CAMERA_OFFSET.right, CAMERA_OFFSET.up, CAMERA_OFFSET.forward)
  ));
  camera.lookAt(lookAtTarget);
  return camera;
}

async function createPhysicsWorld() {
  await RAPIER.init();
  const gravity = basis.downVector().multiplyScalar(GRAVITY_MAGNITUDE);
  return new RAPIER.World(gravity);
}

function start({ renderer, scene, camera, physicsWorld }) {
  const clock = new Clock();
  let previousSeconds = clock.nowSeconds();

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

    physicsWorld.timestep = deltaSeconds;
    physicsWorld.step();

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

start({
  renderer: createRenderer(document.getElementById('game-canvas')),
  scene,
  camera: createCamera(new Vector3(playerSpawn.x, playerSpawn.y, playerSpawn.z)),
  physicsWorld,
});
