import { BATC_PORT } from "../protocol/types";

/** Configuration published by BatcRemote.exe (GET /api/config). */
export interface PcConfig {
  /** Address of the PC running BeyondATC; empty = the PC that serves the app. */
  batcHost: string;
  batcPort: number;
}

/** Choice made on the phone (Settings → Connection); empty = use the PC configuration. */
export interface ManualTarget {
  host: string;
  port: string;
}

/**
 * Determines the BeyondATC WebSocket URL. Priority, for each part:
 *  1. ?host=ip[:port] in the address (handy for testing),
 *  2. the phone's preference (IP and/or port),
 *  3. the configuration of BatcRemote.exe (/api/config),
 *  4. automatic: the PC that serves the app, port 41716.
 * Returns null if no address can be determined (page opened as a local file, or Android app
 * with no address set yet).
 */
export function resolveBatcUrl(
  manual: ManualTarget,
  pc: PcConfig | null,
  loc: { hostname: string; search: string; protocol: string }
): string | null {
  const fromQuery = (new URLSearchParams(loc.search).get("host") ?? "").trim();
  if (fromQuery) return toWsUrl(fromQuery);

  const manualHost = cleanHost(manual.host);
  const manualPort = parsePort(manual.port);

  // Old format "ip:port" in the IP field: kept as is.
  if (manualHost && hasPort(manualHost)) return toWsUrl(manualHost);

  const autoHost = loc.protocol === "file:" || loc.protocol === "app:" ? "" : loc.hostname;
  const host = manualHost || cleanHost(pc?.batcHost ?? "") || autoHost;
  if (!host) return null;
  const port = manualPort ?? (pc?.batcPort && parsePort(String(pc.batcPort))) ?? BATC_PORT;
  return toWsUrl(`${bracketIpv6(host)}:${port}`);
}

export function toWsUrl(input: string): string {
  let s = cleanHost(input);
  s = bracketIpv6(s);
  if (!hasPort(s)) s = `${s}:${BATC_PORT}`;
  return `ws://${s}`;
}

export function displayHost(url: string): string {
  return url.replace(/^ws:\/\//, "");
}

export function parsePort(v: string | number | undefined | null): number | null {
  const n = typeof v === "number" ? v : parseInt(String(v ?? "").trim(), 10);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : null;
}

export function isValidHostInput(v: string): boolean {
  const s = cleanHost(v);
  if (s === "") return true;
  return /^[A-Za-z0-9.\-_:[\]]+$/.test(s);
}

function cleanHost(v: string): string {
  return v.trim().replace(/^wss?:\/\//i, "").replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

function hasPort(s: string): boolean {
  return /^\[.*\]:\d+$/.test(s) || /^[^:[\]]+:\d+$/.test(s);
}

function bracketIpv6(s: string): string {
  return s.split(":").length > 2 && !s.startsWith("[") ? `[${s}]` : s;
}
