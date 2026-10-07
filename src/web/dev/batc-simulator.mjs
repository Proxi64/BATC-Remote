#!/usr/bin/env node
/**
 * BeyondATC simulator for development — lets you work on BATC Remote without MSFS.
 *
 *   npm run sim                         # replays the real capture at 4x speed
 *   npm run sim -- --speed 1            # real time
 *   npm run sim -- --port 41717         # another port (if the real BeyondATC is running)
 *   npm run sim -- --menu               # starts on the "Start a flight" menu
 *
 * Behaviour copied from the real server (analysis §12):
 *  - full snapshot sent to EVERY client whenever one connects
 *  - Pong only to the client that sent "ping"
 *  - Frequencies only on request
 *
 * Commands typed in this terminal: menu | ready | loading | wipe | prompt | error | warning | turnaround | help
 */
import { WebSocketServer } from "ws";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const PORT = Number(opt("port", 41716));
const SPEED = Number(opt("speed", 4));
const MAX_GAP_MS = 6000;
const capturePath = opt("capture", fileURLToPath(new URL("../tests/fixtures/capture-2026-09-23.jsonl", import.meta.url)));

// ---------- load the capture ----------
const events = readFileSync(capturePath, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l))
  .filter(e => e.dir === "in" && e.conn === "A" && e.prefix !== "Pong");
const prefixOf = t => t.slice(0, Math.max(0, t.indexOf(":"))) || t;
const firstOf = p => events.find(e => e.prefix === p)?.text;

const FREQUENCIES = firstOf("Frequencies");
let settings = JSON.parse(firstOf("Settings").slice("Settings: ".length));

// Current state: last value per "state" prefix (what the snapshot sends).
const STATE_PREFIXES = ["Facility", "CPDLCCode", "AutoTune", "AutoRespond", "Actions", "QueuedAction", "InfoBoxes", "Com2",
  "RadioMute", "CommsState", "LoadState", "Callsign", "ToolbarVersion", "Progress"];
const state = new Map();
let datis = [];
const logHistory = [];

// ---------- server ----------
const wss = new WebSocketServer({ port: PORT, host: "0.0.0.0" });
const broadcast = msg => { for (const c of wss.clients) if (c.readyState === 1) c.send(msg); };
const emit = msg => {
  const p = prefixOf(msg);
  if (STATE_PREFIXES.includes(p)) state.set(p, msg);
  if (["ATC", "ATCTraffic", "Player", "Traffic", "CPDLC_ATC", "CPDLC_Pilot"].includes(p)) logHistory.push(msg);
  broadcast(msg);
};
const sendDatis = ws => { for (const d of datis) ws.send(d); ws.send("DATIS_END:"); };
const snapshotTo = ws => {
  for (const p of STATE_PREFIXES) if (state.has(p)) ws.send(state.get(p));
  sendDatis(ws);
  ws.send(`Settings: ${JSON.stringify(settings)}`);
};

wss.on("connection", (ws, req) => {
  log(`+ client ${req.socket.remoteAddress} (${wss.clients.size} connected)`);
  // Like BeyondATC: everyone receives the snapshot again.
  for (const c of wss.clients) if (c.readyState === 1) snapshotTo(c);
  ws.on("message", buf => handle(ws, buf.toString()));
  ws.on("close", () => log(`- client (${wss.clients.size} connected)`));
});

let busy = false;
function handle(ws, cmd) {
  if (cmd !== "ping") log(`← ${cmd}`);
  const [name, ...rest] = cmd.split(":");
  const arg = rest.join(":").replace(/^ /, "");
  switch (name) {
    case "ping": return ws.send("Pong:");
    case "atc_log": return logHistory.forEach(m => ws.send(m));
    case "frequencies": return ws.send(FREQUENCIES);
    case "datis": return sendDatis(ws);
    case "settings": return ws.send(`Settings: ${JSON.stringify(settings)}`);
    case "set_autotune": return emit(`AutoTune: ${arg === "true"}`);
    case "set_autorespond": return emit(`AutoRespond: ${arg === "true"}`);
    case "set_setting": {
      try { const { key, value } = JSON.parse(arg); settings = { ...settings, [key]: value }; } catch { return; }
      return broadcast(`Settings: ${JSON.stringify(settings)}`);
    }
    case "set_frequency": return tune(arg);
    case "set_frequency_com2": return emit(`Com2: ${JSON.stringify({ label: arg, frequency: arg, monitor: false })}`);
    case "set_action": return simulateExchange(arg);
    case "play_sample": return;
    case "start_flight": return startFlight(arg);
    case "quit_to_menu": return setStage("menu");
    case "turnaround": return startFlight("TURNAROUND");
    case "prompt_reply": log(`   prompt reply: ${rest.join(":")}`); return emit("Prompt: ");
    case "ack_error": return emit("AppError: ");
    default: log(`   (command not simulated)`);
  }
}

function tune(freq) {
  const f = JSON.parse(FREQUENCIES.slice("Frequencies: ".length).replace(/,\s*]$/, "]")).find(x => x.frequency === freq);
  emit(`Facility: ${f ? f.name : "Unicom"}|${freq}`);
}

const wait = ms => new Promise(r => setTimeout(r, ms / Math.max(1, SPEED / 2)));
async function simulateExchange(action) {
  if (busy) return;
  busy = true;
  const comms = (mode, text = "") => emit(`CommsState: ${JSON.stringify({ mode, text })}`);
  const actions = state.get("Actions");
  comms("queued", "Request Queued"); await wait(20);
  comms("ready"); comms("awaiting", "Awaiting Response"); await wait(400);
  emit(`Player: Airbus, ${action.toLowerCase()}.`); comms("speaking", "Speaking"); await wait(3000);
  comms("request", action); emit(actions); await wait(1500);
  comms("ready"); await wait(25); comms("awaiting", "Awaiting Response"); await wait(600);
  emit(`ATC: Airbus, roger, ${action.toLowerCase()} approved.`); comms("speaking", "Speaking"); await wait(4000);
  comms("ready"); await wait(25); comms("awaiting", "Awaiting Response"); await wait(400);
  emit("Player: Wilco, Airbus."); comms("speaking", "Speaking"); await wait(2500);
  comms("ready");
  emit(actions); emit("Actions: []"); emit(actions);
  busy = false;
}

function setStage(stage, text = "", pct = -1) {
  emit(`LoadState: ${JSON.stringify({ stage, text, pct, vfr: true, loggedIn: true })}`);
}
async function startFlight(mode) {
  emit("Wipe:");
  for (let pct = 0; pct <= 100; pct += 20) { setStage("download", `Downloading flight plan (${mode})…`, pct); await wait(600); }
  setStage("loading", "Generating ATC…"); await wait(1500);
  setStage("ready");
  replayIndex = 0; // the flight restarts
  paused = false;
}

// ---------- replay of the capture ----------
let replayIndex = 0;
let paused = false;
async function replayLoop() {
  for (;;) {
    if (replayIndex >= events.length) { log("— end of capture, looping —"); replayIndex = 0; logHistory.length = 0; }
    const e = events[replayIndex];
    const next = events[replayIndex + 1];
    if (!paused && !busy) {
      const prev = events[replayIndex - 1];
      if (e.prefix === "DATIS") { if (prev?.prefix !== "DATIS") datis = []; datis.push(e.text); }
      else if (e.prefix === "DATIS_END" || e.prefix === "Frequencies" || e.prefix === "Settings") { /* sent on request / in the snapshot */ }
      else emit(e.text);
      replayIndex++;
    }
    const gap = next ? Math.min(MAX_GAP_MS, Date.parse(next.t) - Date.parse(e.t)) : 1000;
    await new Promise(r => setTimeout(r, Math.max(5, gap / SPEED)));
  }
}

// ---------- console ----------
function log(s) { console.log(`[${new Date().toLocaleTimeString()}] ${s}`); }
const rl = createInterface({ input: process.stdin });
rl.on("line", line => {
  const c = line.trim();
  const help = "commands: menu | ready | loading | wipe | prompt | error | warning | turnaround | pause | resume";
  switch (c) {
    case "menu": paused = true; return setStage("menu");
    case "ready": paused = false; return setStage("ready");
    case "loading": return setStage("loading", "Loading flight…", 42);
    case "wipe": return emit("Wipe:");
    case "turnaround": return setStage("turnaround");
    case "prompt": return emit(`Prompt: ${JSON.stringify({ id: "demo1", title: "BeyondATC", text: "Do you want to resume the previous flight?", yesLabel: "Resume", noLabel: "New flight" })}`);
    case "error": return emit(`AppError: ${JSON.stringify({ fatal: true, text: "SimConnect connection lost." })}`);
    case "warning": return emit(`AppError: ${JSON.stringify({ fatal: false, text: "SimBrief plan is older than 24 h." })}`);
    case "pause": paused = true; return log("replay paused");
    case "resume": paused = false; return log("replay resumed");
    default: return log(help);
  }
});

log(`BeyondATC simulator on ws://0.0.0.0:${PORT} — capture: ${events.length} messages, speed x${SPEED}`);
log("type 'help' for the commands");
if (args.includes("--menu")) { paused = true; setStage("menu"); }
replayLoop();
