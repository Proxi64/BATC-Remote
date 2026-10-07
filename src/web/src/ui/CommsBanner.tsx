import { dict } from "../i18n";
import { useCtl } from "./ctx";
import { IconMic } from "./icons";

/** Shows the state of the radio exchange (visible in every tab). */
export function CommsBanner() {
  const s = useCtl().store;
  const t = dict.value;
  const { mode, text } = s.comms.value;
  const pending = s.pendingAction.value;

  if (pending && mode === "ready") {
    return <div class="comms comms-sent" role="status"><IconMic size={16} /> <span>{t.sent} <em>{pending}</em></span></div>;
  }
  if (mode === "ready") return null;

  if (mode === "traffic") {
    return <div class="comms comms-traffic" role="status"><span class="pulse-dot" /> <span>{text}</span></div>;
  }

  // For "request", the text is the action in progress (more reliable than "queued", which lags by one).
  const label = t.comms[mode] ?? mode;
  const detail = text && text !== "Request Queued" && mode !== "awaiting" && mode !== "speaking" ? text : "";
  return (
    <div class={`comms comms-${mode}`} role="status">
      <IconMic size={16} />
      <span class="comms-label">{label}</span>
      {detail && <span class="comms-detail">{detail}</span>}
    </div>
  );
}
