/**
 * Cliente de Sablier (API v2).
 *
 * Sablier no expone un endpoint de listado de instancias, así que el estado
 * se obtiene del flujo SSE de /api/events: al conectar, Sablier emite un
 * evento por instancia conocida (started si está en marcha, stopped si está
 * dormida) y después sigue enviando los cambios (created, updated, removed,
 * started, stopped). El cliente mantiene esa última foto en memoria; si el
 * flujo se cae, se vuelve a abrir.
 *
 * Las sesiones las crea Sablier a través de la estrategia "blocking" con una
 * duración. Como no hay endpoint de sesiones, el portal apunta su propia
 * caducidad (expiresAt) cuando abre una sesión: es la mejor aproximación
 * disponible para el próximo vencimiento.
 *
 * Ninguna llamada rompe el portal: los fallos se devuelven como datos.
 */

export type SablierInstance = {
  name: string;
  status: string;
  groups: string[];
  enabled?: string;
  provider?: string;
  readyAt?: string;
};

export type SablierSession = {
  instances: SablierInstance[];
  status: string;
};

/** Forma cruda de la sesión que devuelve Sablier: cada entrada envuelve la instancia. */
type RawSession = {
  status?: string;
  instances?: { instance?: unknown }[];
};

export type SablierStartResult = {
  ok: boolean;
  status: string;
  instances: SablierInstance[];
  error?: string;
};

const BASE_URL = process.env.SABLIER_URL ?? "http://127.0.0.1:10001";

/** Timeout por defecto de la estrategia blocking: 90 s para un arranque en frío. */
const DEFAULT_START_TIMEOUT_SECONDS = 90;
/** Duración de sesión que abre el portal: 30 min sin tráfico. */
export const SESSION_MINUTES = 30;

function baseUrl(): string {
  return (process.env.SABLIER_URL ?? BASE_URL).replace(/\/+$/, "");
}

/** Convierte segundos en la duración que entiende Sablier (90 -> "90s"). */
function durationText(seconds: number): string {
  const total = Math.max(1, Math.round(seconds));
  if (total % 60 === 0) return `${total / 60}m`;
  return `${total}s`;
}

/** Última foto conocida de cada instancia, alimentada por el flujo SSE. */
const instances = new Map<string, SablierInstance>();
/** Caducidad de las sesiones que abrió este portal: unidad -> epoch ms. */
const sessions = new Map<string, number>();

let listener: Promise<void> | null = null;
let listenerAbort: AbortController | null = null;

/** Normaliza el JSON de una instancia que llega del flujo de eventos. */
function toInstance(raw: unknown): SablierInstance | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const name = typeof data.name === "string" ? data.name : null;
  if (!name) return null;
  const groups = Array.isArray(data.groups)
    ? data.groups.filter((group): group is string => typeof group === "string")
    : [];
  return {
    name,
    status: typeof data.status === "string" ? data.status : "unknown",
    groups,
    ...(typeof data.enabled === "string" ? { enabled: data.enabled } : {}),
    ...(typeof data.provider === "string" ? { provider: data.provider } : {}),
    ...(typeof data.readyAt === "string" ? { readyAt: data.readyAt } : {}),
  };
}

/** Lee el cuerpo del flujo SSE y aplica los eventos a la foto en memoria. */
function applyEvent(event: string, payload: unknown): void {
  const instance = toInstance(payload);
  if (!instance) return;
  if (event === "removed") {
    instances.delete(instance.name);
    sessions.delete(instance.name);
    return;
  }
  // "stopped" no es un borrado: la instancia sigue existiendo, pero dormida.
  instances.set(instance.name, instance);
}

/**
 * Mantiene abierto el flujo de eventos. Es idempotente: si ya hay un
 * escuchador vivo no se abre otro.
 */
function ensureListener(): void {
  if (listener) return;
  listenerAbort = new AbortController();
  const abort = listenerAbort;
  listener = (async () => {
    while (!abort.signal.aborted) {
      try {
        const response = await fetch(`${baseUrl()}/api/events`, {
          signal: abort.signal,
          headers: { Accept: "text/event-stream" },
        });
        if (!response.ok || !response.body) throw new Error(`estado ${response.status}`);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let cut = buffer.indexOf("\n\n");
          while (cut >= 0) {
            const block = buffer.slice(0, cut);
            buffer = buffer.slice(cut + 2);
            cut = buffer.indexOf("\n\n");
            let event = "message";
            let data = "";
            for (const line of block.split("\n")) {
              if (line.startsWith("event:")) event = line.slice(6).trim();
              else if (line.startsWith("data:")) data += line.slice(5).trim();
            }
            if (data) {
              try {
                applyEvent(event, JSON.parse(data));
              } catch {
                // Un evento ilegible no debe tumbar el escuchador.
              }
            }
          }
        }
      } catch {
        if (abort.signal.aborted) break;
        // Reconexión con espera: Sablier puede reiniciarse o no estar
        // disponible. El portal sigue funcionando sin él.
        await new Promise((resolve) => setTimeout(resolve, 10_000));
        continue;
      }
      if (abort.signal.aborted) break;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  })().finally(() => {
    listener = null;
    listenerAbort = null;
  });
}

/** Cierra el flujo de eventos (lo usa el apagado del servidor). */
export function sablierStopListener(): void {
  listenerAbort?.abort();
  listenerAbort = null;
  listener = null;
}

/** ¿Responde Sablier? Consulta /health con un timeout corto. */
export async function sablierAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl()}/health`, {
      signal: AbortSignal.timeout(2_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Arranca las instancias indicadas y abre una sesión para ellas. La estrategia
 * "blocking" devuelve cuando la instancia está lista o cuando vence el
 * timeout de la petición.
 */
export async function sablierStart(
  names: string[],
  minutes: number = SESSION_MINUTES,
  timeoutSeconds: number = DEFAULT_START_TIMEOUT_SECONDS,
): Promise<SablierStartResult> {
  if (names.length === 0) {
    return { ok: false, status: "unknown", instances: [], error: "no hay instancias que arrancar" };
  }
  const params = new URLSearchParams();
  for (const name of names) params.append("names", name);
  params.set("session_duration", `${Math.max(1, Math.round(minutes))}m`);
  params.set("timeout", durationText(timeoutSeconds));
  try {
    const response = await fetch(`${baseUrl()}/api/strategies/blocking?${params}`, {
      signal: AbortSignal.timeout((timeoutSeconds + 15) * 1_000),
    });
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    const headerStatus = response.headers.get("X-Sablier-Session-Status") ?? "";
    if (!response.ok) {
      const detail =
        (body as { detail?: string; title?: string } | null)?.detail ??
        (body as { title?: string } | null)?.title;
      return {
        ok: false,
        status: headerStatus || String(response.status),
        instances: [],
        error: detail ?? `Sablier respondió ${response.status}`,
      };
    }
    const session = (body as { session?: RawSession } | null)?.session;
    const listed = (session?.instances ?? [])
      .map((entry) => toInstance((entry as { instance?: unknown })?.instance ?? entry))
      .filter((entry): entry is SablierInstance => entry !== null);
    for (const instance of listed) instances.set(instance.name, instance);
    const expiresAt = Date.now() + minutes * 60_000;
    for (const name of names) sessions.set(name, expiresAt);
    const status = session?.status ?? headerStatus ?? "ready";
    return { ok: status === "ready", status, instances: listed };
  } catch {
    return {
      ok: false,
      status: "error",
      instances: [],
      error: "Sablier no disponible",
    };
  }
}

/** Instancias conocidas por Sablier, con su estado actual. */
export async function sablierInstances(): Promise<SablierInstance[]> {
  ensureListener();
  return [...instances.values()];
}

/** Instancia concreta por nombre, si Sablier la conoce. */
export function sablierInstance(name: string): SablierInstance | undefined {
  return instances.get(name);
}

/** Caducidad conocida de la sesión de una unidad (epoch ms), si la abrió el portal. */
export function sablierExpiresAt(name: string): number | undefined {
  const expiresAt = sessions.get(name);
  if (!expiresAt) return undefined;
  if (expiresAt <= Date.now()) {
    sessions.delete(name);
    return undefined;
  }
  return expiresAt;
}
