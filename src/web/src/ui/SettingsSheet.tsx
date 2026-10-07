import { useEffect, useState } from "preact/hooks";
import { displayHost, isValidHostInput, parsePort } from "../core/host";
import { isNativeApp, pageLocation } from "../core/platform";
import { prefs, updatePrefs } from "../core/prefs";
import { PROTOCOL_VERSION, type Option } from "../protocol/types";
import { dict } from "../i18n";
import { Switch } from "./ActionsPanel";
import { haptic, useCtl } from "./ctx";
import { ConfirmDialog } from "./Dialogs";
import { IconClose, IconHome, IconPlay, IconQr } from "./icons";
import { scanAndReport } from "./scan";
import { MOTION_SENSITIVITY_MAX, MOTION_SENSITIVITY_MIN } from "../core/screen";

declare const __APP_VERSION__: string;

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const ctl = useCtl();
  const t = dict.value;
  const p = prefs.value;
  const [hostDraft, setHostDraft] = useState(p.host);
  const [portDraft, setPortDraft] = useState(p.port);
  const pc = ctl.pcConfig.value;
  const [confirmQuit, setConfirmQuit] = useState(false);
  const native = isNativeApp();
  const autoHost = pageLocation().hostname;
  const url = ctl.conn.value.url;
  const status = ctl.conn.value.status;
  const open = status === "open";
  const manual = !!(p.host || p.port);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const hostOk = isValidHostInput(hostDraft);
  const portOk = portDraft.trim() === "" || parsePort(portDraft) !== null;
  const dirty = hostDraft.trim() !== p.host || portDraft.trim() !== p.port;

  const applyHost = () => {
    if (!hostOk || !portOk) return;
    updatePrefs({ host: hostDraft.trim(), port: portDraft.trim() });
    ctl.reconnect();
    haptic();
  };
  const resetHost = () => {
    setHostDraft(""); setPortDraft("");
    updatePrefs({ host: "", port: "" });
    ctl.reconnect();
    haptic();
  };
  const autoHostLabel = pc?.batcHost || autoHost;
  const autoPortLabel = String(pc?.batcPort || 41716);

  return (
    <div class="sheet" role="dialog" aria-modal="true" aria-label={t.settings}>
      <header class="sheet-head">
        <h1>{t.settings}</h1>
        <button class="icon-btn" onClick={onClose} aria-label={t.close}><IconClose /></button>
      </header>

      <div class="sheet-body">
        <Section title={t.secConnection}>
          <div class="conn-card">
            <div class="conn-status">
              <span class={`dot dot-${status}`} />
              <span class="conn-state">{t.status[status] ?? status}</span>
              <span class="conn-target mono">{url ? displayHost(url) : "—"}</span>
              {!native && <span class={`badge ${manual ? "badge-manual" : ""}`}>{manual ? t.modeManual : t.modeAuto}</span>}
            </div>
            <form class="conn-form" onSubmit={e => { e.preventDefault(); applyHost(); }}>
              <div class={`addr-group ${hostOk && portOk ? "" : "is-invalid"}`}>
                <input class="addr-host mono" inputMode="decimal" autoComplete="off" spellcheck={false}
                  aria-label={t.hostLabel} aria-invalid={!hostOk}
                  placeholder={autoHostLabel || t.hostPlaceholder}
                  value={hostDraft} onInput={e => setHostDraft((e.target as HTMLInputElement).value)} />
                <span class="addr-sep" aria-hidden="true">:</span>
                <input class="addr-port mono" inputMode="numeric" autoComplete="off" maxLength={5}
                  aria-label={t.portLabel} aria-invalid={!portOk}
                  placeholder={autoPortLabel}
                  value={portDraft} onInput={e => setPortDraft((e.target as HTMLInputElement).value.replace(/[^0-9]/g, ""))} />
              </div>
              {dirty
                ? <button type="submit" class="btn btn-primary btn-sm" disabled={!hostOk || !portOk}>{t.apply}</button>
                : native
                  ? <button type="button" class="btn btn-sm" onClick={() => { void scanAndReport(ctl).then(ok => { if (ok) { setHostDraft(prefs.value.host); setPortDraft(prefs.value.port); } }); }}>
                      <IconQr size={18} /> {t.scanShort}
                    </button>
                  : manual && <button type="button" class="btn btn-sm" onClick={resetHost}>{t.resetAuto}</button>}
            </form>
            <small class={hostOk && portOk ? "muted" : "text-danger"}>
              {!hostOk ? t.invalidHost : !portOk ? t.invalidPort : native ? t.hostHintApp : t.hostHint}
            </small>
          </div>
        </Section>

        <Section title={t.secDisplay}>
          <div class="row-between">
            <span>{t.textSize}</span>
            <div class="segmented small">
              {[0.9, 1, 1.15, 1.3].map(v => (
                <button key={v} class={p.textScale === v ? "is-on" : ""} onClick={() => updatePrefs({ textScale: v })}
                  style={{ fontSize: `${v}em` }}>A</button>
              ))}
            </div>
          </div>
          <Switch label={t.haptics} value={p.haptics} onChange={v => updatePrefs({ haptics: v })} />
          {native && (
            <>
              <Switch label={t.keepScreenOn} value={p.keepScreenOn} onChange={v => updatePrefs({ keepScreenOn: v })} />
              <Switch label={t.dimWhenIdle} hint={t.dimWhenIdleHint} value={p.dimWhenIdle} disabled={!p.keepScreenOn}
                onChange={v => updatePrefs({ dimWhenIdle: v })} />
              <Switch label={t.wakeOnMotion} hint={t.wakeOnMotionHint} value={p.wakeOnMotion}
                disabled={!p.keepScreenOn || !p.dimWhenIdle} onChange={v => updatePrefs({ wakeOnMotion: v })} />
              <Slider label={t.motionSensitivity} min={MOTION_SENSITIVITY_MIN} max={MOTION_SENSITIVITY_MAX}
                value={p.motionSensitivity} disabled={!p.keepScreenOn || !p.dimWhenIdle || !p.wakeOnMotion}
                ends={[t.sensitivityLow, t.sensitivityHigh]}
                onCommit={v => updatePrefs({ motionSensitivity: v })} />
            </>
          )}
        </Section>

        <Section title={t.secNotifications}>
          <Switch label={t.notifySound} hint={t.notifySoundHint} value={p.notifySound}
            onChange={v => { updatePrefs({ notifySound: v }); if (v) ctl.testChime(); }} />
          <Switch label={t.notifyCpdlc} value={p.notifyCpdlc} disabled={!p.notifySound}
            onChange={v => updatePrefs({ notifyCpdlc: v })} />
          <Slider label={t.notifyVolume} min={0} max={100} value={Math.round(p.notifyVolume * 100)} suffix="%"
            onCommit={v => { updatePrefs({ notifyVolume: v / 100 }); ctl.chime.play(v / 100); }} />
          <div class="field-row">
            <button class="btn" disabled={!p.notifySound} onClick={() => ctl.testChime()}>{t.testSound}</button>
          </div>
        </Section>

        <BatcSettingsSections />

        {open && (
          <Section title={t.secFlight}>
            <button class="btn btn-danger btn-block" onClick={() => setConfirmQuit(true)}><IconHome size={18} /> {t.quit}</button>
          </Section>
        )}

        <Section title={t.secAbout}>
          <dl class="about">
            <dt>{t.appVersion}</dt><dd class="mono">{__APP_VERSION__}</dd>
            <dt>{t.protocol}</dt><dd class="mono">{PROTOCOL_VERSION}{ctl.store.toolbarVersion.value ? ` (BeyondATC : ${ctl.store.toolbarVersion.value})` : ""}</dd>
            <dt>{t.unknownMsgs}</dt><dd class="mono">{ctl.store.unknownPrefixes.value.join(", ") || t.none}</dd>
          </dl>
          {ctl.store.toolbarVersion.value && ctl.store.toolbarVersion.value !== PROTOCOL_VERSION && (
            <p class="text-warning small">{t.protocolMismatch(ctl.store.toolbarVersion.value)}</p>
          )}
          <p class="muted small">{t.disclaimer}</p>
        </Section>
      </div>

      {confirmQuit && (
        <ConfirmDialog text={t.quitConfirm} onCancel={() => setConfirmQuit(false)}
          onConfirm={() => { setConfirmQuit(false); ctl.quitToMenu(); onClose(); }} />
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: preact.ComponentChildren }) {
  return <section class="set-section"><h2>{title}</h2>{children}</section>;
}

/** Settings stored in BeyondATC (received via "Settings:"). */
function BatcSettingsSections() {
  const ctl = useCtl();
  const t = dict.value;
  const s = ctl.store.settings.value;
  if (ctl.conn.value.status !== "open") return null;
  if (!s) return <p class="muted small">{t.settingsWaiting}</p>;

  const set = (k: string, v: unknown) => ctl.setSetting(k, v);
  const hasDynamic = s.dynamicVoiceOn !== undefined;
  const dynamic = !!s.dynamicVoiceOn;
  const liveOk = !!(s.navigraphLinked && s.navigraphUltimate);

  return (
    <>
      {s.simIs2024 !== false && s.taxiArrowsShown !== undefined && (
        <Section title={t.secTaxi}>
          <Switch label={t.taxiArrows} value={!!s.taxiArrowsShown} onChange={v => set("taxiArrowsShown", v)} />
        </Section>
      )}

      <Section title={t.secAudio}>
        {s.voiceVolume !== undefined && (
          <Slider label={t.voiceVolume} min={0} max={100} value={Number(s.voiceVolume)} suffix="%" onCommit={v => set("voiceVolume", v)} />
        )}
        {s.uiSounds !== undefined && <Switch label={t.uiSounds} value={!!s.uiSounds} onChange={v => set("uiSounds", v)} />}
      </Section>

      {hasDynamic && (
        <Section title={t.secCopilotVoice}>
          <Switch label={t.dynamicVoice} value={dynamic} onChange={v => set("dynamicVoiceOn", v)} />
          <Select label={t.dynamicGender} disabled={!dynamic} value={String(s.dynamicVoiceGender ?? 0)}
            options={s.voiceGenderOptions ?? []} onChange={v => set("dynamicVoiceGender", v)} />
          <Select label={t.manualVoice} disabled={dynamic} value={String(Number(s.autoRespondVoice) || 0)}
            options={(s.autoRespondVoiceOptions ?? []).map((label, i) => ({ value: String(i), label }))}
            onChange={v => set("autoRespondVoice", Number(v))}
            sample={() => ctl.playSample("autoRespond")} />
        </Section>
      )}

      <Section title={t.secVoiceQuality}>
        {s.premiumUnitsMax !== undefined && <PremiumBar units={Number(s.premiumUnits) || 0} max={Number(s.premiumUnitsMax) || 1} label={t.premiumChars} />}
        <Select label={t.controllerVoice} value={String(s.controllerVoice ?? "")} options={s.voiceQualityOptions ?? []}
          onChange={v => set("controllerVoice", v)} sample={() => ctl.playSample("controller")} />
        <Select label={t.trafficVoice} value={String(s.trafficVoice ?? "")} options={s.voiceQualityOptions ?? []}
          onChange={v => set("trafficVoice", v)} sample={() => ctl.playSample("traffic")} />
      </Section>

      <Section title={t.secTraffic}>
        {s.trafficOn !== undefined && <Switch label={t.trafficOn} value={!!s.trafficOn} onChange={v => set("trafficOn", v)} />}
        {([["parkedDensity", t.parked], ["departuresDensity", t.departures], ["arrivalsDensity", t.arrivals], ["enrouteDensity", t.enroute]] as const)
          .filter(([k]) => s[k] !== undefined)
          .map(([k, label]) => <Slider key={k} label={label} min={0} max={10} value={Number(s[k])} onCommit={v => set(k, v)} />)}
        {s.navigraphLiveTraffic !== undefined && (
          <Switch label={t.liveTraffic} hint={liveOk ? undefined : t.liveTrafficLocked}
            value={!!s.navigraphLiveTraffic && liveOk} disabled={!liveOk} onChange={v => set("navigraphLiveTraffic", v)} />
        )}
      </Section>
    </>
  );
}

function Slider({ label, min, max, value, suffix = "", onCommit, disabled, ends }: {
  label: string; min: number; max: number; value: number; suffix?: string; onCommit: (v: number) => void;
  disabled?: boolean; ends?: [string, string];
}) {
  const [v, setV] = useState(value);
  const [dragging, setDragging] = useState(false);
  useEffect(() => { if (!dragging) setV(value); }, [value, dragging]);
  // As in the official toolbar, the value is only sent on release.
  const commit = (n: number) => { setDragging(false); if (n !== value) { haptic(8); onCommit(n); } };
  return (
    <label class={`slider-row ${disabled ? "is-disabled" : ""}`}>
      <span class="row-between"><span>{label}</span><span class="badge mono">{v}{suffix}</span></span>
      <input type="range" min={min} max={max} step={1} value={v} disabled={disabled}
        onInput={e => { setDragging(true); setV(Number((e.target as HTMLInputElement).value)); }}
        onChange={e => commit(Number((e.target as HTMLInputElement).value))} />
      {ends && <span class="row-between slider-ends muted small"><span>{ends[0]}</span><span>{ends[1]}</span></span>}
    </label>
  );
}

function Select({ label, value, options, onChange, disabled, sample }: {
  label: string; value: string; options: Option[]; onChange: (v: string) => void; disabled?: boolean; sample?: () => void;
}) {
  if (options.length === 0) return null;
  const known = options.some(o => String(o.value) === value);
  return (
    <label class={`select-row ${disabled ? "is-disabled" : ""}`}>
      <span>{label}</span>
      <div class="field-row">
        <select class="input" disabled={disabled} value={value} onChange={e => onChange((e.target as HTMLSelectElement).value)}>
          {!known && <option value={value}>{value || "—"}</option>}
          {options.map(o => <option key={String(o.value)} value={String(o.value)}>{o.label || String(o.value)}</option>)}
        </select>
        {sample && (
          <button type="button" class="icon-btn" disabled={disabled} onClick={e => { e.preventDefault(); haptic(); sample(); }} aria-label="sample">
            <IconPlay size={18} />
          </button>
        )}
      </div>
    </label>
  );
}

function PremiumBar({ units, max, label }: { units: number; max: number; label: string }) {
  const ratio = Math.min(1, Math.max(0, units / Math.max(1, max)));
  return (
    <div class="slider-row">
      <span class="row-between"><span>{label}</span><span class="badge mono">{units.toLocaleString()}</span></span>
      <div class="meter"><div class="meter-fill" style={{ width: `${ratio * 100}%`, background: `hsl(${Math.round(120 * ratio)} 55% 50%)` }} /></div>
    </div>
  );
}
