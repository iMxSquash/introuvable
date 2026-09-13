import { LiquidGlassEngine } from 'quick-liquid';

// Per-role LiquidGlassConfig presets, derived from the apple-design skill's
// Component -> Config Mapping table
// (.claude/skills/apple-design/references/web-liquid-glass.md), adapted to
// this game's actual glass surfaces. Centralized here as the single source
// of truth, replacing the old CSS custom properties (--glass-tint,
// --glass-blur, --glass-scale, etc.).
//
// Two known integration hazards with quick-liquid's DOM wrapping (the engine
// moves a host's original children into its own `.ql-content` div on mount):
//  - Never bind text directly to a `.liquid-glass` host via `element.textContent`
//    (e.g. a generic text-binding helper) — that wipes the engine's injected
//    lens/tint/sheen/rim layers on every update. Target an inner `-text` span
//    instead (see HudView.js / index.html's `#finder-path-text`).
//  - If a host's original children rely on being absolutely positioned
//    against the host itself (e.g. a centered thumb inside a circular base),
//    `.ql-content` (`position: relative`, no explicit size) collapses to the
//    host's width but 0 height, breaking that positioning. Fix per-selector
//    in CSS (see `.touch-joystick .ql-content` in style.css), not globally —
//    other hosts size themselves from their (flowed) content and would break
//    if `.ql-content` were made position: absolute everywhere.

// Project-wide policy: no surface reflection, and chromatic aberration is
// reserved for the ~2 most prominent/least-frequent panels per viewport
// (budget rule) — every preset starts from this and opts back in explicitly.
const GLASS_DEFAULTS = {
  chromaticAberration: 0,
  specularStrength: 0,
};

// Small HUD readout chips: finder path breadcrumb, fragment counter.
const HUD_CHIP_CONFIG = {
  ...GLASS_DEFAULTS,
  material: 'thin',
  borderRadius: 999, // matches the chips' own `border-radius: 999px` (pill)
};

// Circular touch controls (mobile only). A borderRadius this large is
// clamped by the engine to half of the element's own box (same rule as CSS
// border-radius), so it renders as a perfect circle regardless of the
// joystick base vs. jump button's actual pixel size, and the engine's
// bezel/lens geometry is computed from that same clamped radius.
const TOUCH_CONTROL_CONFIG = {
  ...GLASS_DEFAULTS,
  material: 'regular',
  borderRadius: 999,
};

// The two most prominent, least-frequent glass surfaces in the game: thick
// material, and where the chromatic-aberration budget is spent. Named
// separately (rather than one shared constant spread-and-overridden at each
// call site) since each has its own fixed `borderRadius` matching its own
// CSS (`1.1rem` / `0.75rem`).
const START_SCREEN_PANEL_CONFIG = {
  ...GLASS_DEFAULTS,
  material: 'thick',
  chromaticAberration: 0.25,
  borderRadius: 18, // matches `.start-screen__panel`'s `1.1rem`
};

const FINDER_WINDOW_CONFIG = {
  ...GLASS_DEFAULTS,
  material: 'thick',
  chromaticAberration: 0.25,
  borderRadius: 12, // matches `.finder-window`'s `0.75rem`
};

// Toast notifications: small, transient chips.
const TOAST_CONFIG = {
  ...GLASS_DEFAULTS,
  material: 'thin',
  borderRadius: 12, // matches `.toast`'s `border-radius: 0.75rem`
};

function resolveConfig(el) {
  if (el.id === 'finder-path' || el.id === 'fragment-counter') return HUD_CHIP_CONFIG;
  if (el.id === 'touch-joystick' || el.id === 'touch-jump-button') return TOUCH_CONTROL_CONFIG;
  if (el.classList.contains('start-screen__panel')) return START_SCREEN_PANEL_CONFIG;
  if (el.classList.contains('finder-window')) return FINDER_WINDOW_CONFIG;
  if (el.classList.contains('toast')) return TOAST_CONFIG;
  return HUD_CHIP_CONFIG;
}

// Wires quick-liquid's LiquidGlassEngine onto every `.liquid-glass` element
// already in the DOM. The engine's `respectPreferences: true` default
// already softens/removes refraction and blur under
// `prefers-reduced-transparency`/`prefers-reduced-motion` and ships its own
// browser fallback (Chromium gets full SVG refraction, Safari/Firefox keep
// frost + tint + rim), so none of that is hand-rolled here anymore. Returns
// `attach` so callers can wire up elements created after this ran (e.g.
// toasts), or elements that exist but are hidden at startup (touch controls,
// the Finder window overlay) and shouldn't pay the engine's mount cost
// (extra DOM layers, matchMedia/ResizeObserver/visibilitychange listeners)
// until they can actually be seen.
export function initLiquidGlass({ documentRef = document, windowRef = window } = {}) {
  const engines = new WeakMap();

  function attach(el) {
    if (!el || engines.has(el)) return;
    // Skip elements with no layout box yet (display: none) — same guard the
    // old hand-rolled implementation had. Not marked in `engines`, so a later
    // `attach(el)` call (once the element is actually shown) can still
    // succeed instead of being silently swallowed by the has() check above.
    if (el.offsetWidth === 0 && el.offsetHeight === 0) return;
    engines.set(el, new LiquidGlassEngine(el, resolveConfig(el)));
  }

  documentRef.querySelectorAll('.liquid-glass').forEach(attach);

  // Touch controls are `display: none` until `@media (pointer: coarse)`
  // matches (see style.css) — retry attaching them exactly when that becomes
  // true, instead of the alternative of dropping the size guard above and
  // paying full engine setup for controls a desktop session never shows.
  const coarsePointerQuery = windowRef.matchMedia?.('(pointer: coarse)');
  if (coarsePointerQuery) {
    const attachTouchControls = () => {
      attach(documentRef.getElementById('touch-joystick'));
      attach(documentRef.getElementById('touch-jump-button'));
    };
    if (coarsePointerQuery.matches) attachTouchControls();
    coarsePointerQuery.addEventListener('change', (event) => {
      if (event.matches) attachTouchControls();
    });
  }

  return { attach };
}
