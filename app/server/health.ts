import type { AppEntry, TamboConfig } from "../src/schema";

export type HealthStatus = "up" | "down" | "unknown";
export type HealthEntry = {
  status: HealthStatus;
  code?: number;
  ms?: number;
  checkedAt?: string;
};
export type Expect = number | [number, number] | undefined;

/** `up` si el código cae dentro de expect (por defecto 200-399). */
export function matchesExpect(expect: Expect, code: number): boolean {
  if (expect === undefined) return code >= 200 && code <= 399;
  if (typeof expect === "number") return code === expect;
  return code >= expect[0] && code <= expect[1];
}

type Track = { fails: number; status: HealthStatus; entry: HealthEntry };

/**
 * Regla de estado: un acierto marca `up`; `down` solo tras dos fallos
 * seguidos, para evitar parpadeo. Sin chequeos previos queda `unknown`.
 */
export function applyOutcome(
  track: Track | undefined,
  outcome: { ok: boolean; code?: number; ms?: number },
  now: string,
): Track {
  if (outcome.ok) {
    return {
      fails: 0,
      status: "up",
      entry: { status: "up", code: outcome.code, ms: outcome.ms, checkedAt: now },
    };
  }
  const fails = (track?.fails ?? 0) + 1;
  const status: HealthStatus = fails >= 2 ? "down" : track?.status === "up" ? "up" : "unknown";
  return {
    fails,
    status,
    entry: {
      status,
      code: outcome.code,
      ms: outcome.ms,
      checkedAt: now,
    },
  };
}

const CONCURRENCY = 6;
const TIMEOUT_MS = 2_000;

type CheckOutcome = { ok: boolean; code?: number; ms?: number };

/**
 * Chequeo periódico de salud desde la VM: recorre las apps con health.url
 * cada settings.healthIntervalSec segundos, con concurrencia máxima de 6.
 */
export class HealthService {
  private readonly getConfig: () => TamboConfig | null;
  private readonly fetchImpl: typeof fetch;
  private readonly tracks = new Map<string, Track>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<void> | null = null;

  constructor(deps: {
    getConfig: () => TamboConfig | null;
    fetchImpl?: typeof fetch;
    onUpdate?: () => void;
  }) {
    this.getConfig = deps.getConfig;
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.onUpdate = deps.onUpdate;
  }

  private onUpdate: (() => void) | undefined;

  snapshot(): Record<string, HealthEntry> {
    return Object.fromEntries([...this.tracks].map(([id, t]) => [id, t.entry]));
  }

  private intervalMs(): number {
    const seconds = this.getConfig()?.settings.healthIntervalSec ?? 30;
    return Math.min(300, Math.max(10, seconds)) * 1_000;
  }

  start(): void {
    if (this.timer) return;
    const tick = () => {
      this.timer = setTimeout(() => {
        void this.refresh().finally(() => tick());
      }, this.intervalMs());
    };
    tick();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  refresh(): Promise<void> {
    this.running ??= this.run().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async run(): Promise<void> {
    const config = this.getConfig();
    if (!config) return;
    const targets = config.groups.flatMap((group) => group.apps).filter((app) => app.health);
    const queue = [...targets];
    const alive = new Set(targets.map((app) => app.id));
    for (const id of this.tracks.keys()) {
      if (!alive.has(id)) this.tracks.delete(id);
    }
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () =>
      this.drain(queue),
    );
    await Promise.all(workers);
    this.onUpdate?.();
  }

  private async drain(queue: AppEntry[]): Promise<void> {
    for (let app = queue.shift(); app; app = queue.shift()) {
      const outcome = await this.check(app);
      this.tracks.set(
        app.id,
        applyOutcome(this.tracks.get(app.id), outcome, new Date().toISOString()),
      );
    }
  }

  private async check(app: AppEntry): Promise<CheckOutcome> {
    const url = app.health?.url;
    if (!url) return { ok: false };
    const started = performance.now();
    try {
      const response = await this.fetchImpl(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "user-agent": "tambo-health" },
        redirect: "follow",
      });
      const ms = Math.round(performance.now() - started);
      return {
        ok: matchesExpect(app.health?.expect, response.status),
        code: response.status,
        ms,
      };
    } catch {
      return { ok: false, ms: Math.round(performance.now() - started) };
    }
  }
}
