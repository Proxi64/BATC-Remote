import { describe, expect, it } from "vitest";
import { MIN_GAP_MS, shouldNotify, type NotifyPrefs } from "../src/core/notify";
import { parseMessage } from "../src/protocol/parser";
import { loadCapture } from "./helpers";

const on: NotifyPrefs = { notifySound: true, notifyCpdlc: true, notifyVolume: 0.7 };

describe("sound notification", () => {
  it("rings only for messages addressed to the pilot", () => {
    expect(shouldNotify("atc", on, 10_000, 0, 0)).toBe(true);
    expect(shouldNotify("cpdlcAtc", on, 10_000, 0, 0)).toBe(true);
    expect(shouldNotify("atcTraffic", on, 10_000, 0, 0)).toBe(false); // ATC talking to another aircraft
    expect(shouldNotify("traffic", on, 10_000, 0, 0)).toBe(false);
    expect(shouldNotify("player", on, 10_000, 0, 0)).toBe(false);     // our own read-back
    expect(shouldNotify("cpdlcPilot", on, 10_000, 0, 0)).toBe(false);
  });

  it("respects the options", () => {
    expect(shouldNotify("atc", { ...on, notifySound: false }, 10_000, 0, 0)).toBe(false);
    expect(shouldNotify("atc", { ...on, notifyVolume: 0 }, 10_000, 0, 0)).toBe(false);
    expect(shouldNotify("cpdlcAtc", { ...on, notifyCpdlc: false }, 10_000, 0, 0)).toBe(false);
    expect(shouldNotify("atc", { ...on, notifyCpdlc: false }, 10_000, 0, 0)).toBe(true);
  });

  it("stays quiet while the history is replayed after a connection", () => {
    expect(shouldNotify("atc", on, 1_000, 1_500, 0)).toBe(false);
    expect(shouldNotify("atc", on, 1_600, 1_500, 0)).toBe(true);
  });

  it("a burst of messages rings only once", () => {
    expect(shouldNotify("atc", on, 10_000 + MIN_GAP_MS - 1, 0, 10_000)).toBe(false);
    expect(shouldNotify("atc", on, 10_000 + MIN_GAP_MS, 0, 10_000)).toBe(true);
  });

  it("real flight: one chime per ATC call to our aircraft", () => {
    const events = loadCapture().filter(e => e.dir === "in" && e.conn === "A");
    let last = 0, chimes = 0;
    for (const e of events) {
      const m = parseMessage(e.text);
      if (m.kind !== "log") continue;
      const t = Date.parse(e.t);
      if (shouldNotify(m.source, on, t, 0, last)) { chimes++; last = t; }
    }
    // The capture holds 12 ATC messages addressed to "Airbus" and 12 ATCTraffic ones (silent).
    expect(chimes).toBe(12);
  });
});
