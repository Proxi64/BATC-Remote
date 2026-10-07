import { useEffect, useState } from "preact/hooks";
import { displayHost } from "../core/host";
import { updatePrefs } from "../core/prefs";
import { dict } from "../i18n";
import { haptic, useCtl } from "./ctx";
import { canScan } from "../core/scanner";
import { IconPlane, IconQr, IconRefresh, IconWifiOff } from "./icons";
import { scanAndReport } from "./scan";

/** Countdown before the next attempt. */
function useCountdown(ms: number | undefined, key: unknown): number {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!ms) { setLeft(0); return; }
    const end = Date.now() + ms;
    const tick = () => setLeft(Math.max(0, Math.ceil((end - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [ms, key]);
  return left;
}

export function DisconnectedScreen({ onSettings }: { onSettings: () => void }) {
  const ctl = useCtl();
  const t = dict.value;
  const c = ctl.conn.value;
  const left = useCountdown(c.status === "waiting" ? c.nextRetryMs : undefined, c.attempt);
  const connecting = c.status === "connecting";

  return (
    <div class="screen center">
      <div class={`hero-icon ${connecting ? "is-busy" : ""}`}><IconWifiOff size={40} /></div>
      <h1>{connecting ? t.connecting : t.notConnectedTitle}</h1>
      {c.url && <p class="muted mono">{t.target}: {displayHost(c.url)}</p>}
      <p class="muted small">
        {connecting ? t.attempt(Math.max(1, c.attempt)) : left > 0 ? t.retryIn(left) : " "}
      </p>
      {!connecting && c.attempt >= 2 && (
        <ul class="checklist">
          {t.checklist.map(item => <li key={item}>{item}</li>)}
        </ul>
      )}
      <div class="btn-col">
        <button class="btn btn-primary" onClick={() => { haptic(); ctl.reconnect(); }}><IconRefresh size={18} /> {t.retryNow}</button>
        <button class="btn" onClick={onSettings}>{t.changeAddress}</button>
      </div>
    </div>
  );
}

export function NoHostScreen() {
  const ctl = useCtl();
  const t = dict.value;
  const [host, setHost] = useState("");
  const [busy, setBusy] = useState(false);
  const scan = canScan();
  const submit = (e: Event) => {
    e.preventDefault();
    if (!host.trim()) return;
    updatePrefs({ host: host.trim() });
    ctl.start();
  };
  const onScan = async () => {
    if (busy) return;
    setBusy(true);
    try { await scanAndReport(ctl); } finally { setBusy(false); }
  };
  return (
    <form class="screen center" onSubmit={submit}>
      <div class="hero-icon"><IconPlane size={40} /></div>
      <h1>{t.noHostTitle}</h1>
      {scan ? (
        <>
          <button type="button" class="btn btn-primary btn-lg scan-btn" disabled={busy} onClick={onScan}>
            <IconQr size={22} /> {t.scanQr}
          </button>
          <p class="muted small">{t.scanHint}</p>
          <p class="or-sep muted small">{t.orEnterIp}</p>
        </>
      ) : (
        <p class="muted">{t.noHostText}</p>
      )}
      <input class="input mono" inputMode="decimal" autoComplete="off" placeholder={t.hostPlaceholder}
        value={host} onInput={e => setHost((e.target as HTMLInputElement).value)} />
      <button class={`btn ${scan ? "" : "btn-primary"}`} type="submit">{t.connect}</button>
    </form>
  );
}

export function MenuScreen() {
  const ctl = useCtl();
  const t = dict.value;
  const ls = ctl.store.loadState.value;
  const start = (m: "IFR" | "VFR_SIMBRIEF" | "VFR_MSFS") => { haptic(); ctl.startFlight(m); };
  return (
    <div class="screen center">
      <div class="hero-icon"><IconPlane size={40} /></div>
      <h1>{t.menuTitle}</h1>
      {!ls.loggedIn ? (
        <p class="muted">{t.menuLogin}</p>
      ) : (
        <div class="btn-col wide">
          <button class="btn btn-primary btn-lg" onClick={() => start("IFR")}>{t.startIfr}</button>
          {ls.vfr && <button class="btn btn-lg" onClick={() => start("VFR_SIMBRIEF")}>{t.startVfrSimbrief}</button>}
          {ls.vfr && <button class="btn btn-lg" onClick={() => start("VFR_MSFS")}>{t.startVfrMsfs}</button>}
        </div>
      )}
    </div>
  );
}

export function LoadingScreen() {
  const t = dict.value;
  const ls = useCtl().store.loadState.value;
  return (
    <div class="screen center">
      <div class="spinner" aria-hidden="true" />
      <h1>{ls.text || t.loading}</h1>
      {ls.pct >= 0 && (
        <div class="load-bar"><div class="load-fill" style={{ width: `${Math.min(100, Math.max(0, ls.pct))}%` }} /></div>
      )}
    </div>
  );
}
