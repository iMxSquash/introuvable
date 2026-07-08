import { getSharedAudioContext } from './AudioContextSingleton.js';

// A short ascending three-note chime, evoking a "restore complete" sound.
const NOTES = [
  { frequency: 523.25, offsetSeconds: 0 },
  { frequency: 659.25, offsetSeconds: 0.11 },
  { frequency: 783.99, offsetSeconds: 0.22 },
];
const NOTE_DURATION_SECONDS = 0.32;
const PEAK_GAIN = 0.3;

export function playRestoreSound() {
  const context = getSharedAudioContext();
  if (!context) return;

  const now = context.currentTime;
  for (const { frequency, offsetSeconds } of NOTES) {
    const startAt = now + offsetSeconds;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, startAt);

    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(PEAK_GAIN, startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + NOTE_DURATION_SECONDS);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + NOTE_DURATION_SECONDS + 0.02);
  }
}
