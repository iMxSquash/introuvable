// --glass-tint-alpha and --glass-blur are read live: they're consumed by a
// var() the browser re-resolves on its own the instant the custom property
// changes (see the `liquid-glass` utility and the inline backdropFilter
// below), so tweaking them needs no rebuild here.
// --glass-scale, --glass-aberration and --glass-lens are different: they get
// baked into this element's SVG filter attributes (feDisplacementMap scale,
// the feImage displacement map), which cannot hold a var(). rebuild() below
// is the only place that re-reads them, and it only runs on attach and on
// resize — editing them takes effect on the next full page load (or the
// next resize), not instantly. A live-tuning UI would need to call rebuild()
// itself after changing them, the way the skill's reference demo's slider
// panel calls `refraction.update({ scale, aberration, mode })`.
const SVG_NS = 'http://www.w3.org/2000/svg';
const DEFS_ID = 'liquid-glass-defs';
const DEFAULT_SCALE = 40;
const DEFAULT_ABERRATION = 8;
const DEFAULT_LENS = 'diagonal';
const MAX_EDGE_WIDTH = 42;
// Softens the backdrop just before it's displaced (see refraction.md); not
// one of the tunable knobs, kept fixed like the reference implementation.
const PREFILTER_BLUR = 7;

function supportsUrlBackdropFilter(documentRef) {
  const probe = documentRef.createElement('div');
  probe.style.cssText = 'backdrop-filter: url(#probe)';
  return probe.style.backdropFilter === 'url(#probe)' || probe.style.backdropFilter === 'url("#probe")';
}

function prefersOpaqueGlass(windowRef) {
  return (
    windowRef.matchMedia('(prefers-reduced-transparency: reduce)').matches ||
    windowRef.matchMedia('(prefers-contrast: more)').matches
  );
}

// Signed distance to a rounded rectangle centered in (w, h); negative inside.
function roundedRectSdf(x, y, w, h, r) {
  const qx = Math.abs(x - w / 2) - (w / 2 - r);
  const qy = Math.abs(y - h / 2) - (h / 2 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

// mode 'diagonal': constant down-right displacement direction, matches the
// sheen (glass lit from the top-left), refracting on all four edges alike.
// mode 'symmetric': outward SDF normals, a classic magnifier rim, better
// suited to perfectly circular controls (the touch joystick, jump button).
function buildDisplacementMap(documentRef, w, h, r, edge, mode) {
  const canvas = documentRef.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  const data = img.data;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const inside = -roundedRectSdf(x + 0.5, y + 0.5, w, h, r);
      let nx = 0;
      let ny = 0;

      if (inside < edge) {
        const t = Math.min(1, Math.max(0, 1 - inside / edge));
        const mag = t * t; // full strength at the border, eased to zero at the band's inner limit
        if (mode === 'symmetric') {
          const gx = roundedRectSdf(x + 1.5, y + 0.5, w, h, r) - roundedRectSdf(x - 0.5, y + 0.5, w, h, r);
          const gy = roundedRectSdf(x + 0.5, y + 1.5, w, h, r) - roundedRectSdf(x + 0.5, y - 0.5, w, h, r);
          const len = Math.hypot(gx, gy) || 1;
          nx = (gx / len) * mag;
          ny = (gy / len) * mag;
        } else {
          nx = Math.SQRT1_2 * mag;
          ny = Math.SQRT1_2 * mag;
        }
      }

      const i = (y * w + x) * 4;
      data[i] = Math.round(128 + nx * 127);
      data[i + 1] = Math.round(128 + ny * 127);
      data[i + 2] = 128;
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}

function buildRefractionFilter(documentRef, id) {
  const filter = documentRef.createElementNS(SVG_NS, 'filter');
  filter.setAttribute('id', id);
  filter.setAttribute('color-interpolation-filters', 'sRGB');

  const feImage = documentRef.createElementNS(SVG_NS, 'feImage');
  feImage.setAttribute('preserveAspectRatio', 'none');
  feImage.setAttribute('result', 'map');
  filter.appendChild(feImage);

  const feBlur = documentRef.createElementNS(SVG_NS, 'feGaussianBlur');
  feBlur.setAttribute('in', 'SourceGraphic');
  feBlur.setAttribute('stdDeviation', String(PREFILTER_BLUR));
  feBlur.setAttribute('result', 'soft');
  filter.appendChild(feBlur);

  // Chromatic aberration: three displacement passes (R strongest, B weakest),
  // each isolated to one color channel, recombined with screen blending so
  // rainbow fringes only appear along the refracting band.
  const channelMatrices = [
    ['R', '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0'],
    ['G', '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0'],
    ['B', '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0'],
  ];
  const displacements = channelMatrices.map(([channel, matrixValues]) => {
    const displacement = documentRef.createElementNS(SVG_NS, 'feDisplacementMap');
    displacement.setAttribute('in', 'soft');
    displacement.setAttribute('in2', 'map');
    displacement.setAttribute('xChannelSelector', 'R');
    displacement.setAttribute('yChannelSelector', 'G');
    filter.appendChild(displacement);

    const colorMatrix = documentRef.createElementNS(SVG_NS, 'feColorMatrix');
    colorMatrix.setAttribute('values', matrixValues);
    colorMatrix.setAttribute('result', `chan${channel}`);
    filter.appendChild(colorMatrix);

    return displacement;
  });

  const blendRG = documentRef.createElementNS(SVG_NS, 'feBlend');
  blendRG.setAttribute('in', 'chanR');
  blendRG.setAttribute('in2', 'chanG');
  blendRG.setAttribute('mode', 'screen');
  blendRG.setAttribute('result', 'chanRG');
  filter.appendChild(blendRG);

  const blendRGB = documentRef.createElementNS(SVG_NS, 'feBlend');
  blendRGB.setAttribute('in', 'chanRG');
  blendRGB.setAttribute('in2', 'chanB');
  blendRGB.setAttribute('mode', 'screen');
  filter.appendChild(blendRGB);

  return { filter, feImage, displacements };
}

let nextFilterId = 0;

function attachRefraction(el, { documentRef, windowRef, defs }) {
  const id = `liquid-glass-refraction-${(nextFilterId += 1)}`;
  const { filter, feImage, displacements } = buildRefractionFilter(documentRef, id);
  defs.appendChild(filter);

  function rebuild() {
    const w = Math.round(el.offsetWidth);
    const h = Math.round(el.offsetHeight);
    if (w <= 0 || h <= 0) return;

    const style = windowRef.getComputedStyle(el);
    const scale = parseFloat(style.getPropertyValue('--glass-scale')) || DEFAULT_SCALE;
    const aberration = parseFloat(style.getPropertyValue('--glass-aberration'));
    const lens = style.getPropertyValue('--glass-lens').trim() || DEFAULT_LENS;
    const aberrationValue = Number.isNaN(aberration) ? DEFAULT_ABERRATION : aberration;

    // CSS clamps a corner radius to half of the box's own dimension (a pill
    // or a circle); the raw computed value (e.g. 999px on a capsule button)
    // does not reflect that clamp, and feeding it straight into the SDF
    // collapses the whole displacement map into noise.
    const rawRadius = parseFloat(style.borderTopLeftRadius) || 16;
    const radius = Math.min(rawRadius, w / 2, h / 2);
    const edge = Math.min(MAX_EDGE_WIDTH, w / 6, h / 6);

    filter.setAttribute('x', '0');
    filter.setAttribute('y', '0');
    filter.setAttribute('width', w);
    filter.setAttribute('height', h);
    feImage.setAttribute('x', '0');
    feImage.setAttribute('y', '0');
    feImage.setAttribute('width', w);
    feImage.setAttribute('height', h);
    feImage.setAttribute('href', buildDisplacementMap(documentRef, w, h, radius, edge, lens));

    displacements[0].setAttribute('scale', scale + aberrationValue);
    displacements[1].setAttribute('scale', scale);
    displacements[2].setAttribute('scale', scale - aberrationValue);

    // var() in an inline style resolves against the element, so this keeps
    // honoring --glass-blur/--glass-saturate/--glass-brightness at every
    // cascade level (global, subtree, per element) instead of baking them in.
    const backdrop = `blur(var(--glass-blur, 0px)) url("#${id}") saturate(var(--glass-saturate, 180%)) brightness(var(--glass-brightness, 1.08))`;
    el.style.backdropFilter = backdrop;
    el.style.webkitBackdropFilter = backdrop;
  }

  new windowRef.ResizeObserver(rebuild).observe(el);
  rebuild();

  return { rebuild };
}

// Wires Apple-style Liquid Glass refraction onto every `.liquid-glass`
// element already in the DOM. Chromium only (the only engine that renders
// `backdrop-filter: url(#svgFilter)`); every other engine, plus users with
// `prefers-reduced-transparency`/`prefers-contrast`, keeps the plain
// blur+tint fallback declared in style.css. Returns `attach` so callers can
// wire up elements created after this ran (e.g. toasts).
export function initLiquidGlass({ documentRef = document, windowRef = window } = {}) {
  const noop = { attach() {} };
  if (!supportsUrlBackdropFilter(documentRef) || prefersOpaqueGlass(windowRef)) return noop;

  const defs = documentRef.getElementById(DEFS_ID);
  if (!defs) return noop;

  const handles = new WeakMap();
  function attach(el) {
    if (!el || handles.has(el)) return;
    handles.set(el, attachRefraction(el, { documentRef, windowRef, defs }));
  }

  documentRef.querySelectorAll('.liquid-glass').forEach(attach);

  return { attach };
}
