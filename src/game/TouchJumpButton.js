// Mobile/tablet on-screen jump control: feeds a `pressed` boolean merged
// with the keyboard's Space bar state in main.js. Hidden on non-touch
// devices via CSS (`pointer: coarse`); the pointer handlers below only ever
// fire if the element is visible and tapped.
export function createTouchJumpButton({ documentRef = document } = {}) {
  const button = documentRef.getElementById('touch-jump-button');
  const state = { pressed: false };

  if (!button) return state;

  function handlePointerDown(event) {
    state.pressed = true;
    event.preventDefault();
  }

  function handlePointerUp() {
    state.pressed = false;
  }

  button.addEventListener('pointerdown', handlePointerDown);
  button.addEventListener('pointerup', handlePointerUp);
  button.addEventListener('pointercancel', handlePointerUp);

  return state;
}
