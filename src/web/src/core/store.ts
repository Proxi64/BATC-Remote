import { batch, computed, signal } from "@preact/signals";
import type {
  AppError, AppPrompt, BatcSettings, CallsignInfo, Com2Info, FlightProgress,
  FrequencyEntry, InfoBox, LoadState, LogSource, ServerMessage
} from "../protocol/types";
import { groupFrequencies } from "./frequencies";

export interface LogEntry {
  id: number;
  at: number;
  source: LogSource;
  text: string;
}

export interface DatisInfo { letter: string; text: string }

/** Timings observed in the real capture (see Documentation/TECHNICAL.md §6). */
export const ACTIONS_DEBOUNCE_MS = 200;
export const ACTIONS_REVEAL_DELAY_MS = 250;
export const LOG_MAX = 400;

const IDLE_MODES = new Set(["ready", "traffic"]);

/**
 * Application state. One signal per area: a Progress message (every 5 s)
 * only redraws the progress bar, not the whole interface.
 */
export class BatcStore {
  // --- flight / radio ---
  readonly facility = signal<{ name: string; frequency: string | null } | null>(null);
  readonly com2 = signal<Com2Info | null>(null);
  readonly radioMute = signal({ com1: false, com2: false });
  readonly callsign = signal<CallsignInfo | null>(null);
  readonly infoBoxes = signal<InfoBox[]>([]);
  readonly progress = signal<FlightProgress | null>(null);
  readonly cpdlcCode = signal("");

  // --- co-pilot ---
  readonly autoTune = signal<boolean | null>(null);
  readonly autoRespond = signal<boolean | null>(null);

  // --- actions & radio exchange ---
  /** Stable list shown to the user (after the anti-bounce delay). */
  readonly actions = signal<string[]>([]);
  readonly comms = signal({ mode: "ready", text: "" });
  /** false while an exchange is in progress (actions hidden). */
  readonly actionsVisible = signal(true);
  /** Action sent from this device, awaiting BeyondATC's reaction. */
  readonly pendingAction = signal<string | null>(null);

  // --- log ---
  readonly log = signal<LogEntry[]>([]);

  // --- frequencies ---
  readonly frequencies = signal<FrequencyEntry[] | null>(null);
  readonly datis = signal<Map<string, DatisInfo>>(new Map());

  // --- app lifecycle ---
  readonly loadState = signal<LoadState>({ stage: "ready", text: "", pct: -1, vfr: false, loggedIn: true });
  readonly appError = signal<AppError | null>(null);
  readonly prompt = signal<AppPrompt | null>(null);
  readonly settings = signal<BatcSettings | null>(null);
  readonly toolbarVersion = signal("");
  readonly unknownPrefixes = signal<string[]>([]);

  readonly groupedFrequencies = computed(() => {
    const f = this.frequencies.value;
    return f ? groupFrequencies(f) : null;
  });

  readonly busy = computed(() => !IDLE_MODES.has(this.comms.value.mode));

  private logSeq = 0;
  private pendingDatis: Array<{ icao: string; letter: string; text: string }> = [];
  private actionsTimer: ReturnType<typeof setTimeout> | undefined;
  private revealTimer: ReturnType<typeof setTimeout> | undefined;
  private pendingActionTimer: ReturnType<typeof setTimeout> | undefined;

  apply(msg: ServerMessage): void {
    switch (msg.kind) {
      case "log": return this.addLog(msg.source, msg.text);
      case "facility": {
        const cur = this.facility.value;
        if (!cur || cur.name !== msg.name || cur.frequency !== msg.frequency) this.facility.value = { name: msg.name, frequency: msg.frequency };
        return;
      }
      case "com2": return void (this.com2.value = msg.value);
      case "radioMute": return void (this.radioMute.value = { com1: msg.com1, com2: msg.com2 });
      case "callsign": return void (this.callsign.value = msg.value);
      case "infoBoxes": return void (this.infoBoxes.value = msg.items);
      case "progress": {
        const p = this.progress.value, n = msg.value;
        if (!p || !n || p.from !== n.from || p.to !== n.to || p.pct !== n.pct) this.progress.value = n;
        return;
      }
      case "cpdlcCode": return void (this.cpdlcCode.value = msg.code);
      case "autoTune": return void (this.autoTune.value = msg.value);
      case "autoRespond": return void (this.autoRespond.value = msg.value);
      case "actions": return this.scheduleActions(msg.items);
      case "commsState": return this.applyComms(msg.mode, msg.text);
      case "hideActions": return this.applyComms(msg.value ? "speaking" : "ready", "");
      case "frequencies": return void (this.frequencies.value = msg.items);
      case "datis": return void this.pendingDatis.push({ icao: msg.icao, letter: msg.letter, text: msg.text });
      case "datisEnd": {
        const m = new Map<string, DatisInfo>();
        for (const d of this.pendingDatis) if (d.icao) m.set(d.icao, { letter: d.letter, text: d.text });
        this.pendingDatis = [];
        this.datis.value = m;
        return;
      }
      case "loadState": return void (this.loadState.value = msg.value);
      case "wipe": return this.wipeFlight({ stage: "loading", text: "", pct: -1 });
      case "appError": return void (this.appError.value = msg.value);
      case "prompt": return void (this.prompt.value = msg.value);
      case "settings": return void (this.settings.value = msg.value);
      case "toolbarVersion": return void (this.toolbarVersion.value = msg.version);
      case "unknown":
      case "invalid": {
        if (!this.unknownPrefixes.value.includes(msg.prefix)) this.unknownPrefixes.value = [...this.unknownPrefixes.value, msg.prefix];
        return;
      }
      // pong, queuedAction (known BeyondATC lag bug), donut: nothing to display
      default: return;
    }
  }

  /** Clears the log (before requesting a replay with atc_log). */
  clearLog(): void {
    this.log.value = [];
  }

  /** New flight or loss of connection: we forget everything about the flight. */
  wipeFlight(load?: Partial<LoadState>): void {
    clearTimeout(this.actionsTimer);
    clearTimeout(this.revealTimer);
    clearTimeout(this.pendingActionTimer);
    batch(() => {
      this.facility.value = null;
      this.com2.value = null;
      this.callsign.value = null;
      this.infoBoxes.value = [];
      this.progress.value = null;
      this.cpdlcCode.value = "";
      this.actions.value = [];
      this.comms.value = { mode: "ready", text: "" };
      this.actionsVisible.value = true;
      this.pendingAction.value = null;
      this.log.value = [];
      this.frequencies.value = null;
      this.datis.value = new Map();
      this.pendingDatis = [];
      this.prompt.value = null;
      if (load) this.loadState.value = { ...this.loadState.value, ...load };
    });
  }

  /** Marks an action as sent from this device (optimistic feedback). */
  markActionSent(label: string): void {
    this.pendingAction.value = label;
    clearTimeout(this.pendingActionTimer);
    // If BeyondATC does not react (action rejected), release the UI after 6 s.
    this.pendingActionTimer = setTimeout(() => { this.pendingAction.value = null; }, 6000);
  }

  // ---------- internal ----------

  private addLog(source: LogSource, text: string): void {
    const next = this.log.value.concat({ id: ++this.logSeq, at: Date.now(), source, text });
    this.log.value = next.length > LOG_MAX ? next.slice(next.length - LOG_MAX) : next;
  }

  /**
   * BeyondATC sends bursts "old list → [] → new list" within 2 ms:
   * only the last list received within the delay is kept.
   */
  private scheduleActions(items: string[]): void {
    clearTimeout(this.actionsTimer);
    this.actionsTimer = setTimeout(() => {
      const cur = this.actions.value;
      if (cur.length !== items.length || cur.some((a, i) => a !== items[i])) this.actions.value = items;
    }, ACTIONS_DEBOUNCE_MS);
  }

  /**
   * During an exchange the state goes back to "ready" for ~20 ms between two
   * steps: actions are hidden immediately, but only shown again after a delay.
   */
  private applyComms(mode: string, text: string): void {
    this.comms.value = { mode, text };
    if (!IDLE_MODES.has(mode)) {
      clearTimeout(this.revealTimer);
      this.actionsVisible.value = false;
      // BeyondATC has taken the request: the local feedback is no longer needed.
      clearTimeout(this.pendingActionTimer);
      this.pendingAction.value = null;
      return;
    }
    clearTimeout(this.revealTimer);
    this.revealTimer = setTimeout(() => { this.actionsVisible.value = true; }, ACTIONS_REVEAL_DELAY_MS);
  }
}
