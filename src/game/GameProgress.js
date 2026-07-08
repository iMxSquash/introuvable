import { JsonSettingsStore } from '../modules/user-interface/StorageSettingsStore.js';

const STORAGE_KEY = 'introuvable-progress';
const DEFAULTS = { restoredCount: 0, bestTimeMs: null };

export class GameProgress {
  constructor(storage = null) {
    this.store = new JsonSettingsStore(storage, STORAGE_KEY, DEFAULTS);
    this.store.load();
  }

  getRestoredCount() {
    return this.store.settings.restoredCount;
  }

  getBestTimeMs() {
    return this.store.settings.bestTimeMs;
  }

  // Called once a restoration cinematic completes; returns the updated
  // totals plus whether this run beat the previous best time.
  recordRestoration(elapsedMs) {
    const previousBest = this.store.settings.bestTimeMs;
    const isNewBest = previousBest == null || elapsedMs < previousBest;

    this.store.update({
      restoredCount: this.store.settings.restoredCount + 1,
      bestTimeMs: isNewBest ? elapsedMs : previousBest,
    });
    this.store.save();

    return {
      restoredCount: this.store.settings.restoredCount,
      bestTimeMs: this.store.settings.bestTimeMs,
      isNewBest,
    };
  }
}
