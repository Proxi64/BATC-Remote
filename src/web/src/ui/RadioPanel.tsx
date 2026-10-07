import { dict } from "../i18n";
import { useCtl } from "./ctx";
import { IconEar, IconRadio } from "./icons";

const NO_STATION = new Set(["Radio Off", "Nothing Tuned", "No Station Tuned", ""]);

/** COM1 (active station), COM2, flight progress, info chips. */
export function RadioPanel() {
  const ctl = useCtl();
  const s = ctl.store;
  const t = dict.value;
  const fac = s.facility.value;
  const com2 = s.com2.value;
  const mute = s.radioMute.value;
  const com1Idle = !fac || NO_STATION.has(fac.name) || !fac.frequency;

  return (
    <section class="radio">
      <div class={`com1 ${mute.com1 ? "is-muted" : ""}`}>
        <span class="com-label"><IconRadio size={16} /> {t.com1}</span>
        {com1Idle ? (
          <span class="com1-idle">{!fac || fac.name === "Nothing Tuned" || fac.name === "No Station Tuned" || !fac.name ? t.noStation : fac.name}</span>
        ) : (
          <div class="com1-main">
            <span class="com1-name" key={fac!.name}>{mute.com1 ? t.muted : fac!.name}</span>
            <span class="com1-freq mono" key={fac!.frequency}>{fac!.frequency}</span>
          </div>
        )}
      </div>

      {com2 && (
        <div class={`com2 ${mute.com2 ? "is-muted" : ""}`}>
          <span class="com-label">{t.com2}</span>
          <span class="com2-text">
            {mute.com2 ? t.muted : (com2.label !== com2.frequency ? com2.label : "")}
          </span>
          {com2.frequency && !mute.com2 && <span class="mono com2-freq">{com2.frequency}</span>}
          {com2.monitor && !mute.com2 && <span class="tag" title={t.monitor}><IconEar size={14} /> {t.monitor}</span>}
        </div>
      )}

      <FlightProgress />
      <InfoChips />
    </section>
  );
}

function FlightProgress() {
  const p = useCtl().store.progress.value;
  if (!p) return null;
  return (
    <div class="progress" aria-label={`${p.from} → ${p.to} ${Math.round(p.pct)}%`}>
      <span class="mono">{p.from}</span>
      <div class="progress-track">
        <div class="progress-fill" style={{ width: `${p.pct}%` }} />
        <div class="progress-dot" style={{ left: `${p.pct}%` }} />
      </div>
      <span class="mono">{p.to}</span>
    </div>
  );
}

function InfoChips() {
  const items = useCtl().store.infoBoxes.value;
  if (items.length === 0) return null;
  return (
    <div class="chips" role="list">
      {items.map((b, i) => (
        <div class="chip" role="listitem" key={`${b.title}-${i}`}>
          <span class="chip-title">{b.title}</span>
          <span class="chip-value">{b.lines.join(" · ")}</span>
        </div>
      ))}
    </div>
  );
}
