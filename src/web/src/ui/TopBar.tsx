import { isNativeApp } from "../core/platform";
import { useEffect, useState } from "preact/hooks";
import { dict } from "../i18n";
import { useCtl } from "./ctx";
import { IconExpand, IconGear, IconShrink } from "./icons";

// The Android app is already full screen: no button there.
const canFullscreen = typeof document !== "undefined" && !!document.documentElement.requestFullscreen && !isNativeApp();

export function TopBar({ onSettings }: { onSettings: () => void }) {
  const ctl = useCtl();
  const t = dict.value;
  const cs = ctl.store.callsign.value;
  const status = ctl.conn.value.status;
  const [fs, setFs] = useState(false);

  useEffect(() => {
    const h = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  const toggleFs = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    } catch { /* refused by the browser */ }
  };

  return (
    <header class="topbar">
      <div class="topbar-left">
        <span class={`dot dot-${status}`} aria-label={status} />
        {cs ? (
          <span class="callsign">
            <strong>{cs.full}</strong>
            {cs.shortForm && <span class="muted"> · {cs.shortForm}</span>}
          </span>
        ) : (
          <span class="brand">{t.appName}</span>
        )}
      </div>
      <div class="topbar-right">
        {canFullscreen && (
          <button class="icon-btn" onClick={toggleFs} aria-label={t.fullscreen} title={t.fullscreen}>
            {fs ? <IconShrink /> : <IconExpand />}
          </button>
        )}
        <button class="icon-btn" onClick={onSettings} aria-label={t.settings} title={t.settings}>
          <IconGear />
        </button>
      </div>
    </header>
  );
}
