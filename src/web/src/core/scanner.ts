import { CapacitorHttp, registerPlugin } from "@capacitor/core";
import { BATC_PORT } from "../protocol/types";
import { isNativeApp } from "./platform";

/**
 * "Scan the PC's QR code" (Android app only).
 * The QR code shown by BatcRemote.exe holds the page address, e.g. http://192.168.1.20:8741/.
 * The app takes the PC address from it, then asks the PC where BeyondATC is (GET /api/config).
 */

/** What the QR code tells us. */
export interface ScannedPc {
  /** PC (or BeyondATC) host name / IP. */
  pcHost: string;
  pcPort: number | null;
  /** true = the QR code holds a bare "ip[:port]": it is BeyondATC itself, no PC to ask. */
  direct: boolean;
}

/** Address kept on the phone (same meaning as the Settings → Connection fields). */
export interface ScanTarget {
  host: string;
  /** Empty = default port 41716. */
  port: string;
  /** true = the BeyondATC address/port come from the PC settings (/api/config). */
  fromPc: boolean;
}

export function parseScanned(text: string): ScannedPc | null {
  const t = text.trim();
  if (/^https?:\/\//i.test(t)) {
    try {
      const u = new URL(t);
      const host = u.hostname.replace(/^\[|\]$/g, "");
      if (!host) return null;
      return { pcHost: host, pcPort: u.port ? Number(u.port) : u.protocol === "https:" ? 443 : 80, direct: false };
    } catch {
      return null;
    }
  }
  const m = /^([A-Za-z0-9.\-_]+)(?::(\d{1,5}))?$/.exec(t);
  if (m) return { pcHost: m[1], pcPort: m[2] ? Number(m[2]) : null, direct: true };
  return null;
}

const isLoopback = (h: string) => h === "localhost" || h === "::1" || h.startsWith("127.");
const portField = (p: number | null | undefined) => (p && p !== BATC_PORT && p > 0 && p < 65536 ? String(p) : "");

export async function targetFromScan(
  s: ScannedPc,
  fetchFn: typeof fetch = fetch,
  timeoutMs = 3000
): Promise<ScanTarget> {
  if (s.direct) return { host: s.pcHost, port: portField(s.pcPort), fromPc: false };

  const host = s.pcHost.includes(":") ? `[${s.pcHost}]` : s.pcHost;
  const base = `http://${host}${s.pcPort && s.pcPort !== 80 ? `:${s.pcPort}` : ""}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchFn(`${base}/api/config`, { cache: "no-store", signal: ctrl.signal });
    if (res.ok) {
      const d = (await res.json()) as { batcHost?: unknown; batcPort?: unknown };
      const batcHost = String(d?.batcHost ?? "").trim();
      // Empty (or loopback) on the PC = "BeyondATC runs on this PC" → the PC address seen from the phone.
      const target = batcHost && !isLoopback(batcHost) ? batcHost : s.pcHost;
      return { host: target, port: portField(Number(d?.batcPort)), fromPc: true };
    }
  } catch {
    /* old BatcRemote.exe, firewall, timeout… */
  } finally {
    clearTimeout(timer);
  }
  // PC settings unreadable: BeyondATC on the PC itself, default port.
  return { host: s.pcHost, port: "", fromPc: false };
}

interface QrScannerPlugin {
  scan(): Promise<{ value?: string; cancelled?: boolean }>;
}
const QrScanner = registerPlugin<QrScannerPlugin>("QrScanner");

export type ScanOutcome =
  | { kind: "ok"; target: ScanTarget }
  | { kind: "cancelled" }
  | { kind: "invalid" }
  | { kind: "unavailable" };

/** Only in the Android app (Google Play services scanner). */
export const canScan = (): boolean => isNativeApp();

/**
 * In the app, /api/config is read through Android's own HTTP client: a request from the
 * WebView page to the PC would be cross-origin (and may be blocked on some WebView versions).
 */
const nativeFetch = (async (url: string) => {
  const r = await CapacitorHttp.get({ url, connectTimeout: 3000, readTimeout: 3000, headers: { "Cache-Control": "no-store" } });
  return {
    ok: r.status >= 200 && r.status < 300,
    json: async () => (typeof r.data === "string" ? JSON.parse(r.data) : r.data)
  };
}) as unknown as typeof fetch;

export async function scanPcQr(): Promise<ScanOutcome> {
  if (!canScan()) return { kind: "unavailable" };
  let r: { value?: string; cancelled?: boolean };
  try {
    r = await QrScanner.scan();
  } catch {
    return { kind: "unavailable" };
  }
  if (r.cancelled || !r.value) return { kind: "cancelled" };
  const s = parseScanned(r.value);
  if (!s) return { kind: "invalid" };
  return { kind: "ok", target: await targetFromScan(s, nativeFetch) };
}
