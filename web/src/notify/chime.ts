// An original, synthesised two-note desk bell (no audio files, nothing from the show). Quiet and short.
export const CHIME_NOTES: readonly { freq: number; at: number; dur: number }[] = [
  { freq: 987.77, at: 0, dur: 0.42 }, // B5
  { freq: 1318.51, at: 0.13, dur: 0.6 }, // E6
];
export const CHIME_GAIN = 0.07;

type AudioCtor = new () => AudioContext;
let ctx: AudioContext | null = null;

/** The Dundies' fanfare: three rising notes, also synthesised. Only with the chime setting on, never in Toby mode. */
export const FANFARE_NOTES: readonly { freq: number; at: number; dur: number }[] = [
  { freq: 523.25, at: 0, dur: 0.22 }, // C5
  { freq: 659.25, at: 0.16, dur: 0.22 }, // E5
  { freq: 783.99, at: 0.32, dur: 0.55 }, // G5
];

/** Play the chime; false when the browser can't (no Web Audio, or it refused). */
export const playChime = (): boolean => playNotes(CHIME_NOTES);

export function playNotes(notes: readonly { freq: number; at: number; dur: number }[]): boolean {
  try {
    const w = typeof window === 'undefined' ? undefined : (window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor });
    const Ctor = w?.AudioContext ?? w?.webkitAudioContext;
    if (!Ctor) return false;
    ctx ??= new Ctor();
    if (ctx.state === 'suspended') void ctx.resume();
    const t0 = ctx.currentTime;
    for (const n of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(n.freq, t0 + n.at);
      gain.gain.setValueAtTime(0.0001, t0 + n.at);
      gain.gain.exponentialRampToValueAtTime(CHIME_GAIN, t0 + n.at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0 + n.at);
      osc.stop(t0 + n.at + n.dur + 0.05);
    }
    return true;
  } catch {
    return false;
  }
}
