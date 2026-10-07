import { effect, signal } from "@preact/signals";
import { Commands, type StartFlightMode, type VoiceSample } from "../protocol/commands";
import { parseMessage } from "../protocol/parser";
import { BatcConnection, type ConnectionStatus } from "./connection";
import { resolveBatcUrl, type PcConfig } from "./host";
import { Chime, REPLAY_QUIET_MS, shouldNotify } from "./notify";
import { isNativeApp, pageLocation } from "./platform";
import { prefs, updatePrefs } from "./prefs";
import { scanPcQr, type ScanOutcome } from "./scanner";
import { nativeScreen, ScreenKeeper, wakesScreen } from "./screen";
import { BatcStore } from "./store";

export interface ConnectionInfo {
  status: ConnectionStatus;
  url: string | null;
  attempt: number;
  nextRetryMs?: number;
  /** Has this device already been connected in this session? */
  everConnected: boolean;
  /** Timestamp of the disconnection (null if connected). */
  downSince: number | null;
}

/**
 * Wires connection + parser + store, and exposes the user actions.
 * The UI only talks to this object.
 */
export class BatcController {
  readonly store = new BatcStore();
  /** Configuration published by BatcRemote.exe (null = not available, e.g. dev server). */
  readonly pcConfig = signal<PcConfig | null>(null);
  readonly conn = signal<ConnectionInfo>({ status: "idle", url: null, attempt: 0, everConnected: false, downSince: Date.now() });

  private readonly connection: BatcConnection;
  readonly chime = new Chime();
  /** Android app: screen kept on during a flight, dimmed when idle (null in a browser). */
  readonly screen: ScreenKeeper | null = isNativeApp()
    ? new ScreenKeeper(nativeScreen(() => this.screen?.motion()), {
        dimEnabled: () => prefs.value.dimWhenIdle,
        motionEnabled: () => prefs.value.wakeOnMotion,
        motionSensitivity: () => prefs.value.motionSensitivity
      })
    : null;
  /** A touch that only woke the dimmed screen must not also "click" what is under the finger. */
  private swallowClickUntil = 0;
  /** No chime before this time (history replayed after a (re)connection). */
  private quietUntil = 0;
  private lastChimeAt = 0;
  private settingsTimer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly loc: { hostname: string; search: string; protocol: string } = pageLocation()) {
    this.connection = new BatcConnection({
      url: () => this.currentUrl() ?? "ws://127.0.0.1:41716",
      onFrame: frame => this.onFrame(frame),
      onStatus: (status, d) => this.onStatus(status, d.attempt, d.nextRetryMs),
      onOpen: () => this.onOpen()
    });
    // Immediate address (without waiting for /api/config), so the UI never shows an empty state.
    this.conn.value = { ...this.conn.value, url: this.currentUrl() };
  }

  currentUrl(): string | null {
    return resolveBatcUrl({ host: prefs.value.host, port: prefs.value.port }, this.pcConfig.value, this.loc);
  }

  /**
   * Reads /api/config from BatcRemote.exe (BeyondATC address and port chosen on the PC).
   * Silent failure: dev server, page opened as a local file, PC unreachable…
   */
  async loadPcConfig(): Promise<void> {
    // No PC to ask: page opened as a local file, or running inside the Android app.
    if (this.loc.protocol === "file:" || this.loc.protocol === "app:") return;
    const now = Date.now();
    if (now - this.lastConfigFetch < 4000) return;
    this.lastConfigFetch = now;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    try {
      const res = await fetch("/api/config", { cache: "no-store", signal: ctrl.signal });
      if (!res.ok) return;
      const data = await res.json() as Partial<PcConfig>;
      if (typeof data !== "object" || data === null) return;
      const next: PcConfig = { batcHost: String(data.batcHost ?? ""), batcPort: Number(data.batcPort) || 0 };
      const cur = this.pcConfig.value;
      if (!cur || cur.batcHost !== next.batcHost || cur.batcPort !== next.batcPort) {
        this.pcConfig.value = next;
        this.conn.value = { ...this.conn.value, url: this.currentUrl() };
      }
    } catch {
      /* no configuration: automatic mode */
    } finally {
      clearTimeout(timer);
    }
  }
  private lastConfigFetch = 0;

  async start(): Promise<void> {
    await this.loadPcConfig();
    this.conn.value = { ...this.conn.value, url: this.currentUrl() };
    if (!this.currentUrl()) return; // opened as a local file with no host: the UI asks for the address
    this.connection.start();
    if (this.listening) return;
    this.listening = true;
    this.chime.unlockOnFirstGesture();
    this.setupScreen();
    // Coming back from sleep / switching apps: check right away that the connection is still alive.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      void this.loadPcConfig();
      this.connection.checkAlive();
      this.screen?.wake();
    });
    window.addEventListener("online", () => this.connection.reconnectNow());
    window.addEventListener("pageshow", () => this.connection.checkAlive());
  }
  private listening = false;

  /** After changing the address in the preferences. */
  reconnect(): void {
    this.conn.value = { ...this.conn.value, url: this.currentUrl() };
    if (!this.currentUrl()) return;
    if (!this.listening) { this.start(); return; }
    this.connection.reconnectNow();
  }

  /** Android app: scan the QR code of BatcRemote.exe and use the BeyondATC address it leads to. */
  async scanForPc(): Promise<ScanOutcome> {
    const r = await scanPcQr();
    if (r.kind === "ok") {
      updatePrefs({ host: r.target.host, port: r.target.port });
      this.reconnect();
    }
    return r;
  }

  get isOpen(): boolean { return this.connection.isOpen; }

  // ---------- pilot actions ----------

  sendAction(label: string): boolean {
    if (!this.send(Commands.setAction(label))) return false;
    this.store.markActionSent(label);
    return true;
  }
  tuneCom1(freq: string): boolean { return this.send(Commands.setFrequencyCom1(freq)); }
  tuneCom2(freq: string): boolean { return this.send(Commands.setFrequencyCom2(freq)); }
  setAutoTune(on: boolean): void { if (this.send(Commands.setAutoTune(on))) this.store.autoTune.value = on; }
  setAutoRespond(on: boolean): void { if (this.send(Commands.setAutoRespond(on))) this.store.autoRespond.value = on; }
  setSetting(key: string, value: unknown): void {
    if (!this.send(Commands.setSetting(key, value))) return;
    const cur = this.store.settings.value;
    if (cur) this.store.settings.value = { ...cur, [key]: value };
  }
  playSample(which: VoiceSample): void { this.send(Commands.playSample(which)); }
  startFlight(mode: StartFlightMode): void { this.send(Commands.startFlight(mode)); }
  answerPrompt(yes: boolean): void {
    const p = this.store.prompt.value;
    if (!p) return;
    if (this.send(Commands.promptReply(p.id, yes))) this.store.prompt.value = null;
  }
  ackError(): void { this.send(Commands.ackError()); this.store.appError.value = null; }
  quitToMenu(): void { this.send(Commands.quitToMenu()); }
  turnaround(): void {
    if (!this.send(Commands.turnaround())) return;
    this.store.loadState.value = { ...this.store.loadState.value, stage: "download", text: "Starting Turnaround…", pct: -1 };
  }
  refreshFrequencies(): void { this.send(Commands.datis()); this.send(Commands.frequencies()); }
  refreshLog(): void { this.store.clearLog(); this.send(Commands.atcLog()); }

  // ---------- internal ----------

  /** Plays the notification chime once (settings "Test" button). */
  testChime(): void {
    this.chime.play(prefs.value.notifyVolume);
  }

  /**
   * Android app: screen kept on while connected to a flight (not on the BeyondATC menu),
   * dimmed after 30 s without touch, back to normal on a touch or an ATC call.
   */
  private setupScreen(): void {
    const screen = this.screen;
    if (!screen) return;
    effect(() => {
      const inFlight = this.conn.value.status === "open" && this.store.loadState.value.stage !== "menu";
      screen.setActive(prefs.value.keepScreenOn && inFlight);
    });
    const screenSettings = () => `${prefs.value.dimWhenIdle}|${prefs.value.wakeOnMotion}|${prefs.value.motionSensitivity}`;
    let last = screenSettings();
    effect(() => {
      const now = screenSettings();
      if (now === last) return;
      last = now;
      screen.refresh();
    });
    window.addEventListener("pointerdown", e => {
      this.swallowClickUntil = 0;
      if (!screen.touch()) return;
      // The screen was dimmed: this touch only brings the brightness back,
      // and the click that follows it is cancelled.
      e.preventDefault();
      e.stopPropagation();
      this.swallowClickUntil = Date.now() + 1500;
    }, { capture: true });
    window.addEventListener("click", e => {
      if (Date.now() >= this.swallowClickUntil) return;
      this.swallowClickUntil = 0;
      e.preventDefault();
      e.stopPropagation();
    }, { capture: true });
    window.addEventListener("keydown", () => { screen.touch(); }, { capture: true });
  }

  private onFrame(frame: string): void {
    const msg = parseMessage(frame);
    this.store.apply(msg);
    const now = Date.now();
    // Something needs the pilot's attention: normal brightness again (Android app).
    if ((msg.kind === "prompt" || msg.kind === "appError") && msg.value) this.screen?.wake();
    if (msg.kind !== "log") return;
    if (wakesScreen(msg.source) && now >= this.quietUntil) this.screen?.wake();
    if (shouldNotify(msg.source, prefs.value, now, this.quietUntil, this.lastChimeAt)) {
      this.lastChimeAt = now;
      this.chime.play(prefs.value.notifyVolume);
    }
  }

  private send(cmd: string): boolean {
    return this.connection.send(cmd);
  }

  private onOpen(): void {
    this.quietUntil = Date.now() + REPLAY_QUIET_MS;
    // BeyondATC sends a snapshot of the state by itself; the log history and
    // the frequencies (never sent spontaneously) still have to be requested.
    this.store.clearLog();
    this.send(Commands.atcLog());
    this.send(Commands.settings());
    this.refreshFrequencies();
    clearInterval(this.settingsTimer);
    this.settingsTimer = setInterval(() => {
      if (this.store.settings.value || !this.connection.isOpen) { clearInterval(this.settingsTimer); return; }
      this.send(Commands.settings());
    }, 3000);
  }

  private onStatus(status: ConnectionStatus, attempt: number, nextRetryMs?: number): void {
    const prev = this.conn.value;
    const open = status === "open";
    this.conn.value = {
      status,
      url: this.currentUrl(),
      attempt,
      nextRetryMs,
      everConnected: prev.everConnected || open,
      downSince: open ? null : (prev.downSince ?? Date.now())
    };
    // Between two attempts, re-read the PC configuration: the BeyondATC address may have changed.
    if (status === "waiting") void this.loadPcConfig();
    if (!open && prev.status === "open") {
      // Stale information must not be used to act: we mark the flight as unknown.
      this.store.prompt.value = null;
      this.store.appError.value = null;
    }
  }
}
