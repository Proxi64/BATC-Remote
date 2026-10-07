import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BatcConnection, type ConnectionStatus } from "../src/core/connection";
import { isValidHostInput, parsePort, resolveBatcUrl, toWsUrl } from "../src/core/host";

class FakeSocket {
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) { FakeSocket.all.push(this); }
  send(t: string) { this.sent.push(t); }
  close() { this.readyState = 3; this.onclose?.(); }
  // test helpers
  open() { this.readyState = 1; this.onopen?.(); }
  receive(t: string) { this.onmessage?.({ data: t }); }
  drop() { this.readyState = 3; this.onclose?.(); }
}

function make() {
  const statuses: ConnectionStatus[] = [];
  const frames: string[] = [];
  let opened = 0;
  const c = new BatcConnection({
    url: () => "ws://pc:41716",
    onFrame: f => frames.push(f),
    onStatus: s => statuses.push(s),
    onOpen: () => opened++,
    createSocket: url => new FakeSocket(url) as unknown as WebSocket,
    random: () => 0
  });
  return { c, statuses, frames, opened: () => opened };
}

beforeEach(() => { vi.useFakeTimers(); FakeSocket.all = []; });
afterEach(() => { vi.useRealTimers(); });

describe("connection", () => {
  it("connects, receives, sends", () => {
    const { c, frames, opened } = make();
    c.start();
    FakeSocket.all[0]!.open();
    expect(opened()).toBe(1);
    FakeSocket.all[0]!.receive("Facility: X|1");
    expect(frames).toEqual(["Facility: X|1"]);
    expect(c.send("atc_log")).toBe(true);
    expect(FakeSocket.all[0]!.sent).toEqual(["atc_log"]);
  });

  it("reconnects with increasing delays, then resets after success", () => {
    const { c } = make();
    c.start();
    FakeSocket.all[0]!.drop();                  // attempt 1 failed → 1 s
    vi.advanceTimersByTime(999); expect(FakeSocket.all).toHaveLength(1);
    vi.advanceTimersByTime(1);   expect(FakeSocket.all).toHaveLength(2);
    FakeSocket.all[1]!.drop();                  // → 2 s
    vi.advanceTimersByTime(2000); expect(FakeSocket.all).toHaveLength(3);
    FakeSocket.all[2]!.open();
    FakeSocket.all[2]!.drop();                  // after success → 1 s again
    vi.advanceTimersByTime(1000); expect(FakeSocket.all).toHaveLength(4);
  });

  it("gives up an opening stuck for more than 8 s", () => {
    const { c } = make();
    c.start();
    vi.advanceTimersByTime(8000);
    expect(FakeSocket.all[0]!.readyState).toBe(3);
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.all).toHaveLength(2);
  });

  it("pings every 15 s and restarts a silent connection", () => {
    const { c } = make();
    c.start();
    const s = FakeSocket.all[0]!;
    s.open();
    vi.advanceTimersByTime(15000);
    expect(s.sent).toContain("ping");
    // no message for more than 45 s → reconnection (detected at the next check, ≤ 60 s)
    vi.advanceTimersByTime(46000);
    expect(FakeSocket.all.length).toBeGreaterThan(1);
  });

  it("ignores the events of an old socket", () => {
    const { c, frames } = make();
    c.start();
    const old = FakeSocket.all[0]!;
    c.reconnectNow();
    const fresh = FakeSocket.all[1]!;
    fresh.open();
    old.receive("ATC: stale");
    expect(frames).toEqual([]);
  });

  it("stop() stops everything", () => {
    const { c } = make();
    c.start();
    c.stop();
    vi.advanceTimersByTime(60000);
    expect(FakeSocket.all).toHaveLength(1);
  });
});

describe("resolution of the address", () => {
  const loc = (hostname: string, search = "", protocol = "http:") => ({ hostname, search, protocol });
  const none = { host: "", port: "" };
  it("by default: the PC that serves the app, port 41716", () => {
    expect(resolveBatcUrl(none, null, loc("192.168.1.20"))).toBe("ws://192.168.1.20:41716");
  });
  it("PC configuration (BatcRemote.exe settings)", () => {
    expect(resolveBatcUrl(none, { batcHost: "", batcPort: 41800 }, loc("192.168.1.20"))).toBe("ws://192.168.1.20:41800");
    expect(resolveBatcUrl(none, { batcHost: "192.168.1.30", batcPort: 41716 }, loc("192.168.1.20"))).toBe("ws://192.168.1.30:41716");
  });
  it("the phone's preference takes priority over the PC, field by field", () => {
    const pc = { batcHost: "192.168.1.30", batcPort: 41800 };
    expect(resolveBatcUrl({ host: "10.0.0.5", port: "" }, pc, loc("192.168.1.20"))).toBe("ws://10.0.0.5:41800");
    expect(resolveBatcUrl({ host: "", port: "5000" }, pc, loc("192.168.1.20"))).toBe("ws://192.168.1.30:5000");
    expect(resolveBatcUrl({ host: "10.0.0.5", port: "5000" }, pc, loc("192.168.1.20"))).toBe("ws://10.0.0.5:5000");
  });
  it("old format ip:port in the IP field still accepted", () => {
    expect(resolveBatcUrl({ host: "10.0.0.5:5001", port: "" }, null, loc("x"))).toBe("ws://10.0.0.5:5001");
  });
  it("?host= in the address takes priority over everything", () => {
    expect(resolveBatcUrl({ host: "10.0.0.5", port: "1" }, null, loc("192.168.1.20", "?host=10.0.0.9:5000"))).toBe("ws://10.0.0.9:5000");
  });
  it("local file with no host → null", () => {
    expect(resolveBatcUrl(none, null, loc("", "", "file:"))).toBeNull();
  });
  it("Android app: never localhost, the address comes from the settings", () => {
    const app = loc("", "", "app:");
    expect(resolveBatcUrl(none, null, app)).toBeNull();                                   // first launch → asks for the IP
    expect(resolveBatcUrl({ host: "192.168.1.20", port: "" }, null, app)).toBe("ws://192.168.1.20:41716");
    expect(resolveBatcUrl({ host: "192.168.1.20", port: "5000" }, null, app)).toBe("ws://192.168.1.20:5000");
  });
  it("invalid port ignored, IPv6, normalisation", () => {
    expect(resolveBatcUrl({ host: "", port: "99999" }, null, loc("pc"))).toBe("ws://pc:41716");
    expect(resolveBatcUrl({ host: "fe80::1", port: "" }, null, loc("pc"))).toBe("ws://[fe80::1]:41716");
    expect(toWsUrl("ws://pc.local/")).toBe("ws://pc.local:41716");
    expect(toWsUrl("http://192.168.0.2:41716")).toBe("ws://192.168.0.2:41716");
  });
  it("validation of the entries", () => {
    expect(isValidHostInput("192.168.1.20")).toBe(true);
    expect(isValidHostInput("")).toBe(true);
    expect(isValidHostInput("pc name")).toBe(false);
    expect(parsePort("41716")).toBe(41716);
    expect(parsePort("0")).toBeNull();
    expect(parsePort("abc")).toBeNull();
  });
});
