import type { LogSource } from "../protocol/types";

/**
 * Sound notification when ATC addresses the pilot.
 * The chime is synthesised with the Web Audio API (no audio file, works over plain HTTP).
 */

export interface NotifyPrefs {
  notifySound: boolean;
  notifyCpdlc: boolean;
  /** 0–1 */
  notifyVolume: number;
}

/** After (re)connecting, BeyondATC replays the log history: no sound during that burst. */
export const REPLAY_QUIET_MS = 1500;
/** Several messages in a row → a single chime. */
export const MIN_GAP_MS = 1500;

/** Pure decision, unit-tested: should this new log entry ring? */
export function shouldNotify(
  source: LogSource,
  prefs: NotifyPrefs,
  now: number,
  quietUntil: number,
  lastChimeAt: number
): boolean {
  if (!prefs.notifySound || prefs.notifyVolume <= 0) return false;
  const addressedToPilot = source === "atc" || (prefs.notifyCpdlc && source === "cpdlcAtc");
  if (!addressedToPilot) return false;
  if (now < quietUntil) return false;
  if (now - lastChimeAt < MIN_GAP_MS) return false;
  return true;
}

/**
 * Two-tone chime. Browsers only allow audio after a user gesture: the context is
 * created/resumed on the first touch anywhere in the app (see unlockOnFirstGesture).
 */
export class Chime {
  private ctx: AudioContext | null = null;

  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
    } catch {
      /* audio not available */
    }
  }

  unlockOnFirstGesture(): void {
    const handler = () => { this.unlock(); };
    // Kept for the whole session: a phone waking up can suspend the context again.
    window.addEventListener("pointerdown", handler, { passive: true });
    window.addEventListener("keydown", handler);
  }

  play(volume: number): void {
    this.unlock();
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const v = Math.max(0, Math.min(1, volume));
    if (v === 0) return;
    const start = ctx.currentTime + 0.01;
    // "ding-dong": 880 Hz then 660 Hz, soft attack and decay.
    this.tone(ctx, 880, start, 0.22, v);
    this.tone(ctx, 660, start + 0.18, 0.32, v);
  }

  private tone(ctx: AudioContext, freq: number, at: number, duration: number, volume: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.35 * volume + 0.0001, at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + duration + 0.05);
  }
}
