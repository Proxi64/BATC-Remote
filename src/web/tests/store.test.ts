import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BatcStore } from "../src/core/store";
import { groupFrequencies } from "../src/core/frequencies";
import { parseMessage } from "../src/protocol/parser";
import { loadCapture } from "./helpers";

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

/** Replays the capture while respecting the real timings between messages. */
function replay(store: BatcStore, until?: string) {
  const events = loadCapture().filter(e => e.dir === "in" && e.conn === "A");
  let prev = Date.parse(events[0]!.t);
  for (const e of events) {
    if (until && e.t > until) break;
    const t = Date.parse(e.t);
    vi.advanceTimersByTime(Math.max(0, t - prev));
    prev = t;
    store.apply(parseMessage(e.text));
  }
  vi.advanceTimersByTime(1000);
}

describe("store — replay of the real flight", () => {
  it("final state consistent with the end of the capture", () => {
    const s = new BatcStore();
    replay(s);
    expect(s.facility.value).toEqual({ name: "Bordeaux Control", frequency: "125.105" });
    expect(s.callsign.value).toEqual({ full: "Airbus", shortForm: "A-us" });
    expect(s.com2.value?.frequency).toBe("124.850");
    expect(s.cpdlcCode.value).toBe("LFBB");
    expect(s.autoRespond.value).toBe(true);
    expect(s.infoBoxes.value).toEqual([{ title: "Climb", lines: ["FL120"] }]);
    expect(s.progress.value?.from).toBe("LFBZ");
    expect(s.actions.value).toContain("Call Ready for Descent");
    expect(s.datis.value.get("LFBO")?.letter).toBe("W");
    expect(s.toolbarVersion.value).toBe("3.1");
    expect(s.unknownPrefixes.value).toEqual([]);
    expect(s.log.value.filter(l => l.source === "atc").length).toBe(12);
  });

  it("the Actions bursts (old → [] → new) produce only one change", () => {
    const s = new BatcStore();
    const seen: string[][] = [];
    // right before the burst at 11:49:39
    replay(s, "2026-09-23T11:49:39.000Z");
    const unsub = s.actions.subscribe(v => seen.push(v));
    s.apply(parseMessage("Actions: [Request IFR Clearance¬Request Push and Start¬]"));
    s.apply(parseMessage("Actions: []"));
    s.apply(parseMessage("Actions: [Request Push and Start¬Wind Check¬]"));
    vi.advanceTimersByTime(250);
    unsub();
    // 1st value = current value at subscribe time, then a single update
    expect(seen.slice(1)).toEqual([["Request Push and Start", "Wind Check"]]);
  });

  it("the short 'ready' blips during an exchange do not show the actions again", () => {
    const s = new BatcStore();
    s.apply(parseMessage('CommsState: {"mode":"speaking","text":"Speaking"}'));
    expect(s.actionsVisible.value).toBe(false);
    s.apply(parseMessage('CommsState: {"mode":"ready","text":""}'));
    vi.advanceTimersByTime(25);
    s.apply(parseMessage('CommsState: {"mode":"awaiting","text":"Awaiting Response"}'));
    vi.advanceTimersByTime(500);
    expect(s.actionsVisible.value).toBe(false);
    s.apply(parseMessage('CommsState: {"mode":"ready","text":""}'));
    vi.advanceTimersByTime(300);
    expect(s.actionsVisible.value).toBe(true);
  });

  it("traffic does not block the pilot's actions", () => {
    const s = new BatcStore();
    s.apply(parseMessage('CommsState: {"mode":"traffic","text":"ATC Transmitting"}'));
    vi.advanceTimersByTime(300);
    expect(s.actionsVisible.value).toBe(true);
    expect(s.busy.value).toBe(false);
  });

  it("an action sent is released when BeyondATC reacts", () => {
    const s = new BatcStore();
    s.markActionSent("Radio Check");
    expect(s.pendingAction.value).toBe("Radio Check");
    s.apply(parseMessage('CommsState: {"mode":"queued","text":"Request Queued"}'));
    expect(s.pendingAction.value).toBeNull();
  });

  it("an ignored action is released after 6 s", () => {
    const s = new BatcStore();
    s.markActionSent("Radio Check");
    vi.advanceTimersByTime(6100);
    expect(s.pendingAction.value).toBeNull();
  });

  it("Wipe clears the flight", () => {
    const s = new BatcStore();
    replay(s);
    s.apply(parseMessage("Wipe:"));
    vi.advanceTimersByTime(300);
    expect(s.facility.value).toBeNull();
    expect(s.log.value).toEqual([]);
    expect(s.actions.value).toEqual([]);
    expect(s.loadState.value.stage).toBe("loading");
  });

  it("the D-ATIS is replaced as a whole on each DATIS_END", () => {
    const s = new BatcStore();
    s.apply(parseMessage("DATIS: LFPG|A|old"));
    s.apply(parseMessage("DATIS_END:"));
    s.apply(parseMessage("DATIS: LFBO|B|new"));
    s.apply(parseMessage("DATIS_END:"));
    expect([...s.datis.value.keys()]).toEqual(["LFBO"]);
  });
});

describe("grouping of the frequencies", () => {
  it("groups by airport and by type in the toolbar's order", () => {
    const f = loadCapture().map(e => parseMessage(e.text)).find(m => m.kind === "frequencies");
    if (f?.kind !== "frequencies") throw new Error();
    const g = groupFrequencies(f.items);
    expect(g.airports.map(a => a.icao)).toEqual(["LFBZ", "LFBO"]);
    expect(g.airports[0]!.groups.map(x => x.title)).toEqual(["ATIS", "UNICOM", "Ground", "Tower", "TRACON"]);
    expect(g.airports[1]!.groups.map(x => x.title)).toEqual(["ATIS", "UNICOM", "Clearance", "Ground", "Tower", "Approach", "Departure"]);
    expect(g.airports[1]!.groups.find(x => x.type === "UNICOM")!.entries).toHaveLength(3);
    expect(g.center.map(c => c.name)).toEqual(["Bordeaux Control"]);
  });
});
