import { dict } from "../i18n";
import { haptic, useCtl } from "./ctx";
import { IconHeadset } from "./icons";

export function ActionsPanel() {
  const ctl = useCtl();
  const s = ctl.store;
  const t = dict.value;
  const actions = s.actions.value;
  const visible = s.actionsVisible.value;
  const pending = s.pendingAction.value;
  const stage = s.loadState.value.stage;
  const disabled = !visible || !!pending || ctl.conn.value.status !== "open";

  const onAction = (label: string) => {
    if (disabled) return;
    if (ctl.sendAction(label)) haptic(15);
  };

  return (
    <div class="panel actions-panel">
      <CopilotToggles />

      {stage === "turnaround" && (
        <div class="card turnaround">
          <div>
            <strong>{t.turnaroundTitle}</strong>
            <p class="muted">{t.turnaroundText}</p>
          </div>
          <button class="btn btn-primary" onClick={() => { haptic(); ctl.turnaround(); }}>{t.turnaroundBtn}</button>
        </div>
      )}

      <div class={`actions-grid ${disabled ? "is-disabled" : ""}`} aria-busy={!visible}>
        {actions.length === 0 ? (
          <p class="empty">{t.noActions}</p>
        ) : (
          actions.map((a, i) => (
            <button
              key={a}
              class={`action ${pending === a ? "is-pending" : ""} ${a.length <= 8 ? "is-short" : ""}`}
              style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
              disabled={disabled}
              onClick={() => onAction(a)}
            >
              {a}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function CopilotToggles() {
  const ctl = useCtl();
  const t = dict.value;
  const ar = ctl.store.autoRespond.value;
  const at = ctl.store.autoTune.value;
  const off = ctl.conn.value.status !== "open";
  return (
    <div class="copilot" role="group" aria-label={t.copilot}>
      {/* Grid: icon | Auto respond | Auto tune (see .copilot in styles.css). */}
      <span class="copilot-title" aria-hidden="true" title={t.copilot}><IconHeadset size={20} /></span>
      <div class="copilot-switches">
        <Switch label={t.autoRespond} value={!!ar} disabled={off || ar === null} onChange={v => ctl.setAutoRespond(v)} />
        <Switch label={t.autoTune} value={!!at} disabled={off || at === null} onChange={v => ctl.setAutoTune(v)} />
      </div>
    </div>
  );
}

export function Switch({ label, value, disabled, onChange, hint }: {
  label: string; value: boolean; disabled?: boolean; onChange: (v: boolean) => void; hint?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      class={`switch-row ${value ? "is-on" : ""}`}
      disabled={disabled}
      onClick={() => { haptic(8); onChange(!value); }}
    >
      <span class="switch-label">{label}{hint && <small>{hint}</small>}</span>
      <span class="switch" aria-hidden="true"><span class="knob" /></span>
    </button>
  );
}
