import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DEFAULT_WORLD_BASIS } from '../modules/math/WorldBasis.js';
import { createContactShadow } from './ContactShadow.js';


const CURSOR_MODEL_URL = '/models/cursor.glb';
// Tuned up from the model's raw export scale, which read too small next to
// the desktop/folders in-game.
const CURSOR_SCALE = 4;
const CURSOR_SHADOW_RADIUS = 1;
// Corrective yaw: the exported model wasn't facing -Z as modeled, off by
// roughly an eighth turn counter-clockwise.
const CURSOR_MODEL_YAW_OFFSET = Math.PI / 4;

let gltfLoader = null;
let cursorGltfPromise = null;

// Cached across calls: createCursorModel() only runs once per game session
// today, but this avoids ever re-fetching the file if that changes.
function loadCursorGltf() {
  if (!cursorGltfPromise) {
    gltfLoader ??= new GLTFLoader();
    cursorGltfPromise = gltfLoader.loadAsync(CURSOR_MODEL_URL);
  }
  return cursorGltfPromise;
}

export function createCursorModel(basis = DEFAULT_WORLD_BASIS) {
  const model = new THREE.Group();
  model.name = 'CursorModel';
  model.add(createContactShadow({ radius: CURSOR_SHADOW_RADIUS, basis }));

  loadCursorGltf()
    .then((gltf) => {
      const visual = gltf.scene;
      visual.scale.setScalar(CURSOR_SCALE);
      visual.rotation.y = CURSOR_MODEL_YAW_OFFSET;
      visual.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      model.add(visual);
    })
    .catch((error) => {
      console.error(`Failed to load cursor model from ${CURSOR_MODEL_URL}`, error);
    });

  return model;
}
