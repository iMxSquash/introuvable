import { getSharedAudioContext } from './AudioContextSingleton.js';

function formatRestoredCount(count, bestTimeMs) {
  const filesLabel = count === 1 ? 'fichier restauré' : 'fichiers restaurés';
  const base = `${count} ${filesLabel}`;
  if (bestTimeMs == null) return base;
  return `${base} · record ${(bestTimeMs / 1000).toFixed(1)}s`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Lets the panel be dragged around by its background (not its button), so
// the liquid glass lens can be seen refracting different parts of the
// wallpaper behind it. Position is tracked as the panel's own center point,
// matching the `left: 50%; top: 50%; transform: translate(-50%, -50%)`
// centering in style.css so a drag takes over from that CSS default
// seamlessly, and is clamped to the viewport so the panel (and its button)
// can never be dragged out of reach.
function makePanelDraggable(panel, windowRef) {
  let activePointerId = null;
  let offsetX = 0;
  let offsetY = 0;

  function moveTo(centerX, centerY) {
    const { width, height } = panel.getBoundingClientRect();
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    panel.style.left = `${clamp(centerX, halfWidth, windowRef.innerWidth - halfWidth)}px`;
    panel.style.top = `${clamp(centerY, halfHeight, windowRef.innerHeight - halfHeight)}px`;
  }

  function handlePointerDown(event) {
    if (activePointerId != null || event.target.closest('.start-screen__cta')) return;
    activePointerId = event.pointerId;
    const rect = panel.getBoundingClientRect();
    offsetX = event.clientX - (rect.left + rect.width / 2);
    offsetY = event.clientY - (rect.top + rect.height / 2);
    panel.setPointerCapture(activePointerId);
    panel.classList.add('is-dragging');
  }

  function handlePointerMove(event) {
    if (event.pointerId !== activePointerId) return;
    moveTo(event.clientX - offsetX, event.clientY - offsetY);
  }

  function handlePointerUp(event) {
    if (event.pointerId !== activePointerId) return;
    activePointerId = null;
    panel.classList.remove('is-dragging');
  }

  panel.addEventListener('pointerdown', handlePointerDown);
  panel.addEventListener('pointermove', handlePointerMove);
  panel.addEventListener('pointerup', handlePointerUp);
  panel.addEventListener('pointercancel', handlePointerUp);

  // Re-clamp after a viewport resize (e.g. the portfolio's resizable iframe
  // window), so a panel dragged near an edge never ends up stuck off-screen.
  windowRef.addEventListener('resize', () => {
    if (!panel.style.left) return;
    const rect = panel.getBoundingClientRect();
    moveTo(rect.left + rect.width / 2, rect.top + rect.height / 2);
  });
}

// Diegetic gate before gameplay starts: also the user gesture that unlocks
// the shared Web Audio context (browsers block autoplay before one). Only
// the panel's own button starts the game — the rest of the panel is a drag
// handle instead, so it can't be triggered by an accidental click anywhere
// on screen.
export function createStartScreen({ documentRef = document, windowRef = window, restoredCount, bestTimeMs, onStart }) {
  const overlay = documentRef.getElementById('start-screen');
  const startButton = documentRef.getElementById('start-screen-cta');
  if (!overlay || !startButton) {
    onStart();
    return;
  }

  const restoredCountEl = documentRef.getElementById('start-screen-restored-count');
  if (restoredCountEl) restoredCountEl.textContent = formatRestoredCount(restoredCount, bestTimeMs);

  const panel = documentRef.querySelector('.start-screen__panel');
  if (panel) makePanelDraggable(panel, windowRef);

  let started = false;
  startButton.addEventListener('click', () => {
    if (started) return;
    started = true;
    getSharedAudioContext();
    overlay.remove();
    onStart();
  });
}
