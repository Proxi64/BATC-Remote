import type {
  AppError, AppPrompt, BatcSettings, CallsignInfo, Com2Info, FlightProgress,
  FrequencyEntry, InfoBox, LoadState, LogSource, ServerMessage
} from "./types";

/**
 * Parses one BeyondATC text frame. Never throws: malformed payloads become
 * { kind: "invalid" }, unknown prefixes become { kind: "unknown" }.
 */
export function parseMessage(frame: string): ServerMessage {
  const raw = frame.replace(/\r?\n$/, "");
  const colon = raw.indexOf(":");
  const prefix = colon > 0 ? raw.slice(0, colon) : raw.trim();
  // BeyondATC writes "Prefix: payload"; a few messages omit the space.
  const payload = colon > 0 ? raw.slice(colon + 1).replace(/^ /, "") : "";

  const logSource = LOG_PREFIXES[prefix];
  if (logSource) return { kind: "log", source: logSource, text: payload.trim() };

  try {
    switch (prefix) {
      case "Facility": return parseFacility(payload);
      case "Com2": return { kind: "com2", value: parseCom2(payload) };
      case "RadioMute": {
        const o = asObject(json(payload));
        return { kind: "radioMute", com1: !!o.com1, com2: !!o.com2 };
      }
      case "Callsign": return { kind: "callsign", value: parseCallsign(payload) };
      case "InfoBoxes": return { kind: "infoBoxes", items: parseInfoBoxes(payload) };
      case "Progress": return { kind: "progress", value: parseProgress(payload) };
      case "AutoTune": return { kind: "autoTune", value: parseBool(payload) };
      case "AutoRespond": return { kind: "autoRespond", value: parseBool(payload) };
      case "HideActions": return { kind: "hideActions", value: parseBool(payload) };
      case "Actions": return { kind: "actions", items: parseActions(payload) };
      case "CommsState": {
        const o = asObject(json(payload));
        return { kind: "commsState", mode: str(o.mode) || "ready", text: str(o.text) };
      }
      case "Frequencies": return { kind: "frequencies", items: parseFrequencies(payload) };
      case "DATIS": return parseDatis(payload);
      case "DATIS_END": return { kind: "datisEnd" };
      case "LoadState": return { kind: "loadState", value: parseLoadState(payload) };
      case "Wipe": return { kind: "wipe" };
      case "AppError": return { kind: "appError", value: parseAppError(payload) };
      case "Prompt": return { kind: "prompt", value: parsePrompt(payload) };
      case "Settings": return { kind: "settings", value: asObject(json(payload)) as BatcSettings };
      case "ToolbarVersion": return { kind: "toolbarVersion", version: payload.trim() };
      case "Pong": return { kind: "pong" };
      case "CPDLCCode": return { kind: "cpdlcCode", code: payload.trim() };
      case "QueuedAction": return { kind: "queuedAction", text: payload.trim() };
      case "Donut": return { kind: "donut" };
      default: return { kind: "unknown", prefix, raw };
    }
  } catch (e) {
    return { kind: "invalid", prefix, raw, error: e instanceof Error ? e.message : String(e) };
  }
}

const LOG_PREFIXES: Record<string, LogSource | undefined> = {
  ATC: "atc",
  ATCTraffic: "atcTraffic",
  Player: "player",
  Traffic: "traffic",
  CPDLC_ATC: "cpdlcAtc",
  CPDLC_Pilot: "cpdlcPilot"
};

// ---------- helpers ----------

function json(payload: string): unknown {
  return JSON.parse(payload.trim());
}
function asObject(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  throw new Error("JSON object expected");
}
function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}
function num(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : parseFloat(str(v));
  return Number.isFinite(n) ? n : fallback;
}
function parseBool(payload: string): boolean {
  const v = payload.trim().toLowerCase();
  if (v === "true") return true;
  if (v === "false") return false;
  throw new Error(`boolean expected, got "${payload}"`);
}
/** Empty payload = "clear" for Com2, Callsign, AppError, Prompt, Progress. */
function isEmpty(payload: string): boolean {
  return payload.trim() === "";
}

// ---------- per message ----------

function parseFacility(payload: string): ServerMessage {
  const [name, ...rest] = payload.split("|");
  const freq = rest.join("|").trim();
  return { kind: "facility", name: (name ?? "").trim(), frequency: freq === "" ? null : freq };
}

function parseCom2(payload: string): Com2Info | null {
  if (isEmpty(payload)) return null;
  const o = asObject(json(payload));
  const label = str(o.label).trim();
  if (!label) return null;
  return { label, frequency: str(o.frequency).trim(), monitor: !!o.monitor };
}

function parseCallsign(payload: string): CallsignInfo | null {
  if (isEmpty(payload)) return null;
  const o = asObject(json(payload));
  const full = str(o.full).trim();
  if (!full) return null;
  return { full, shortForm: str(o.shortForm).trim() };
}

function parseInfoBoxes(payload: string): InfoBox[] {
  if (isEmpty(payload)) return [];
  const arr = json(payload);
  if (!Array.isArray(arr)) throw new Error("JSON array expected");
  return arr
    .filter(b => b && typeof b === "object")
    .map((b: Record<string, unknown>) => ({
      title: str(b.title).trim(),
      lines: str(b.info).split(/<br\s*\/?>/i).map(s => s.trim()).filter(Boolean)
    }));
}

function parseProgress(payload: string): FlightProgress | null {
  if (isEmpty(payload)) return null;
  const o = asObject(json(payload));
  const from = str(o.from).trim(), to = str(o.to).trim();
  if (!from || !to) return null;
  return { from, to, pct: Math.max(0, Math.min(100, num(o.pct, 0))) };
}

/** "[A¬B¬C¬]" — "¬" (U+00AC) separator, trailing separator, "," fallback (older versions). */
export function parseActions(payload: string): string[] {
  let body = payload.trim();
  if (body.startsWith("[")) body = body.slice(1);
  if (body.endsWith("]")) body = body.slice(0, -1);
  const parts = body.includes("¬") ? body.split("¬") : body.split(",");
  return parts.map(s => s.trim()).filter(s => s !== "");
}

function parseFrequencies(payload: string): FrequencyEntry[] {
  // BeyondATC can emit a trailing comma: "[{…},]"
  const cleaned = payload.trim().replace(/,\s*]$/, "]");
  if (cleaned === "") return [];
  const arr = JSON.parse(cleaned);
  if (!Array.isArray(arr)) throw new Error("JSON array expected");
  return arr
    .filter(f => f && typeof f === "object")
    .map((f: Record<string, unknown>) => ({
      type: str(f.type).trim() || "None",
      airport: str(f.airport).trim(),
      airportName: str(f.airportName).trim(),
      frequency: str(f.frequency).trim(),
      name: str(f.name).trim(),
      stationType: str(f.stationType).trim(),
      runways: str(f.runways).trim().split(/\s+/).filter(Boolean),
      cpdlcLogonCode: str(f.cpdlcLogonCode).trim()
    }));
}

function parseDatis(payload: string): ServerMessage {
  const [icao = "", letter = "", ...rest] = payload.split("|");
  return { kind: "datis", icao: icao.trim(), letter: letter.trim(), text: rest.join("|").trim() };
}

function parseLoadState(payload: string): LoadState {
  const o = asObject(json(payload));
  return {
    stage: str(o.stage) || "ready",
    text: str(o.text),
    pct: typeof o.pct === "number" ? o.pct : -1,
    vfr: !!o.vfr,
    loggedIn: o.loggedIn !== false
  };
}

function parseAppError(payload: string): AppError | null {
  if (isEmpty(payload)) return null;
  const o = asObject(json(payload));
  return { fatal: !!o.fatal, text: str(o.text) };
}

function parsePrompt(payload: string): AppPrompt | null {
  if (isEmpty(payload)) return null;
  const o = asObject(json(payload));
  const id = str(o.id);
  if (!id) return null;
  return {
    id,
    title: str(o.title) || "BeyondATC",
    text: str(o.text),
    yesLabel: str(o.yesLabel) || "Yes",
    noLabel: str(o.noLabel) || "No"
  };
}
