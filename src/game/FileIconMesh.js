import * as THREE from 'three';
import { OFF_WHITE } from './Palette.js';

const ICON_WIDTH = 1.3;
const ICON_HEIGHT = 1.7;
const FOLD_SIZE = 0.4;
const ICON_THICKNESS = 0.12;
const ICON_COLOR = OFF_WHITE;
const FOLD_COLOR = 0xd8dee6;

function buildFileOutlineShape() {
  const halfW = ICON_WIDTH * 0.5;
  const halfH = ICON_HEIGHT * 0.5;
  const shape = new THREE.Shape();
  shape.moveTo(-halfW, -halfH);
  shape.lineTo(halfW, -halfH);
  shape.lineTo(halfW, halfH - FOLD_SIZE);
  shape.lineTo(halfW - FOLD_SIZE, halfH);
  shape.lineTo(-halfW, halfH);
  shape.closePath();
  return shape;
}

function buildFoldShape() {
  const halfW = ICON_WIDTH * 0.5;
  const halfH = ICON_HEIGHT * 0.5;
  const shape = new THREE.Shape();
  shape.moveTo(halfW - FOLD_SIZE, halfH);
  shape.lineTo(halfW, halfH - FOLD_SIZE);
  shape.lineTo(halfW - FOLD_SIZE, halfH - FOLD_SIZE);
  shape.closePath();
  return shape;
}

function buildFlatMesh(shape, depth, color) {
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
  geometry.translate(0, 0, -depth * 0.5);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05 }));
  mesh.castShadow = true;
  return mesh;
}

// The restored file: a document icon with a folded top-right corner,
// standing upright (no lie-flat rotation needed).
export function createFileIconModel() {
  const body = buildFlatMesh(buildFileOutlineShape(), ICON_THICKNESS, ICON_COLOR);
  const fold = buildFlatMesh(buildFoldShape(), ICON_THICKNESS + 0.01, FOLD_COLOR);
  fold.position.z += 0.005;

  const model = new THREE.Group();
  model.name = 'FileIconModel';
  model.add(body, fold);
  return model;
}
