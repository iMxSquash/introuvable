// Synthesized macOS-like "pop" via Web Audio, no external sound asset needed.
import { getSharedAudioContext } from './AudioContextSingleton.js';

const POP_FREQUENCY_START = 720;
const POP_FREQUENCY_END = 1180;
const POP_DURATION_SECONDS = 0.16;
const POP_PEAK_GAIN = 0.35;

export function playPickupSound() {
  const context = getSharedAudioContext();
  if (!context) return;

  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(POP_FREQUENCY_START, now);
  oscillator.frequency.exponentialRampToValueAtTime(POP_FREQUENCY_END, now + POP_DURATION_SECONDS);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(POP_PEAK_GAIN, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + POP_DURATION_SECONDS);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + POP_DURATION_SECONDS + 0.02);
}
