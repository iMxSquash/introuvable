import { Vector3 } from 'three';
import { buildFileFragmentVisual } from '../modules/world/object/factory/PickupVisualFactory.js';
import { disposeObject3D } from '../modules/world/Object3DUtils.js';
import { clamp01 } from '../modules/math/ScalarUtils.js';
import { DEFAULT_WORLD_BASIS } from '../modules/math/WorldBasis.js';
import { createFileIconModel } from './FileIconMesh.js';
import { playRestoreSound } from './RestoreSound.js';

const SHARD_COUNT = 4;
const SHARD_SCALE = 0.35;
const SHARD_SPREAD_RADIUS = 1.6;
const HOVER_HEIGHT = 2.4;
const ASSEMBLY_DURATION_SECONDS = 0.9;

// Short scripted beat once the last fragment is collected: the paper shards
// converge above the cursor into the restored file icon, then hand off to
// whatever should happen next (the Finder window).
export class RestorationCinematic {
  constructor({ scene, basis = DEFAULT_WORLD_BASIS }) {
    this.scene = scene;
    this.basis = basis;
    this.active = false;
    this.elapsedSeconds = 0;
    this.shards = [];
    this.icon = null;
    this.center = new Vector3();
    this.onComplete = null;
  }

  play(anchorPosition, onComplete) {
    this.onComplete = onComplete;
    this.elapsedSeconds = 0;
    this.active = true;
    this.center.copy(anchorPosition).add(this.basis.fromBasisComponents(0, HOVER_HEIGHT, 0));

    this.shards = [];
    for (let i = 0; i < SHARD_COUNT; i += 1) {
      const angle = (i / SHARD_COUNT) * Math.PI * 2;
      const mesh = buildFileFragmentVisual().mesh;
      mesh.scale.setScalar(SHARD_SCALE);
      const start = this.center.clone().add(this.basis.fromBasisComponents(
        Math.cos(angle) * SHARD_SPREAD_RADIUS,
        (Math.random() - 0.5) * 0.6,
        Math.sin(angle) * SHARD_SPREAD_RADIUS
      ));
      mesh.position.copy(start);
      this.scene.add(mesh);
      this.shards.push({ mesh, start });
    }

    this.icon = createFileIconModel();
    this.icon.position.copy(this.center);
    this.icon.scale.setScalar(0.001);
    this.scene.add(this.icon);

    playRestoreSound();
  }

  update(deltaSeconds) {
    if (!this.active) return;

    this.elapsedSeconds += deltaSeconds;
    const progress = clamp01(this.elapsedSeconds / ASSEMBLY_DURATION_SECONDS);

    for (const shard of this.shards) {
      shard.mesh.position.lerpVectors(shard.start, this.center, progress);
      shard.mesh.rotation.y = progress * Math.PI * 2;
      shard.mesh.scale.setScalar(SHARD_SCALE * (1 - progress));
    }

    this.icon.scale.setScalar(Math.min(1, progress * 1.3));
    this.icon.rotation.y = progress * Math.PI * 0.5;

    if (progress >= 1) this._finish();
  }

  _finish() {
    this.active = false;
    for (const shard of this.shards) disposeObject3D(shard.mesh);
    this.shards = [];
    if (this.icon) {
      disposeObject3D(this.icon);
      this.icon = null;
    }

    const callback = this.onComplete;
    this.onComplete = null;
    callback?.();
  }
}
