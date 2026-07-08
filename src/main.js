import RAPIER from '@dimforge/rapier3d-compat';
import {
  AmbientLight,
  Color,
  DirectionalLight,
  Fog,
  Mesh,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { DEFAULT_WORLD_BASIS } from './modules/math/WorldBasis.js';
import { Clock } from './modules/math/TimeUtils.js';
import { clamp } from './modules/math/ScalarUtils.js';

const GROUND_SIZE = 200;
const GRAVITY_MAGNITUDE = 9.81;
// Cap the frame delta so a backgrounded tab does not produce a huge physics step.
const MAX_DELTA_SECONDS = 0.1;
const CAMERA_FOV_DEGREES = 50;
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 500;
const MAX_PIXEL_RATIO = 2;

const basis = DEFAULT_WORLD_BASIS;

function createRenderer(canvas) {
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  return renderer;
}

function createScene() {
  const scene = new Scene();
  scene.background = new Color(0x1d1d1f);
  scene.fog = new Fog(0x1d1d1f, GROUND_SIZE * 0.4, GROUND_SIZE);

  const ambientLight = new AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const directionalLight = new DirectionalLight(0xffffff, 1.2);
  directionalLight.position.copy(basis.fromBasisComponents(30, 60, -20));
  directionalLight.castShadow = true;
  scene.add(directionalLight);

  const ground = new Mesh(
    new PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
    new MeshStandardMaterial({ color: 0x2d6cdf })
  );
  ground.quaternion.copy(basis.threePlaneCanonicalToBasisQuaternion());
  ground.receiveShadow = true;
  scene.add(ground);

  return scene;
}

function createCamera() {
  const camera = new PerspectiveCamera(
    CAMERA_FOV_DEGREES,
    window.innerWidth / window.innerHeight,
    CAMERA_NEAR,
    CAMERA_FAR
  );
  camera.position.copy(basis.fromBasisComponents(0, 25, -25));
  camera.lookAt(new Vector3(0, 0, 0));
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
start({
  renderer: createRenderer(document.getElementById('game-canvas')),
  scene: createScene(),
  camera: createCamera(),
  physicsWorld,
});
