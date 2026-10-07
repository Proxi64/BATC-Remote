import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { prefs, updatePrefs } from "../core/prefs";
import type { LogEntry } from "../core/store";
import { dict } from "../i18n";
import { useCtl } from "./ctx";
import { IconArrowDown } from "./icons";

const TRAFFIC = new Set(["atcTraffic", "traffic"]);
const CPDLC = new Set(["cpdlcAtc", "cpdlcPilot"]);

function fmtTime(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function LogPanel() {
  const s = useCtl().store;
  const t = dict.value;
  const p = prefs.value;
  const entries = s.log.value.filter(e =>
    (p.showTraffic || !TRAFFIC.has(e.source)) && (p.showCpdlc || !CPDLC.has(e.source)));

  const listRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(true);   // following the bottom of the log
  const [unseen, setUnseen] = useState(0);
  const lastId = useRef(0);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setStuck(atBottom);
    if (atBottom) setUnseen(0);
  };

  useLayoutEffect(() => {
    const el = listRef.current;
    const newest = entries.length ? entries[entries.length - 1]!.id : 0;
    const added = newest !== lastId.current;
    lastId.current = newest;
    if (!el || !added) return;
    if (stuck) el.scrollTop = el.scrollHeight;
    else setUnseen(n => n + 1);
  }, [entries.length && entries[entries.length - 1]!.id]);

  useEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; }, []);

  const toBottom = () => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setUnseen(0);
  };

  return (
    <div class="panel log-panel">
      <div class="filters">
        <FilterChip label={t.showTraffic} on={p.showTraffic} onToggle={() => updatePrefs({ showTraffic: !p.showTraffic })} />
        <FilterChip label={t.showCpdlc} on={p.showCpdlc} onToggle={() => updatePrefs({ showCpdlc: !p.showCpdlc })} />
      </div>
      <div class="log-list" ref={listRef} onScroll={onScroll}>
        {entries.length === 0 ? <p class="empty">{t.logEmpty}</p> : entries.map(e => <Bubble key={e.id} e={e} />)}
      </div>
      {!stuck && unseen > 0 && (
        <button class="new-msgs" onClick={toBottom}><IconArrowDown size={16} /> {t.newMessages} ({unseen})</button>
      )}
    </div>
  );
}

function Bubble({ e }: { e: LogEntry }) {
  const t = dict.value;
  const mine = e.source === "player" || e.source === "cpdlcPilot";
  const cls = [
    "bubble",
    mine ? "is-mine" : "is-theirs",
    TRAFFIC.has(e.source) ? "is-traffic" : "",
    CPDLC.has(e.source) ? "is-cpdlc" : ""
  ].join(" ");
  return (
    <div class={cls}>
      <div class="bubble-meta">
        <span>{t.sources[e.source] ?? e.source}</span>
        <time>{fmtTime(e.at)}</time>
      </div>
      <div class="bubble-text">{e.text}</div>
    </div>
  );
}

function FilterChip({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <button class={`filter ${on ? "is-on" : ""}`} aria-pressed={on} onClick={onToggle}>
      {label}
    </button>
  );
}
