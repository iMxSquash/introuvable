import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createContactShadow } from './ContactShadow.js';

const FOLDER_MODEL_URL = '/models/icon_folder.glb';
const FOLDER_SHADOW_RADIUS = 3.2;

let gltfLoader = null;
let folderGltfPromise = null;

// Cached across calls: every folder instance (desktop grid + course ends)
// shares the same loaded GLTF, same technique as CursorMesh.js.
function loadFolderGltf() {
  if (!folderGltfPromise) {
    gltfLoader ??= new GLTFLoader();
    folderGltfPromise = gltfLoader.loadAsync(FOLDER_MODEL_URL);
  }
  return folderGltfPromise;
}

// Modeled in Blender at exact game-unit scale (body 4.4x3.2x3.0, tab
// 1.85x1.6x0.66, see FOLDER_BODY_SIZE/FOLDER_TAB_SIZE in
// DesktopEnvironment.js) with its origin at the ground-contact point, so no
// scale or vertical offset correction is needed here - unlike CursorMesh.js's
// CURSOR_SCALE.
export function createFolderPlatformModel(basis) {
  const model = new THREE.Group();
  model.name = 'FolderPlatformModel';
  model.add(createContactShadow({ radius: FOLDER_SHADOW_RADIUS, basis }));

  loadFolderGltf()
    .then((gltf) => {
      const visual = gltf.scene.clone(true);
      visual.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      model.add(visual);
    })
    .catch((error) => {
      console.error(`Failed to load folder model from ${FOLDER_MODEL_URL}`, error);
    });

  return model;
}
