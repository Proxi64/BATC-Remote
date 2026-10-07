/**
 * Commands sent to BeyondATC. Format "command: argument" (colon + space),
 * EXCEPT prompt_reply, which has no space. See Documentation/TECHNICAL.md §5.2.
 */
export type StartFlightMode = "IFR" | "VFR_SIMBRIEF" | "VFR_MSFS";
export type VoiceSample = "autoRespond" | "controller" | "traffic";

export const Commands = {
  atcLog: () => "atc_log",
  frequencies: () => "frequencies",
  datis: () => "datis",
  settings: () => "settings",
  ping: () => "ping",
  setAction: (label: string) => `set_action: ${label}`,
  setFrequencyCom1: (freq: string) => `set_frequency: ${freq}`,
  setFrequencyCom2: (freq: string) => `set_frequency_com2: ${freq}`,
  setAutoTune: (on: boolean) => `set_autotune: ${on}`,
  setAutoRespond: (on: boolean) => `set_autorespond: ${on}`,
  setSetting: (key: string, value: unknown) => `set_setting: ${JSON.stringify({ key, value })}`,
  playSample: (which: VoiceSample) => `play_sample: ${which}`,
  startFlight: (mode: StartFlightMode) => `start_flight: ${mode}`,
  promptReply: (id: string, yes: boolean) => `prompt_reply:${id}:${yes ? "yes" : "no"}`,
  ackError: () => "ack_error",
  quitToMenu: () => "quit_to_menu",
  turnaround: () => "turnaround"
} as const;
