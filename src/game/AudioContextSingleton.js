// Shared lazily-created AudioContext for all synthesized sound effects.
// Browsers block autoplay before a user gesture, but every sound in this game
// is triggered by a click/keypress/collision that already followed one.
let sharedAudioContext = null;

export function getSharedAudioContext() {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!sharedAudioContext) sharedAudioContext = new AudioContextClass();
  if (sharedAudioContext.state === 'suspended') sharedAudioContext.resume();
  return sharedAudioContext;
}
