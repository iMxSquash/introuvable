import { getSharedAudioContext } from './AudioContextSingleton.js';

// Two quick descending square-wave beeps, evoking a system alert/error sound.
const ALERT_TONES = [
  { frequency: 520, offsetSeconds: 0 },
  { frequency: 340, offsetSeconds: 0.14 },
];
const ALERT_TONE_DURATION_SECONDS = 0.13;
const ALERT_PEAK_GAIN = 0.22;

function playAlertSound() {
  const context = getSharedAudioContext();
  if (!context) return;

  const now = context.currentTime;
  for (const { frequency, offsetSeconds } of ALERT_TONES) {
    const startAt = now + offsetSeconds;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(frequency, startAt);

    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(ALERT_PEAK_GAIN, startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + ALERT_TONE_DURATION_SECONDS);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + ALERT_TONE_DURATION_SECONDS + 0.02);
  }
}

export function triggerForceQuitEffect(documentRef = document) {
  playAlertSound();

  const overlay = documentRef.getElementById('force-quit-overlay');
  if (!overlay) return;

  overlay.classList.remove('force-quit-overlay--flash');
  // Force a reflow so re-adding the class restarts the CSS animation on repeat triggers.
  void overlay.offsetWidth;
  overlay.classList.add('force-quit-overlay--flash');
}
