/**
 * Robust WebSocket connection to BeyondATC.
 *
 * - automatic reconnection with increasing delay (1, 2, 4, 8, 15 s + jitter)
 * - opening timeout (8 s)
 * - keep-alive: "ping" every 15 s; with no message at all for 45 s, the
 *   connection is considered dead and restarted (useful after the phone sleeps)
 * - "generation": events from an old socket are ignored
 */

export type ConnectionStatus = "idle" | "connecting" | "open" | "waiting";

export interface ConnectionOptions {
  /** Called on every attempt: the URL can change (preferences). */
  url: () => string;
  onFrame: (frame: string) => void;
  onStatus: (status: ConnectionStatus, detail: { attempt: number; nextRetryMs?: number; error?: string }) => void;
  onOpen: () => void;
  /** Injectable for tests */
  createSocket?: (url: string) => WebSocket;
  random?: () => number;
}

const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000];
const OPEN_TIMEOUT_MS = 8000;
const PING_EVERY_MS = 15000;
const DEAD_AFTER_MS = 45000;

export class BatcConnection {
  private ws: WebSocket | null = null;
  private generation = 0;
  private attempt = 0;
  private running = false;
  private status: ConnectionStatus = "idle";
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private openTimer: ReturnType<typeof setTimeout> | undefined;
  private pingTimer: ReturnType<typeof setInterval> | undefined;
  private lastMessageAt = 0;

  constructor(private readonly opts: ConnectionOptions) {}

  get currentStatus(): ConnectionStatus { return this.status; }
  get isOpen(): boolean { return this.status === "open"; }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.attempt = 0;
    this.connect();
  }

  stop(): void {
    this.running = false;
    this.teardown();
    this.setStatus("idle");
  }

  /** Reconnect right away (URL change, return to the foreground, network back). */
  reconnectNow(): void {
    if (!this.running) { this.start(); return; }
    this.attempt = 0;
    this.connect();
  }

  /** Called when returning to the foreground: checks that the connection is still alive. */
  checkAlive(): void {
    if (!this.running) return;
    if (this.status !== "open") { this.reconnectNow(); return; }
    if (Date.now() - this.lastMessageAt > DEAD_AFTER_MS) { this.reconnectNow(); return; }
    this.send("ping");
  }

  send(text: string): boolean {
    if (!this.ws || this.ws.readyState !== 1 /* OPEN */) return false;
    try { this.ws.send(text); return true; } catch { return false; }
  }

  // ---------- internal ----------

  private connect(): void {
    this.teardown();
    const gen = ++this.generation;
    const url = this.opts.url();
    this.attempt++;
    this.setStatus("connecting");

    let ws: WebSocket;
    try {
      ws = this.opts.createSocket ? this.opts.createSocket(url) : new WebSocket(url);
    } catch (e) {
      this.scheduleRetry(e instanceof Error ? e.message : String(e));
      return;
    }
    this.ws = ws;

    this.openTimer = setTimeout(() => {
      if (gen === this.generation && ws.readyState === 0) { try { ws.close(); } catch { /* ignore */ } }
    }, OPEN_TIMEOUT_MS);

    ws.onopen = () => {
      if (gen !== this.generation) return;
      clearTimeout(this.openTimer);
      this.attempt = 0;
      this.lastMessageAt = Date.now();
      this.setStatus("open");
      this.pingTimer = setInterval(() => this.keepAlive(gen), PING_EVERY_MS);
      this.opts.onOpen();
    };
    ws.onmessage = ev => {
      if (gen !== this.generation) return;
      this.lastMessageAt = Date.now();
      if (typeof ev.data === "string") this.opts.onFrame(ev.data);
    };
    ws.onclose = () => {
      if (gen !== this.generation) return;
      this.ws = null;
      this.clearTimers();
      if (this.running) this.scheduleRetry();
    };
    ws.onerror = () => { /* followed by onclose */ };
  }

  private keepAlive(gen: number): void {
    if (gen !== this.generation || !this.ws) return;
    if (Date.now() - this.lastMessageAt > DEAD_AFTER_MS) {
      // Silent connection (Wi-Fi dropped without a clean close): restart it.
      this.reconnectNow();
      return;
    }
    this.send("ping");
  }

  private scheduleRetry(error?: string): void {
    // attempt = 0 when a connection that was established just dropped → first delay (1 s)
    const index = Math.min(Math.max(this.attempt - 1, 0), BACKOFF_MS.length - 1);
    const base = BACKOFF_MS[index]!;
    const delay = base + Math.floor((this.opts.random ?? Math.random)() * 300);
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => { if (this.running) this.connect(); }, delay);
    this.setStatus("waiting", { nextRetryMs: delay, error });
  }

  private clearTimers(): void {
    clearTimeout(this.openTimer);
    clearInterval(this.pingTimer);
    this.openTimer = undefined;
    this.pingTimer = undefined;
  }

  private teardown(): void {
    this.clearTimers();
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    const old = this.ws;
    this.ws = null;
    this.generation++;
    if (old) {
      old.onopen = old.onmessage = old.onclose = old.onerror = null;
      try { old.close(); } catch { /* ignore */ }
    }
  }

  private setStatus(status: ConnectionStatus, extra: { nextRetryMs?: number; error?: string } = {}): void {
    this.status = status;
    this.opts.onStatus(status, { attempt: this.attempt, ...extra });
  }
}
