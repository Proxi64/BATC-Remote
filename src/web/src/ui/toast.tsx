import { signal } from "@preact/signals";

const current = signal<{ id: number; text: string } | null>(null);
let seq = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

export function toast(text: string, ms = 1800): void {
  current.value = { id: ++seq, text };
  clearTimeout(timer);
  timer = setTimeout(() => { current.value = null; }, ms);
}

export function Toast() {
  const c = current.value;
  if (!c) return null;
  return <div class="toast" role="status" key={c.id}>{c.text}</div>;
}
