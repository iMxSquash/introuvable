import { DomHudRenderer } from '../modules/user-interface/DomHudRenderer.js';
import { REVEALABLE_PATH_SEGMENTS } from './FragmentSystem.js';

const ROOT_SEGMENT = 'Macintosh HD';
const PATH_SEPARATOR = ' ▸ ';
const PATH_ELLIPSIS = ' ▸ …';

function formatFinderPath(fileName) {
  return (_, state) => {
    const revealedSegments = REVEALABLE_PATH_SEGMENTS.slice(0, state.desktopRevealCount);
    const segments = [ROOT_SEGMENT, ...revealedSegments];
    // The filename is the last path segment: only show it once every folder
    // segment ahead of it has been revealed too, even if the Corbeille
    // fragment (which unlocks it) was picked up earlier than that.
    const allFoldersRevealed = state.desktopRevealCount >= REVEALABLE_PATH_SEGMENTS.length;
    if (allFoldersRevealed && state.fileNameRevealed) segments.push(fileName);

    const text = segments.join(PATH_SEPARATOR);
    const fullyRevealed = allFoldersRevealed && state.fileNameRevealed;
    return fullyRevealed ? text : `${text}${PATH_ELLIPSIS}`;
  };
}

function formatFragmentCounter(collectedCount, state) {
  return `${collectedCount}/${state.totalCount}`;
}

function renderToasts(container, items) {
  if (!container) return;

  const nextIds = new Set(items.map((item) => String(item.id)));
  for (const node of Array.from(container.children)) {
    if (!nextIds.has(node.dataset.toastId)) node.remove();
  }

  const existingIds = new Set(Array.from(container.children).map((node) => node.dataset.toastId));
  for (const item of items) {
    const id = String(item.id);
    if (existingIds.has(id)) continue;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.dataset.toastId = id;
    toast.textContent = item.content;
    container.appendChild(toast);
  }
}

export function createHudView({ uiState, notifications, fileName, documentRef = document }) {
  const hudRenderer = new DomHudRenderer(uiState, [], documentRef);
  const pathFormatter = formatFinderPath(fileName);
  hudRenderer.bindText('#finder-path', 'desktopRevealCount', pathFormatter);
  hudRenderer.bindText('#finder-path', 'fileNameRevealed', pathFormatter);
  hudRenderer.bindText('#fragment-counter', 'collectedCount', formatFragmentCounter);
  hudRenderer.attach();
  hudRenderer.render(uiState.getState());

  const toastContainer = documentRef.getElementById('toast-container');
  notifications.subscribe((visible) => renderToasts(toastContainer, visible), true);

  return hudRenderer;
}
