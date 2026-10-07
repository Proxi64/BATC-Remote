import { useEffect, useState } from "preact/hooks";
import { prefs } from "../core/prefs";
import { dict } from "../i18n";
import { ActionsPanel } from "./ActionsPanel";
import { CommsBanner } from "./CommsBanner";
import { useCtl } from "./ctx";
import { AppErrorDialog, PromptDialog } from "./Dialogs";
import { FrequenciesPanel } from "./FrequenciesPanel";
import { IconBolt, IconChat, IconRadio } from "./icons";
import { LogPanel } from "./LogPanel";
import { RadioPanel } from "./RadioPanel";
import { DisconnectedScreen, LoadingScreen, MenuScreen, NoHostScreen } from "./Screens";
import { SettingsSheet } from "./SettingsSheet";
import { Toast } from "./toast";
import { TopBar } from "./TopBar";

/** Short outage tolerated before switching to the "disconnected" screen. */
const GRACE_MS = 6000;

type Tab = "actions" | "log" | "freq";

function useMedia(query: string): boolean {
  const [m, setM] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const h = () => setM(mq.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, [query]);
  return m;
}

/** Refreshes the display every second while a connection outage is ongoing. */
function useTickWhile(active: boolean): void {
  const [, set] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => set(n => n + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
}

export function App() {
  const ctl = useCtl();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const c = ctl.conn.value;
  const open = c.status === "open";
  useTickWhile(!open);

  useEffect(() => {
    document.documentElement.style.setProperty("--text-scale", String(prefs.value.textScale));
  }, [prefs.value.textScale]);

  const openSettings = () => setSettingsOpen(true);
  const longOutage = !open && (!c.everConnected || (c.downSince !== null && Date.now() - c.downSince > GRACE_MS));

  // Dimmed and non-interactive only while showing flight data from a connection being re-established;
  // the address and "unreachable" screens must stay usable.
  const stale = !open && !!c.url && !longOutage;

  let screen;
  if (!c.url) screen = <NoHostScreen />;
  else if (longOutage) screen = <DisconnectedScreen onSettings={openSettings} />;
  else {
    const stage = ctl.store.loadState.value.stage;
    if (stage === "menu") screen = <MenuScreen />;
    else if (stage === "ready" || stage === "turnaround") screen = <Main />;
    else screen = <LoadingScreen />;
  }

  return (
    <div class="app">
      <TopBar onSettings={openSettings} />
      {!open && !longOutage && c.url && <div class="reconnect-banner" role="status">{dict.value.reconnecting}</div>}
      <main class={`app-body ${stale ? "is-stale" : ""}`}>{screen}</main>
      <PromptDialog />
      <AppErrorDialog />
      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} />}
      <Toast />
    </div>
  );
}

function Main() {
  const t = dict.value;
  const wide = useMedia("(min-width: 900px) and (orientation: landscape)");
  const [tab, setTab] = useState<Tab>("actions");

  if (wide) {
    // Tablet in landscape: log on the left, actions/frequencies on the right.
    const right: Tab = tab === "log" ? "actions" : tab;
    return (
      <div class="main main-wide">
        <div class="col col-left">
          <RadioPanel />
          <LogPanel />
        </div>
        <div class="col col-right">
          <CommsBanner />
          <nav class="tabs-top" role="tablist">
            <TabButton on={right === "actions"} onClick={() => setTab("actions")} icon={<IconBolt size={18} />} label={t.tabActions} />
            <TabButton on={right === "freq"} onClick={() => setTab("freq")} icon={<IconRadio size={18} />} label={t.tabFreq} />
          </nav>
          <div class="tab-content">{right === "actions" ? <ActionsPanel /> : <FrequenciesPanel />}</div>
        </div>
      </div>
    );
  }

  return (
    <div class="main">
      <RadioPanel />
      <CommsBanner />
      <div class="tab-content">
        {tab === "actions" && <ActionsPanel />}
        {tab === "log" && <LogPanel />}
        {tab === "freq" && <FrequenciesPanel />}
      </div>
      <nav class="tabs-bottom" role="tablist">
        <TabButton on={tab === "actions"} onClick={() => setTab("actions")} icon={<IconBolt />} label={t.tabActions} />
        <TabButton on={tab === "log"} onClick={() => setTab("log")} icon={<IconChat />} label={t.tabLog} />
        <TabButton on={tab === "freq"} onClick={() => setTab("freq")} icon={<IconRadio />} label={t.tabFreq} />
      </nav>
    </div>
  );
}

function TabButton({ on, onClick, icon, label }: { on: boolean; onClick: () => void; icon: preact.JSX.Element; label: string }) {
  return (
    <button role="tab" aria-selected={on} class={`tab ${on ? "is-on" : ""}`} onClick={onClick}>
      {icon}<span>{label}</span>
    </button>
  );
}
