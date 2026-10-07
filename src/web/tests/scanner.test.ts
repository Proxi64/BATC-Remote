import { describe, expect, it } from "vitest";
import { parseScanned, targetFromScan } from "../src/core/scanner";

const json = (body: unknown, ok = true) =>
  (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;
const failing = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;

describe("QR code of BatcRemote.exe", () => {
  it("reads the page address shown by the PC", () => {
    expect(parseScanned("http://192.168.1.20:8741/")).toEqual({ pcHost: "192.168.1.20", pcPort: 8741, direct: false });
    expect(parseScanned("  http://pc-sim.local:8742 ")).toEqual({ pcHost: "pc-sim.local", pcPort: 8742, direct: false });
  });
  it("a bare ip[:port] is BeyondATC itself", () => {
    expect(parseScanned("192.168.1.20")).toEqual({ pcHost: "192.168.1.20", pcPort: null, direct: true });
    expect(parseScanned("192.168.1.20:5000")).toEqual({ pcHost: "192.168.1.20", pcPort: 5000, direct: true });
  });
  it("rejects anything else", () => {
    expect(parseScanned("WIFI:S:home;T:WPA;P:secret;;")).toBeNull();
    expect(parseScanned("hello world")).toBeNull();
    expect(parseScanned("")).toBeNull();
  });
});

describe("BeyondATC address after a scan", () => {
  const pc = { pcHost: "192.168.1.20", pcPort: 8741, direct: false };
  it("BeyondATC on the PC itself (default PC settings)", async () => {
    expect(await targetFromScan(pc, json({ batcHost: "", batcPort: 41716 }))).toEqual({ host: "192.168.1.20", port: "", fromPc: true });
  });
  it("address and port chosen in the PC settings", async () => {
    expect(await targetFromScan(pc, json({ batcHost: "192.168.1.30", batcPort: 41800 }))).toEqual({ host: "192.168.1.30", port: "41800", fromPc: true });
  });
  it("loopback on the PC means the PC seen from the phone", async () => {
    expect(await targetFromScan(pc, json({ batcHost: "127.0.0.1", batcPort: 41716 }))).toEqual({ host: "192.168.1.20", port: "", fromPc: true });
  });
  it("PC settings unreadable → PC address, default port", async () => {
    expect(await targetFromScan(pc, failing)).toEqual({ host: "192.168.1.20", port: "", fromPc: false });
    expect(await targetFromScan(pc, json({}, false))).toEqual({ host: "192.168.1.20", port: "", fromPc: false });
  });
  it("direct BeyondATC address: nothing to ask", async () => {
    expect(await targetFromScan({ pcHost: "10.0.0.5", pcPort: 5000, direct: true }, failing)).toEqual({ host: "10.0.0.5", port: "5000", fromPc: false });
  });
  it("asks the right URL", async () => {
    let asked = "";
    const spy = (async (u: string) => { asked = u; return { ok: true, json: async () => ({}) }; }) as unknown as typeof fetch;
    await targetFromScan(pc, spy);
    expect(asked).toBe("http://192.168.1.20:8741/api/config");
  });
});
