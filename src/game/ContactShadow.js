import * as THREE from 'three';
import { DEFAULT_WORLD_BASIS } from '../modules/math/WorldBasis.js';

const TEXTURE_SIZE = 128;
const SHADOW_PEAK_ALPHA = 0.32;
const GROUND_OFFSET = 0.02;

let sharedTexture = null;
let sharedGeometry = null;

function getSharedTexture() {
  if (sharedTexture) return sharedTexture;

  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const context = canvas.getContext('2d');
  const center = TEXTURE_SIZE * 0.5;
  const gradient = context.createRadialGradient(center, center, 0, center, center, center);
  gradient.addColorStop(0, `rgba(0, 0, 0, ${SHADOW_PEAK_ALPHA})`);
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

  sharedTexture = new THREE.CanvasTexture(canvas);
  return sharedTexture;
}

function getSharedGeometry() {
  if (!sharedGeometry) sharedGeometry = new THREE.PlaneGeometry(2, 2);
  return sharedGeometry;
}

// A soft radial-gradient decal for grounded objects (cursor, folders,
// guards), cheaper and softer-looking than relying solely on the directional
// light's shadow map. Geometry and texture are shared across every instance.
export function createContactShadow({ radius = 1, basis = DEFAULT_WORLD_BASIS } = {}) {
  const mesh = new THREE.Mesh(getSharedGeometry(), new THREE.MeshBasicMaterial({
    map: getSharedTexture(),
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  }));
  mesh.scale.setScalar(radius);
  mesh.quaternion.copy(basis.threePlaneCanonicalToBasisQuaternion());
  mesh.position.copy(basis.fromBasisComponents(0, GROUND_OFFSET, 0));
  mesh.renderOrder = -1;
  return mesh;
}
