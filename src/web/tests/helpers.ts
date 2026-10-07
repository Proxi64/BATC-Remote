import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface CaptureEvent { t: string; conn: string; dir: "in" | "out" | "sys"; prefix?: string; text: string }

/** Real capture of 23/09/2026 (LFBZ → LFBO flight, 940 events). */
export function loadCapture(): CaptureEvent[] {
  const path = fileURLToPath(new URL("./fixtures/capture-2026-09-23.jsonl", import.meta.url));
  return readFileSync(path, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l));
}
