import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const KEYCAP_MODEL_URL = '/models/keycap.glb';
// Modeled in Blender as a unit (1x1) footprint at this exact height - the
// loader scales X/Z per course to match platformSize.right/forward (same
// role the old buildRoundedPlatformGeometry(width, forwardSpan, ...) params
// played), and Y by however platformSize.up differs from this reference.
const KEYCAP_MODEL_HEIGHT = 0.5;
// Backlit glow for moving keys, read at a glance against the static keys'
// matte white - like a lit keyboard key drawing the eye to what moves.
const KEYCAP_MOVING_EMISSIVE = 0x8ec9ff;
const KEYCAP_MOVING_EMISSIVE_INTENSITY = 0.6;

let gltfLoader = null;
let keycapGltfPromise = null;

// Cached across calls: every platform in every course shares the same
// loaded GLTF, same technique as CursorMesh.js/FolderPlatformMesh.js.
function loadKeycapGltf() {
  if (!keycapGltfPromise) {
    gltfLoader ??= new GLTFLoader();
    keycapGltfPromise = gltfLoader.loadAsync(KEYCAP_MODEL_URL);
  }
  return keycapGltfPromise;
}

export function createKeycapPlatformModel({ size, moving = false }) {
  const model = new THREE.Group();
  model.name = 'KeycapPlatformModel';

  loadKeycapGltf()
    .then((gltf) => {
      const visual = gltf.scene.clone(true);
      visual.scale.set(size.right, size.up / KEYCAP_MODEL_HEIGHT, size.forward);
      visual.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow = true;
        child.receiveShadow = true;
        if (moving) {
          // Clone before mutating - clone(true) shares material references
          // with every other instance loaded from the same cached GLTF, so
          // an in-place edit here would light up every static key too.
          child.material = child.material.clone();
          child.material.emissive = new THREE.Color(KEYCAP_MOVING_EMISSIVE);
          child.material.emissiveIntensity = KEYCAP_MOVING_EMISSIVE_INTENSITY;
        }
      });
      model.add(visual);
    })
    .catch((error) => {
      console.error(`Failed to load keycap model from ${KEYCAP_MODEL_URL}`, error);
    });

  return model;
}
