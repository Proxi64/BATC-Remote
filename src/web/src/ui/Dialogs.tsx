import type { ComponentChildren } from "preact";
import { dict } from "../i18n";
import { haptic, useCtl } from "./ctx";

export function Modal({ children, onBackdrop }: { children: ComponentChildren; onBackdrop?: () => void }) {
  return (
    <div class="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onBackdrop?.(); }}>
      <div class="modal" role="dialog" aria-modal="true">{children}</div>
    </div>
  );
}

/** Yes/No question asked by BeyondATC. */
export function PromptDialog() {
  const ctl = useCtl();
  const p = ctl.store.prompt.value;
  if (!p) return null;
  return (
    <Modal>
      <h2>{p.title}</h2>
      <p>{p.text}</p>
      <div class="modal-actions">
        <button class="btn" onClick={() => { haptic(); ctl.answerPrompt(false); }}>{p.noLabel}</button>
        <button class="btn btn-primary" onClick={() => { haptic(); ctl.answerPrompt(true); }}>{p.yesLabel}</button>
      </div>
    </Modal>
  );
}

export function AppErrorDialog() {
  const ctl = useCtl();
  const t = dict.value;
  const e = ctl.store.appError.value;
  if (!e) return null;
  return (
    <Modal>
      <h2 class={e.fatal ? "text-danger" : "text-warning"}>{e.fatal ? t.errorTitle : t.warningTitle}</h2>
      <p>{e.text}</p>
      <div class="modal-actions">
        <button class="btn btn-primary" onClick={() => ctl.ackError()}>{t.ok}</button>
      </div>
    </Modal>
  );
}

export function ConfirmDialog({ text, onConfirm, onCancel }: { text: string; onConfirm: () => void; onCancel: () => void }) {
  const t = dict.value;
  return (
    <Modal onBackdrop={onCancel}>
      <p>{text}</p>
      <div class="modal-actions">
        <button class="btn" onClick={onCancel}>{t.cancel}</button>
        <button class="btn btn-danger" onClick={onConfirm}>{t.confirm}</button>
      </div>
    </Modal>
  );
}
