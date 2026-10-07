import { describe, expect, it } from "vitest";
import { loadCapture } from "./helpers";
import { parseActions, parseMessage } from "../src/protocol/parser";
import { Commands } from "../src/protocol/commands";

describe("parser — real capture of 23/09/2026 (LFBZ → LFBO)", () => {
  const incoming = loadCapture().filter(e => e.dir === "in");

  it("contains a significant amount of data", () => {
    expect(incoming.length).toBeGreaterThan(700);
  });

  it("recognises every received message (no unknown, no invalid)", () => {
    const bad = incoming.map(e => parseMessage(e.text)).filter(m => m.kind === "unknown" || m.kind === "invalid");
    expect(bad).toEqual([]);
  });

  it("parses the 15 frequencies, all with a name", () => {
    const f = incoming.map(e => parseMessage(e.text)).find(m => m.kind === "frequencies");
    expect(f?.kind).toBe("frequencies");
    if (f?.kind !== "frequencies") return;
    expect(f.items).toHaveLength(15);
    expect(f.items.every(i => i.name !== "")).toBe(true);
    const center = f.items.find(i => i.type === "Center");
    expect(center).toMatchObject({ name: "Bordeaux Control", frequency: "125.105", cpdlcLogonCode: "LFBB", airport: "" });
    const tower = f.items.find(i => i.airport === "LFBO" && i.type === "Tower");
    expect(tower?.runways).toEqual(["32L", "32R"]);
  });

  it("parses Settings with the real options", () => {
    const s = incoming.map(e => parseMessage(e.text)).find(m => m.kind === "settings");
    if (s?.kind !== "settings") throw new Error("settings missing");
    expect(s.value.voiceVolume).toBe(70);
    expect(s.value.voiceQualityOptions?.map(o => o.value)).toEqual(["Off", "Local", "Premium"]);
    expect(s.value.autoRespondVoiceOptions?.length).toBe(15);
  });

  it("sees the 'request' mode in CommsState", () => {
    const modes = new Set(incoming.map(e => parseMessage(e.text)).flatMap(m => m.kind === "commsState" ? [m.mode] : []));
    expect([...modes].sort()).toEqual(["awaiting", "queued", "ready", "request", "speaking", "traffic"]);
  });
});

describe("parser — individual cases", () => {
  it("Facility with and without frequency", () => {
    expect(parseMessage("Facility: Biarritz Ground|121.955")).toEqual({ kind: "facility", name: "Biarritz Ground", frequency: "121.955" });
    expect(parseMessage("Facility: Nothing Tuned")).toEqual({ kind: "facility", name: "Nothing Tuned", frequency: null });
  });

  it("Actions: ¬ separator, trailing separator, empty list, comma fallback", () => {
    expect(parseActions("[Wind Check¬Radio Check¬]")).toEqual(["Wind Check", "Radio Check"]);
    expect(parseActions("[]")).toEqual([]);
    expect(parseActions("")).toEqual([]);
    expect(parseActions("[A, B]")).toEqual(["A", "B"]);
    expect(parseActions("[Say Callsign/Altitude¬Say Again¬]")).toEqual(["Say Callsign/Altitude", "Say Again"]);
  });

  it("log messages keep the text intact (colons included)", () => {
    expect(parseMessage("ATC: Airbus, QNH 1022: expect ILS")).toEqual({ kind: "log", source: "atc", text: "Airbus, QNH 1022: expect ILS" });
    expect(parseMessage("CPDLC_Pilot: WILCO")).toEqual({ kind: "log", source: "cpdlcPilot", text: "WILCO" });
  });

  it("empty payloads = clear", () => {
    expect(parseMessage("Com2: ")).toEqual({ kind: "com2", value: null });
    expect(parseMessage("Callsign:")).toEqual({ kind: "callsign", value: null });
    expect(parseMessage("Prompt: ")).toEqual({ kind: "prompt", value: null });
    expect(parseMessage("AppError:")).toEqual({ kind: "appError", value: null });
    expect(parseMessage("InfoBoxes: []")).toEqual({ kind: "infoBoxes", items: [] });
  });

  it("InfoBoxes splits <br>", () => {
    const m = parseMessage('InfoBoxes: [{"title":"ATIS","info":"V<br>Q1023<br/>RWY 27"}]');
    expect(m).toEqual({ kind: "infoBoxes", items: [{ title: "ATIS", lines: ["V", "Q1023", "RWY 27"] }] });
  });

  it("DATIS keeps the | characters of the text", () => {
    expect(parseMessage("DATIS: LFBZ|V|ATIS V|RWY 27")).toEqual({ kind: "datis", icao: "LFBZ", letter: "V", text: "ATIS V|RWY 27" });
    expect(parseMessage("DATIS_END:")).toEqual({ kind: "datisEnd" });
  });

  it("Frequencies with trailing comma", () => {
    const m = parseMessage('Frequencies: [{"type":"VFR","name":"FIS","frequency":"124.450"},]');
    expect(m.kind).toBe("frequencies");
  });

  it("Prompt, AppError, LoadState", () => {
    expect(parseMessage('Prompt: {"id":"p1","text":"Continue?"}')).toEqual({
      kind: "prompt", value: { id: "p1", title: "BeyondATC", text: "Continue?", yesLabel: "Yes", noLabel: "No" }
    });
    expect(parseMessage('AppError: {"fatal":true,"text":"Boom"}')).toEqual({ kind: "appError", value: { fatal: true, text: "Boom" } });
    expect(parseMessage('LoadState: {"stage":"menu","loggedIn":false}')).toEqual({
      kind: "loadState", value: { stage: "menu", text: "", pct: -1, vfr: false, loggedIn: false }
    });
  });

  it("invalid JSON → invalid, without throwing", () => {
    expect(parseMessage("Settings: {oops").kind).toBe("invalid");
    expect(parseMessage("AutoTune: maybe").kind).toBe("invalid");
  });

  it("unknown prefix → unknown", () => {
    expect(parseMessage("Mystery: 42")).toEqual({ kind: "unknown", prefix: "Mystery", raw: "Mystery: 42" });
  });
});

describe("commands", () => {
  it("exact format of the commands", () => {
    expect(Commands.setAction("Request Taxi to Runway")).toBe("set_action: Request Taxi to Runway");
    expect(Commands.promptReply("abc", true)).toBe("prompt_reply:abc:yes");
    expect(Commands.setSetting("voiceVolume", 80)).toBe('set_setting: {"key":"voiceVolume","value":80}');
    expect(Commands.setAutoTune(false)).toBe("set_autotune: false");
    expect(Commands.startFlight("VFR_MSFS")).toBe("start_flight: VFR_MSFS");
  });
});
