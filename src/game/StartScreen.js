import { getSharedAudioContext } from './AudioContextSingleton.js';

function formatRestoredCount(count, bestTimeMs) {
  const filesLabel = count === 1 ? 'fichier restauré' : 'fichiers restaurés';
  const base = `${count} ${filesLabel}`;
  if (bestTimeMs == null) return base;
  return `${base} · record ${(bestTimeMs / 1000).toFixed(1)}s`;
}

// Diegetic gate before gameplay starts: also the user gesture that unlocks
// the shared Web Audio context (browsers block autoplay before one).
export function createStartScreen({ documentRef = document, restoredCount, bestTimeMs, onStart }) {
  const overlay = documentRef.getElementById('start-screen');
  if (!overlay) {
    onStart();
    return;
  }

  const restoredCountEl = documentRef.getElementById('start-screen-restored-count');
  if (restoredCountEl) restoredCountEl.textContent = formatRestoredCount(restoredCount, bestTimeMs);

  let started = false;
  function handleStart() {
    if (started) return;
    started = true;
    getSharedAudioContext();
    overlay.remove();
    onStart();
  }

  overlay.addEventListener('click', handleStart);
  overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleStart();
    }
  });
}
