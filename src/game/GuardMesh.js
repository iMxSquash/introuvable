import * as THREE from 'three';
import { DEFAULT_WORLD_BASIS } from '../modules/math/WorldBasis.js';
import { createContactShadow } from './ContactShadow.js';

const SQUIRCLE_SIZE = 2.0;
const SQUIRCLE_CORNER_RADIUS = 0.5;
// Thick enough to still read as a chunky icon block edge-on, not a thin
// sliver, when a guard happens to be walking toward/away from the camera.
const SQUIRCLE_THICKNESS = 1.15;
const GUARD_COLOR = 0xd9534f;
const GUARD_SHADOW_RADIUS = 1.5;

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

// Every guard looks identical: one shared geometry/material for all instances.
const squircleGeometry = new THREE.ExtrudeGeometry(buildSquircleShape(SQUIRCLE_SIZE, SQUIRCLE_CORNER_RADIUS), {
  depth: SQUIRCLE_THICKNESS,
  bevelEnabled: true,
  bevelThickness: 0.06,
  bevelSize: 0.06,
  bevelSegments: 2,
  curveSegments: 8,
});
squircleGeometry.translate(0, 0, -SQUIRCLE_THICKNESS * 0.5);

const squircleMaterial = new THREE.MeshStandardMaterial({
  color: GUARD_COLOR,
  roughness: 0.5,
  metalness: 0.15,
});

export function createGuardModel(basis = DEFAULT_WORLD_BASIS) {
  const mesh = new THREE.Mesh(squircleGeometry, squircleMaterial);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  // Kept separate from the contact shadow so an idle "breathing" scale
  // animation can target just the body, not the grounded shadow decal.
  const visual = new THREE.Group();
  visual.name = 'GuardVisual';
  visual.add(mesh);

  const model = new THREE.Group();
  model.name = 'GuardModel';
  model.userData.visual = visual;
  model.add(visual, createContactShadow({ radius: GUARD_SHADOW_RADIUS, basis }));
  return model;
}
