import { useEffect, useState } from "preact/hooks";
import type { AirportFrequencies, FrequencyGroup } from "../core/frequencies";
import type { FrequencyEntry } from "../protocol/types";
import { dict } from "../i18n";
import { haptic, useCtl } from "./ctx";
import { IconRadio, IconRefresh, IconRunway } from "./icons";
import { toast } from "./toast";

export function FrequenciesPanel() {
  const ctl = useCtl();
  const s = ctl.store;
  const t = dict.value;
  const g = s.groupedFrequencies.value;
  const progress = s.progress.value;
  const datis = s.datis.value;
  const [sel, setSel] = useState<number | null>(null);

  // Refresh every time the tab is opened (like the official toolbar).
  useEffect(() => { ctl.refreshFrequencies(); }, []);

  if (!g || (g.airports.length === 0 && g.center.length === 0 && g.vfr.length === 0)) {
    return (
      <div class="panel freq-panel">
        <p class="empty">{t.freqEmpty}</p>
        <button class="btn" onClick={() => ctl.refreshFrequencies()}><IconRefresh size={18} /> {t.refresh}</button>
      </div>
    );
  }

  // Default selection: departure in the first half of the flight, arrival afterwards.
  const auto = progress && progress.pct >= 50 ? g.airports.length - 1 : 0;
  const idx = Math.min(sel ?? auto, Math.max(0, g.airports.length - 1));
  const airport = g.airports[idx];

  const roleOf = (ap: AirportFrequencies, i: number) => {
    if (progress?.from === ap.icao) return t.departure;
    if (progress?.to === ap.icao) return t.destination;
    return i === 0 ? t.departure : t.destination;
  };

  return (
    <div class="panel freq-panel">
      <div class="freq-head">
        {g.airports.length > 1 && (
          <div class="segmented" role="tablist">
            {g.airports.map((ap, i) => (
              <button key={ap.icao + i} role="tab" aria-selected={i === idx} class={i === idx ? "is-on" : ""} onClick={() => setSel(i)}>
                <span class="mono">{ap.icao || "—"}</span>
                <small>{roleOf(ap, i)}</small>
              </button>
            ))}
          </div>
        )}
        <button class="icon-btn" onClick={() => { haptic(); ctl.refreshFrequencies(); }} aria-label={t.refresh} title={t.refresh}>
          <IconRefresh />
        </button>
      </div>

      {airport && (
        <>
          <h2 class="airport-title">
            <span class="mono">{airport.icao}</span> {airport.name}
            {datis.get(airport.icao) && <span class="atis-letter" title="ATIS">{datis.get(airport.icao)!.letter}</span>}
          </h2>
          {airport.groups.map(gr => (
            <Group key={gr.type} group={gr} atis={gr.type === "ATIS" ? datis.get(airport.icao)?.text : undefined} />
          ))}
        </>
      )}

      {g.vfr.length > 0 && <Group group={{ type: "VFR", title: t.vfr, entries: g.vfr }} showNames />}
      {g.center.length > 0 && <Group group={{ type: "Center", title: t.center, entries: g.center }} showNames />}
    </div>
  );
}

function Group({ group, atis, showNames }: { group: FrequencyGroup; atis?: string; showNames?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <section class={`freq-group type-${group.type}`}>
      <h3>{group.title}</h3>
      <div class="freq-rows">
        {group.entries.map(e => <FreqRow key={e.frequency + e.name} e={e} showName={showNames || group.entries.length > 1} />)}
      </div>
      {atis && (
        // The text sits in its own block: the 2-line cut is applied to it, not to the padded button,
        // so no part of a third line can show through the padding.
        <button class={`atis-text ${open ? "is-open" : ""}`} aria-expanded={open} onClick={() => setOpen(!open)}>
          <span class="atis-body">{atis}</span>
        </button>
      )}
    </section>
  );
}

function FreqRow({ e, showName }: { e: FrequencyEntry; showName: boolean }) {
  const ctl = useCtl();
  const t = dict.value;
  const off = ctl.conn.value.status !== "open";
  const active = ctl.store.facility.value?.frequency === e.frequency;
  const com2Active = ctl.store.com2.value?.frequency === e.frequency;

  const tune = (com: 1 | 2) => {
    const ok = com === 1 ? ctl.tuneCom1(e.frequency) : ctl.tuneCom2(e.frequency);
    if (ok) { haptic(); toast(t.tuned(e.frequency, com === 1 ? t.com1 : t.com2)); }
  };

  return (
    <div class="freq-row">
      <button class={`freq-main ${active ? "is-active" : ""}`} disabled={off} onClick={() => tune(1)} aria-label={`${t.tuneCom1} ${e.frequency}`}>
        <span class="freq-value mono">{e.frequency}</span>
        {(showName || (e.name && e.name !== e.airport)) && e.name && <span class="freq-name">{e.name}</span>}
        {e.cpdlcLogonCode && <span class="tag tag-cpdlc">CPDLC {e.cpdlcLogonCode}</span>}
        {e.runways.length > 0 && (
          <span class="rwys">{e.runways.map(r => <span class="rwy" key={r}><IconRunway size={12} />{r}</span>)}</span>
        )}
      </button>
      <button class={`freq-com2 ${com2Active ? "is-active" : ""}`} disabled={off} onClick={() => tune(2)} aria-label={`COM2 ${e.frequency}`}>
        <IconRadio size={16} /><span>2</span>
      </button>
    </div>
  );
}
