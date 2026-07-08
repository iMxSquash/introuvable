const PORTFOLIO_URL = 'https://elwen.dev';

function openPortfolio() {
  try {
    // Top-level navigation: this game may be embedded in an iframe on the
    // portfolio's 404 page, and we want to leave the frame entirely.
    window.top.location = PORTFOLIO_URL;
  } catch {
    window.location = PORTFOLIO_URL;
  }
}

export function createFinderWindow({ documentRef = document, fileName, onOpen = openPortfolio }) {
  const overlay = documentRef.getElementById('finder-window-overlay');
  const filenameEl = documentRef.getElementById('finder-window-filename');
  const openButton = documentRef.getElementById('finder-window-open');
  if (!overlay || !filenameEl || !openButton) return { show() {} };

  filenameEl.textContent = fileName;
  openButton.addEventListener('click', onOpen, { once: true });

  return {
    show() {
      overlay.hidden = false;
    },
  };
}
