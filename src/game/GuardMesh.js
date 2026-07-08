import * as THREE from 'three';

const SQUIRCLE_SIZE = 2.0;
const SQUIRCLE_CORNER_RADIUS = 0.5;
// Thick enough to still read as a chunky icon block edge-on, not a thin
// sliver, when a guard happens to be walking toward/away from the camera.
const SQUIRCLE_THICKNESS = 1.15;
const GUARD_COLOR = 0xd9534f;

function buildSquircleShape(size, cornerRadius) {
  const half = size / 2;
  const r = cornerRadius;
  const shape = new THREE.Shape();
  shape.moveTo(-half + r, -half);
  shape.lineTo(half - r, -half);
  shape.quadraticCurveTo(half, -half, half, -half + r);
  shape.lineTo(half, half - r);
  shape.quadraticCurveTo(half, half, half - r, half);
  shape.lineTo(-half + r, half);
  shape.quadraticCurveTo(-half, half, -half, half - r);
  shape.lineTo(-half, -half + r);
  shape.quadraticCurveTo(-half, -half, -half + r, -half);
  return shape;
}

export function createGuardModel() {
  const geometry = new THREE.ExtrudeGeometry(buildSquircleShape(SQUIRCLE_SIZE, SQUIRCLE_CORNER_RADIUS), {
    depth: SQUIRCLE_THICKNESS,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.06,
    bevelSegments: 2,
    curveSegments: 8,
  });
  geometry.translate(0, 0, -SQUIRCLE_THICKNESS * 0.5);

  const material = new THREE.MeshStandardMaterial({
    color: GUARD_COLOR,
    roughness: 0.5,
    metalness: 0.15,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const model = new THREE.Group();
  model.name = 'GuardModel';
  model.add(mesh);
  return model;
}
