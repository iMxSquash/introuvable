const MAX_THUMB_TRAVEL_PX = 45;
const DEADZONE_RATIO = 0.15;

// Mobile/tablet on-screen movement control: feeds the same forward/backward/
// left/right axis shape as the keyboard state in main.js, so both inputs can
// be merged with a simple per-axis max() in the game loop. Hidden on non-touch
// devices via CSS (`pointer: coarse`); the pointer handlers below only ever
// fire if the element is visible and tapped.
export function createTouchJoystick({ documentRef = document } = {}) {
  const base = documentRef.getElementById('touch-joystick');
  const thumb = documentRef.getElementById('touch-joystick-thumb');
  const axes = { forward: 0, backward: 0, left: 0, right: 0 };

  if (!base || !thumb) return { axes };

  let activePointerId = null;
  let originX = 0;
  let originY = 0;

  function resetAxes() {
    axes.forward = 0;
    axes.backward = 0;
    axes.left = 0;
    axes.right = 0;
    thumb.style.transform = '';
  }

  function updateFromPointer(clientX, clientY) {
    const deltaX = clientX - originX;
    const deltaY = clientY - originY;
    const distance = Math.hypot(deltaX, deltaY);
    const clampedDistance = Math.min(distance, MAX_THUMB_TRAVEL_PX);
    const angle = Math.atan2(deltaY, deltaX);
    const thumbX = Math.cos(angle) * clampedDistance;
    const thumbY = Math.sin(angle) * clampedDistance;
    thumb.style.transform = `translate(${thumbX}px, ${thumbY}px)`;

    const magnitude = clampedDistance / MAX_THUMB_TRAVEL_PX;
    if (magnitude < DEADZONE_RATIO) {
      axes.forward = 0;
      axes.backward = 0;
      axes.left = 0;
      axes.right = 0;
      return;
    }

    // Screen-space: +x is right, +y is down; "forward" is up on screen.
    const normalizedX = thumbX / MAX_THUMB_TRAVEL_PX;
    const normalizedY = -thumbY / MAX_THUMB_TRAVEL_PX;
    axes.right = Math.max(0, normalizedX);
    axes.left = Math.max(0, -normalizedX);
    axes.forward = Math.max(0, normalizedY);
    axes.backward = Math.max(0, -normalizedY);
  }

  function handlePointerDown(event) {
    if (activePointerId != null) return;
    activePointerId = event.pointerId;
    const rect = base.getBoundingClientRect();
    originX = rect.left + rect.width / 2;
    originY = rect.top + rect.height / 2;
    base.setPointerCapture(activePointerId);
    updateFromPointer(event.clientX, event.clientY);
    event.preventDefault();
  }

  function handlePointerMove(event) {
    if (event.pointerId !== activePointerId) return;
    updateFromPointer(event.clientX, event.clientY);
    event.preventDefault();
  }

  function handlePointerUp(event) {
    if (event.pointerId !== activePointerId) return;
    activePointerId = null;
    resetAxes();
  }

  base.addEventListener('pointerdown', handlePointerDown);
  base.addEventListener('pointermove', handlePointerMove);
  base.addEventListener('pointerup', handlePointerUp);
  base.addEventListener('pointercancel', handlePointerUp);

  return { axes };
}
