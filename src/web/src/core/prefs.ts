import { effect, signal } from "@preact/signals";

/** Preferences local to the device (never sent to BeyondATC). */
export interface Prefs {
  /** BeyondATC IP forced on this device. Empty = PC configuration / automatic. */
  host: string;
  /** BeyondATC port forced on this device. Empty = PC configuration / 41716. */
  port: string;
  showTraffic: boolean;
  showCpdlc: boolean;
  /** Text size: 1 = normal */
  textScale: number;
  haptics: boolean;
  /** Chime when ATC addresses the pilot. */
  notifySound: boolean;
  /** Also for CPDLC messages from ATC. */
  notifyCpdlc: boolean;
  /** Chime volume, 0–1. */
  notifyVolume: number;
  /** Android app: keep the screen on during a flight. */
  keepScreenOn: boolean;
  /** Android app: dim the screen after 30 s without touch (needs keepScreenOn). */
  dimWhenIdle: boolean;
  /** Android app: normal brightness again when the phone is picked up or moved. */
  wakeOnMotion: boolean;
  /** 1 (least sensitive) … 10 (most sensitive). */
  motionSensitivity: number;
}

const KEY = "batcRemote.prefs.v1";

const DEFAULTS: Prefs = {
  host: "",
  port: "",
  showTraffic: true,
  showCpdlc: true,
  textScale: 1,
  haptics: true,
  notifySound: true,
  notifyCpdlc: true,
  notifyVolume: 0.7,
  keepScreenOn: true,
  dimWhenIdle: true,
  wakeOnMotion: true,
  motionSensitivity: 5
};

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* private browsing, storage blocked… */ }
  return { ...DEFAULTS };
}

export const prefs = signal<Prefs>(load());

export function updatePrefs(patch: Partial<Prefs>): void {
  prefs.value = { ...prefs.value, ...patch };
}

effect(() => {
  const v = prefs.value;
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* ignore */ }
});
