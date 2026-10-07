/**
 * BeyondATC WebSocket protocol (toolbar v3.1) — typed model.
 * Reference: Documentation/TECHNICAL.md (§5 and §6).
 *
 * Every text frame received is "Prefix: payload". The parser turns it into
 * a ServerMessage; nothing else in the app reads raw frames.
 */

export type LogSource = "atc" | "atcTraffic" | "player" | "traffic" | "cpdlcAtc" | "cpdlcPilot";

/** ready | traffic | speaking | awaiting | processing | queued | request … (open list) */
export type CommsMode = string;

export interface Com2Info {
  label: string;
  frequency: string;
  monitor: boolean;
}

export interface CallsignInfo {
  full: string;
  shortForm: string;
}

export interface InfoBox {
  title: string;
  /** The "info" field split on <br> */
  lines: string[];
}

export interface FlightProgress {
  from: string;
  to: string;
  /** 0–100 */
  pct: number;
}

export interface FrequencyEntry {
  type: string;
  airport: string;
  airportName: string;
  frequency: string;
  name: string;
  stationType: string;
  runways: string[];
  cpdlcLogonCode: string;
}

export type LoadStage = "menu" | "loading" | "download" | "ready" | "turnaround" | string;

export interface LoadState {
  stage: LoadStage;
  text: string;
  /** -1 = indeterminate */
  pct: number;
  vfr: boolean;
  loggedIn: boolean;
}

export interface AppError {
  fatal: boolean;
  text: string;
}

export interface AppPrompt {
  id: string;
  title: string;
  text: string;
  yesLabel: string;
  noLabel: string;
}

export interface Option {
  value: string;
  label: string;
}

/** Settings as sent by BeyondATC. Every field is optional: absent = hidden in the UI. */
export interface BatcSettings {
  voiceVolume?: number;
  uiSounds?: boolean;
  controllerVoice?: string;
  trafficVoice?: string;
  trafficOn?: boolean;
  parkedDensity?: number;
  departuresDensity?: number;
  arrivalsDensity?: number;
  enrouteDensity?: number;
  navigraphLiveTraffic?: boolean;
  navigraphLinked?: boolean;
  navigraphUltimate?: boolean;
  taxiArrowsShown?: boolean;
  simIs2024?: boolean;
  dynamicVoiceOn?: boolean;
  dynamicVoiceGender?: number | string;
  autoRespondVoice?: number;
  autoRespondVoiceOptions?: string[];
  voiceQualityOptions?: Option[];
  voiceGenderOptions?: Option[];
  premiumUnits?: number;
  premiumUnitsMax?: number;
  [key: string]: unknown;
}

export type ServerMessage =
  | { kind: "log"; source: LogSource; text: string }
  | { kind: "facility"; name: string; frequency: string | null }
  | { kind: "com2"; value: Com2Info | null }
  | { kind: "radioMute"; com1: boolean; com2: boolean }
  | { kind: "callsign"; value: CallsignInfo | null }
  | { kind: "infoBoxes"; items: InfoBox[] }
  | { kind: "progress"; value: FlightProgress | null }
  | { kind: "autoTune"; value: boolean }
  | { kind: "autoRespond"; value: boolean }
  | { kind: "actions"; items: string[] }
  | { kind: "commsState"; mode: CommsMode; text: string }
  | { kind: "frequencies"; items: FrequencyEntry[] }
  | { kind: "datis"; icao: string; letter: string; text: string }
  | { kind: "datisEnd" }
  | { kind: "loadState"; value: LoadState }
  | { kind: "wipe" }
  | { kind: "appError"; value: AppError | null }
  | { kind: "prompt"; value: AppPrompt | null }
  | { kind: "settings"; value: BatcSettings }
  | { kind: "toolbarVersion"; version: string }
  | { kind: "pong" }
  | { kind: "cpdlcCode"; code: string }
  | { kind: "queuedAction"; text: string }
  | { kind: "hideActions"; value: boolean }
  | { kind: "donut" }
  | { kind: "unknown"; prefix: string; raw: string }
  | { kind: "invalid"; prefix: string; raw: string; error: string };

/** Protocol version this client was written against. */
export const PROTOCOL_VERSION = "3.1";
export const BATC_PORT = 41716;
