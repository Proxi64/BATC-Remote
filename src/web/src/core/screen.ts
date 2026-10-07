import { registerPlugin } from "@capacitor/core";
import type { LogSource } from "../protocol/types";

/**
 * Android app only: keeps the screen on during a flight, dims it after a while
 * without touch, and brings the normal brightness back on a touch, when ATC
 * calls the pilot, or (optionally) when the phone is picked up or moved.
 * (A browser cannot do this over plain HTTP.)
 */

/** Delay without touch before dimming the screen. */
export const DIM_AFTER_MS = 30_000;

/** Motion sensitivity: 1 = least sensitive … 10 = most sensitive. */
export const MOTION_SENSITIVITY_MIN = 1;
export const MOTION_SENSITIVITY_MAX = 10;

/** Native side (ScreenPlugin.java). */
export interface ScreenNative {
  keepOn(on: boolean): void;
  setDim(dim: boolean): void;
  /** While dimmed: watch the accelerometer; the native side reports a motion once, then stops. */
  watchMotion(on: boolean, sensitivity: number): void;
}

/** Does this message wake the screen? Only what ATC addresses to our aircraft. */
export function wakesScreen(source: LogSource): boolean {
  return source === "atc" || source === "cpdlcAtc";
}

export interface ScreenKeeperOptions {
  /** Read on every restart of the timer: the setting can change at any time. */
  dimEnabled: () => boolean;
  /** Wake the dimmed screen when the phone is picked up or moved. */
  motionEnabled?: () => boolean;
  /** 1 … 10 */
  motionSensitivity?: () => number;
  /** Injectable for tests */
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
}

/** Pure logic, unit-tested; the native calls are injected. */
export class ScreenKeeper {
  private active = false;
  private dimmed = false;
  private watchingMotion = false;
  private timer: unknown = undefined;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (id: unknown) => void;

  constructor(private readonly native: ScreenNative, private readonly opts: ScreenKeeperOptions) {
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? (id => clearTimeout(id as ReturnType<typeof setTimeout>));
  }

  get isActive(): boolean { return this.active; }
  get isDimmed(): boolean { return this.dimmed; }
  get isWatchingMotion(): boolean { return this.watchingMotion; }

  /** The phone was picked up or moved (reported by the native side while dimmed). */
  motion(): void {
    this.watchingMotion = false;
    if (this.dimmed) this.wake();
  }

  /** In flight and setting on: keep the screen on. Otherwise: normal behaviour of the phone. */
  setActive(active: boolean): void {
    if (active === this.active) return;
    this.active = active;
    this.native.keepOn(active);
    if (active) {
      this.restartTimer();
    } else {
      this.stopTimer();
      this.undim();
    }
  }

  /**
   * The user touched the screen. Returns true when the screen was dimmed: that
   * touch only wakes it up and must not press the button under the finger.
   */
  touch(): boolean {
    if (!this.active) return false;
    const wasDimmed = this.dimmed;
    this.wake();
    return wasDimmed;
  }

  /** Normal brightness again (touch, ATC call, dialog…) and a new 30 s delay. */
  wake(): void {
    if (!this.active) return;
    this.undim();
    this.restartTimer();
  }

  /** A screen setting changed (dimming, motion, sensitivity). */
  refresh(): void {
    if (!this.active) return;
    if (!this.opts.dimEnabled()) this.undim();
    if (this.dimmed) {
      this.stopMotion();
      this.startMotion();
    }
    this.restartTimer();
  }

  private undim(): void {
    if (!this.dimmed) return;
    this.dimmed = false;
    this.stopMotion();
    this.native.setDim(false);
  }

  private startMotion(): void {
    if (!this.opts.motionEnabled?.()) return;
    const s = Math.round(this.opts.motionSensitivity?.() ?? 5);
    this.watchingMotion = true;
    this.native.watchMotion(true, Math.min(MOTION_SENSITIVITY_MAX, Math.max(MOTION_SENSITIVITY_MIN, s)));
  }

  private stopMotion(): void {
    if (!this.watchingMotion) return;
    this.watchingMotion = false;
    this.native.watchMotion(false, 0);
  }

  private stopTimer(): void {
    if (this.timer !== undefined) this.clearTimer(this.timer);
    this.timer = undefined;
  }

  private restartTimer(): void {
    this.stopTimer();
    if (!this.active || !this.opts.dimEnabled()) return;
    this.timer = this.setTimer(() => {
      this.timer = undefined;
      if (!this.active || this.dimmed) return;
      this.dimmed = true;
      this.native.setDim(true);
      this.startMotion();
    }, DIM_AFTER_MS);
  }
}

interface ScreenPlugin {
  keepOn(options: { on: boolean }): Promise<void>;
  setDim(options: { dim: boolean }): Promise<void>;
  watchMotion(options: { on: boolean; sensitivity: number }): Promise<{ available: boolean }>;
  addListener(event: "motion", fn: () => void): Promise<unknown>;
}

/**
 * Native implementation (Android app). Errors are ignored: the screen simply behaves as usual.
 * onMotion is called when the phone is picked up or moved while the screen is dimmed.
 */
export function nativeScreen(onMotion: () => void): ScreenNative {
  const plugin = registerPlugin<ScreenPlugin>("Screen");
  plugin.addListener("motion", onMotion).catch(() => { /* ignore */ });
  return {
    keepOn: on => { plugin.keepOn({ on }).catch(() => { /* ignore */ }); },
    setDim: dim => { plugin.setDim({ dim }).catch(() => { /* ignore */ }); },
    watchMotion: (on, sensitivity) => { plugin.watchMotion({ on, sensitivity }).catch(() => { /* ignore */ }); }
  };
}
