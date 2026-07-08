import * as THREE from 'three';
import { DEFAULT_WORLD_BASIS } from '../modules/math/WorldBasis.js';
import { OFF_WHITE } from './Palette.js';
import { createContactShadow } from './ContactShadow.js';

// macOS-style arrow pointer silhouette, tip at the local origin, tail trailing
// toward -Y. Extruded along Z then rotated so the tip ends up on local -Z,
// matching GeneralObjectModelController's default forward axis.
const ARROW_POINTS = [
  [0, 0],
  [0, -1.3],
  [0.28, -1.02],
  [0.5, -1.55],
  [0.68, -1.3],
  [0.34, -0.78],
  [0.62, -0.42],
];

const CURSOR_SCALE = 1.6;
const CURSOR_THICKNESS = 0.4;
const CURSOR_OUTLINE_SCALE = 1.16;
const CURSOR_OUTLINE_MARGIN = 0.05;
const CURSOR_TILT_RADIANS = -0.32;
const CURSOR_SHADOW_RADIUS = 1.1;
const FILL_COLOR = 0x1d1d1f;
const OUTLINE_COLOR = OFF_WHITE;

function buildArrowShape(scale) {
  const shape = new THREE.Shape();
  ARROW_POINTS.forEach(([x, y], index) => {
    const point = [x * scale, y * scale];
    if (index === 0) shape.moveTo(point[0], point[1]);
    else shape.lineTo(point[0], point[1]);
  });
  shape.closePath();
  return shape;
}

function buildArrowGeometry(scale, depth, verticalOffset = 0) {
  const geometry = new THREE.ExtrudeGeometry(buildArrowShape(scale), {
    depth,
    bevelEnabled: false,
    curveSegments: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  if (verticalOffset !== 0) geometry.translate(0, verticalOffset, 0);
  return geometry;
}

export function createCursorModel(basis = DEFAULT_WORLD_BASIS) {
  const fillGeometry = buildArrowGeometry(CURSOR_SCALE, CURSOR_THICKNESS);
  const fillMaterial = new THREE.MeshStandardMaterial({
    color: FILL_COLOR,
    roughness: 0.35,
    metalness: 0.1,
  });
  const fillMesh = new THREE.Mesh(fillGeometry, fillMaterial);
  fillMesh.castShadow = true;

  const outlineGeometry = buildArrowGeometry(
    CURSOR_SCALE * CURSOR_OUTLINE_SCALE,
    CURSOR_THICKNESS + CURSOR_OUTLINE_MARGIN * 2,
    -CURSOR_OUTLINE_MARGIN
  );
  const outlineMaterial = new THREE.MeshStandardMaterial({
    color: OUTLINE_COLOR,
    roughness: 0.6,
    metalness: 0,
  });
  const outlineMesh = new THREE.Mesh(outlineGeometry, outlineMaterial);
  outlineMesh.castShadow = true;

  const visual = new THREE.Group();
  visual.add(outlineMesh);
  visual.add(fillMesh);
  visual.rotation.x = CURSOR_TILT_RADIANS;

  const model = new THREE.Group();
  model.name = 'CursorModel';
  model.add(visual, createContactShadow({ radius: CURSOR_SHADOW_RADIUS, basis }));
  return model;
}
