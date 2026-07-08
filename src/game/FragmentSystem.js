import { PickupObject } from '../modules/world/object/PickupObject.js';
import { createPickupVisual } from '../modules/world/object/factory/PickupVisualFactory.js';
import { UiStateModel } from '../modules/user-interface/UiStateModel.js';
import { NotificationQueue } from '../modules/user-interface/NotificationQueue.js';
import { DEFAULT_WORLD_BASIS } from '../modules/math/WorldBasis.js';
import { playPickupSound } from './PickupSound.js';

export const REVEALABLE_PATH_SEGMENTS = ['Users', 'elwen', 'Documents', 'Sites', 'portfolio', 'Desktop'];
const TOTAL_FRAGMENTS = REVEALABLE_PATH_SEGMENTS.length + 1;
const DESKTOP_FRAGMENT_COUNT = REVEALABLE_PATH_SEGMENTS.length;
const COLLECTION_RADIUS_PADDING = 0.6;
const PICKUP_ANNOUNCEMENT = 'Fragment récupéré';
const NOTIFICATION_LIFETIME_MS = 1800;
const NOTIFICATION_MAX_VISIBLE = 3;

export class FragmentSystem {
  constructor({
    scene,
    environment,
    basis = DEFAULT_WORLD_BASIS,
    playerSpawnPosition,
    finalFragmentPosition,
    fileName,
  }) {
    this.scene = scene;
    this.basis = basis;
    this.fileName = fileName;

    this.uiState = new UiStateModel({
      collectedCount: 0,
      totalCount: TOTAL_FRAGMENTS,
      desktopRevealCount: 0,
      fileNameRevealed: false,
    });
    this.notifications = new NotificationQueue(NOTIFICATION_MAX_VISIBLE, NOTIFICATION_LIFETIME_MS, 'fragment-toast-');

    const spawnPlanar = basis.toPlanar(playerSpawnPosition);
    const desktopPositions = environment.sampleFragmentPositions(DESKTOP_FRAGMENT_COUNT, environment.prng, spawnPlanar);

    this.pickups = [
      ...desktopPositions.map((position, index) => this._spawnPickup(position, `fragment-${index}`, 'fragment')),
      this._spawnPickup(finalFragmentPosition.clone(), 'fragment-final', 'fragment-final'),
    ];
  }

  _spawnPickup(position, id, type) {
    const visual = createPickupVisual({ type });
    const pickup = new PickupObject({
      id,
      type,
      pickupVisual: visual,
      position,
      floorUp: this.basis.upComponent(position),
      basis: this.basis,
    });
    this.scene.add(pickup.group);
    return pickup;
  }

  update(deltaSeconds, playerPosition) {
    this.notifications.tick(deltaSeconds * 1000);

    for (let index = this.pickups.length - 1; index >= 0; index -= 1) {
      const pickup = this.pickups[index];
      pickup.animate(deltaSeconds);

      // Full 3D distance (not planar): the final fragment sits deep inside the
      // Trash Can interior, directly beneath the desktop's trash can landmark,
      // so a planar-only check would false-positive while walking above it.
      const collectRadius = pickup.radius + COLLECTION_RADIUS_PADDING;
      const distanceSq = pickup.position.distanceToSquared(playerPosition);
      if (distanceSq <= collectRadius * collectRadius) {
        this.pickups.splice(index, 1);
        this._collect(pickup);
      }
    }
  }

  _collect(pickup) {
    pickup.dispose();

    const state = this.uiState.getState();
    const collectedCount = state.collectedCount + 1;
    if (pickup.type === 'fragment-final') {
      this.uiState.patch({ collectedCount, fileNameRevealed: true });
    } else {
      this.uiState.patch({
        collectedCount,
        desktopRevealCount: Math.min(state.desktopRevealCount + 1, REVEALABLE_PATH_SEGMENTS.length),
      });
    }

    this.notifications.add(PICKUP_ANNOUNCEMENT, 'success');
    playPickupSound();
  }
}
