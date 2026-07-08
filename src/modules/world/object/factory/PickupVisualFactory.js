import * as THREE from 'three';

function createMaterial(color, emissiveIntensity = 0.2) {
  const base = new THREE.Color(color);
  return new THREE.MeshStandardMaterial({
    color: base,
    emissive: base.clone().multiplyScalar(0.2),
    emissiveIntensity,
    metalness: 0.25,
    roughness: 0.4,
  });
}

export function buildAmmoPickupVisual(color = null, accentColor = null) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.8, 0.9),
    createMaterial(color ?? 0x4b7b51)
  );
  const belt = new THREE.Mesh(
    new THREE.BoxGeometry(1.08, 0.2, 0.92),
    createMaterial(accentColor ?? 0xd9e56a, 0.35)
  );
  belt.position.y = 0.16;
  group.add(body, belt);
  return { mesh: group, radius: 0.85 };
}

export function buildHealthPickupVisual(color = null, crossColor = null) {
  const size = 0.75;
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(size, size, size),
    createMaterial(color ?? 0xaa1f24)
  );
  const thick = size * 0.2;
  const vertical = new THREE.Mesh(
    new THREE.BoxGeometry(thick, size * 0.75, size * 1.01),
    createMaterial(crossColor ?? 0xffffff, 0.5)
  );
  const horizontal = new THREE.Mesh(
    new THREE.BoxGeometry(size * 0.75, thick, size * 1.01),
    createMaterial(crossColor ?? 0xffffff, 0.5)
  );
  vertical.position.z = size * 0.51;
  horizontal.position.z = size * 0.51;
  group.add(body, vertical, horizontal);
  return { mesh: group, radius: 0.8 };
}

export function buildArmorPickupVisual(color = null, ringColor = null) {
  const group = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.28, 1.0, 10),
    createMaterial(color ?? 0x2d66ff, 0.4)
  );
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.4, 0.05, 12, 24),
    createMaterial(ringColor ?? 0x77a3ff, 0.6)
  );
  ring.rotation.x = Math.PI * 0.5;
  group.add(core, ring);
  return { mesh: group, radius: 0.82 };
}

// Torn paper silhouette, tip of the tear anchored at local x=0 so the fold
// below hinges cleanly on that vertex.
const FILE_FRAGMENT_OUTLINE = [
  [0, 0.55], [0.32, 0.5], [0.28, 0.24], [0.46, 0.18], [0.4, -0.1],
  [0.5, -0.32], [0.18, -0.5], [-0.05, -0.34], [-0.34, -0.5],
  [-0.48, -0.16], [-0.3, 0.05], [-0.42, 0.3], [-0.16, 0.42],
];
const FILE_FRAGMENT_THICKNESS = 0.04;
const FILE_FRAGMENT_FOLD_ANGLE = 0.26;

function foldFileFragmentGeometry(geometry) {
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    if (x <= 0) continue;
    const y = position.getY(i);
    const foldedX = x * Math.cos(FILE_FRAGMENT_FOLD_ANGLE) - y * Math.sin(FILE_FRAGMENT_FOLD_ANGLE);
    const foldedY = x * Math.sin(FILE_FRAGMENT_FOLD_ANGLE) + y * Math.cos(FILE_FRAGMENT_FOLD_ANGLE);
    position.setX(i, foldedX);
    position.setY(i, foldedY);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
}

// 0xf5f3ef: off-white paper tone (see src/game/Palette.js's OFF_WHITE) rather
// than pure white, for a softer, less clinical look.
export function buildFileFragmentVisual(color = 0xf5f3ef, emissiveColor = 0x9fd2ff) {
  const shape = new THREE.Shape();
  FILE_FRAGMENT_OUTLINE.forEach(([x, y], index) => {
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: FILE_FRAGMENT_THICKNESS,
    bevelEnabled: false,
    curveSegments: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -FILE_FRAGMENT_THICKNESS * 0.5, 0);
  foldFileFragmentGeometry(geometry);

  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: new THREE.Color(emissiveColor),
    emissiveIntensity: 0.35,
    roughness: 0.65,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;

  const group = new THREE.Group();
  group.add(mesh);
  return { mesh: group, radius: 0.55 };
}

export function createPickupVisual({
  type,
  color = null,
  accentColor = null,
  crossColor = null,
  ringColor = null,
  emissiveColor = null,
}) {
  if (type === 'ammo') return buildAmmoPickupVisual(color, accentColor);
  if (type === 'health') return buildHealthPickupVisual(color, crossColor);
  if (type === 'fragment' || type === 'fragment-final') {
    return buildFileFragmentVisual(color ?? 0xf5f3ef, emissiveColor ?? 0x9fd2ff);
  }
  return buildArmorPickupVisual(color, ringColor);
}
