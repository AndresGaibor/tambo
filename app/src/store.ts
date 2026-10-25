import { create } from "zustand";
import type { HealthEntry } from "../server/health";
import type { ServiceEntry } from "../server/services";
import { configSchema, type SablierState, type TamboConfig } from "./schema";
import type { MachineStats } from "../server/stats";

export type ThemeMode = "dark" | "light" | "system";
export type ViewMode = "compact" | "covers";
export type SaveStatus = "idle" | "saving" | "saved" | "error";
export type DetailsState = { appId: string | null };

export type DrawerState =
  | { mode: "closed" }
  | { mode: "app"; appId: string | null; groupId: string }
  | { mode: "group"; groupId: string | null };

/**
 * Texto corto del estado de Sablier para una app gestionada: en sesión
 * mientras la instancia está despierta, dormida si está a cero.
 */
export function sablierWord(state: SablierState | undefined): string {
  if (!state) return "Sablier";
  if (state.sessionActive) return "En sesión";
  if (state.status === "starting" || state.status === "pending") return "Despertando";
  return "Dormida";
}

/** Tono del chip de Sablier: verde en sesión, apagado si duerme. */
export function sablierTone(state: SablierState | undefined): string {
  if (!state) return "var(--unknown)";
  if (state.sessionActive) return "var(--ok)";
  if (state.status === "starting" || state.status === "pending") return "var(--warn)";
  return "var(--unknown)";
}

/** Milisegundos que restan de la sesión de Sablier, o 0 si expiró o no hay. */
export function sablierRemainingMs(
  state: SablierState | undefined,
  now: number = Date.now(),
): number {
  if (!state?.expiresAt) return 0;
  return Math.max(0, state.expiresAt - now);
}

/** Instancias gestionadas por Sablier, deduplicadas por unidad. */
export function sablierInstances(services: Record<string, ServiceEntry>): {
  unit: string;
  appIds: string[];
  state: SablierState;
}[] {
  const byUnit = new Map<string, { unit: string; appIds: string[]; state: SablierState }>();
  for (const [appId, entry] of Object.entries(services)) {
    if (!entry.sablier) continue;
    const existing = byUnit.get(entry.unit);
    if (existing) {
      existing.appIds.push(appId);
      continue;
    }
    byUnit.set(entry.unit, { unit: entry.unit, appIds: [appId], state: entry.sablier });
  }
  return [...byUnit.values()];
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    // Almacenamiento ausente o corrupto: se usa el valor por omisión.
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Sin almacenamiento la preferencia vive solo en esta sesión.
  }
}

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const raw = readJson<T>(key, fallback);
  return (allowed as readonly string[]).includes(raw) ? raw : fallback;
}

/**
 * Última configuración confirmada por el servidor, para arrancar sin
 * conexión. Solo se guardan respuestas del servidor validadas por el
 * esquema y con versión 1: nunca borradores ni datos inventados.
 */
const CONFIG_CACHE_KEY = "tambo.config";

type CachedConfig = { config: TamboConfig; savedAt: number };

function readCachedConfig(): CachedConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { version?: number; savedAt?: number; config?: unknown };
    if (parsed.version !== 1 || typeof parsed.savedAt !== "number" || !parsed.config) {
      localStorage.removeItem(CONFIG_CACHE_KEY);
      return null;
    }
    const check = configSchema.safeParse(parsed.config);
    if (!check.success || check.data.version !== 1) {
      localStorage.removeItem(CONFIG_CACHE_KEY);
      return null;
    }
    return { config: check.data, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

function writeCachedConfig(config: TamboConfig): void {
  try {
    localStorage.setItem(
      CONFIG_CACHE_KEY,
      JSON.stringify({ version: 1, savedAt: Date.now(), config }),
    );
  } catch {
    // Sin almacenamiento la caché simplemente no existe.
  }
}

const cachedBoot = readCachedConfig();

// Historial para sparklines (últimos 60 muestras ≈ 15 min a 15s)
const HISTORY_MAX = 60;

type HistoryPoint = {
  ts: number;
  cpuPercent: number | null;
  memoryUsedBytes: number;
  memoryTotalBytes: number;
  load1: number;
  services: Record<string, ServiceEntry>;
};

type TamboState = {
  config: TamboConfig | null;
  previousConfig: TamboConfig | null;
  etag: string | null;
  health: Record<string, HealthEntry>;
  services: Record<string, ServiceEntry>;
  /** Estado de Sablier por app gestionada: id de app -> bloque de Sablier. */
  sablier: Record<string, SablierState>;
  machine: MachineStats | null;
  /** Momento (Date.now) del último /api/health exitoso; 0 si nunca. */
  healthUpdatedAt: number;
  /** true cuando la última actualización de salud falló: datos viejos. */
  healthStale: boolean;
  online: boolean;
  /** De dónde salió la configuración en pantalla: servidor o caché local. */
  configSource: "server" | "cache" | null;
  /** Última sincronización confirmada con el servidor (Date.now). */
  lastSyncAt: number;
  loadError: string | null;
  saveError: string | null;
  actionError: string | null;
  saving: boolean;
  saveStatus: SaveStatus;
  conflict: boolean;
  query: string;
  editing: boolean;
  drawer: DrawerState;
  details: DetailsState;
  collapsed: string[];
  theme: ThemeMode;
  view: ViewMode;
  /** Atajos globales e, t y 1-9; siempre se respetan / y Cmd+K. */
  shortcuts: boolean;

  // Historial temporal para sparklines
  history: HistoryPoint[];
  addHistoryPoint: (point: HistoryPoint) => void;

  applyConfig: (config: TamboConfig, etag: string) => void;
  applyCachedConfig: (config: TamboConfig, savedAt: number) => void;
  load: () => Promise<void>;
  loadHealth: () => Promise<void>;
  loadServices: () => Promise<void>;
  powerAction: (appId: string, action: "start" | "stop") => Promise<void>;
  clearActionError: () => void;
  toasts: { id: number; message: string; tone: "ok" | "warn" | "down" | "info" }[];
  pushToast: (message: string, tone?: "ok" | "warn" | "down" | "info") => void;
  dismissToast: (id: number) => void;
  save: (next: TamboConfig) => Promise<boolean>;
  undo: () => void;
  canUndo: boolean;
  setQuery: (query: string) => void;
  quickFilter: "all" | "prod" | "dev" | "sleeping" | "down";
  setQuickFilter: (filter: "all" | "prod" | "dev" | "sleeping" | "down") => void;
  selectedApps: Set<string>;
  toggleSelectApp: (appId: string) => void;
  clearSelection: () => void;
  batchPowerAction: (action: "start" | "stop") => Promise<void>;
  setEditing: (editing: boolean) => void;
  openDrawer: (drawer: DrawerState) => void;
  closeDrawer: () => void;
  openDetails: (appId: string | null) => void;
  toggleCollapse: (groupId: string) => void;
  setTheme: (theme: ThemeMode) => void;
  setView: (view: ViewMode) => void;
  setShortcuts: (enabled: boolean) => void;
  resolveConflict: () => void;
};

export const useStore = create<TamboState>((set, get) => ({
  etag: null,
  health: {},
  services: {},
  sablier: {},
  machine: null,
  healthUpdatedAt: 0,
  healthStale: false,
  online: true,
  configSource: cachedBoot ? ("cache" as const) : null,
  lastSyncAt: cachedBoot?.savedAt ?? 0,
  loadError: null,
  saveError: null,
  actionError: null,
  toasts: [],
  saving: false,
  canUndo: false,
  saveStatus: "idle",
  conflict: false,
  query: "",
  quickFilter: "all",
  editing: false,
  selectedApps: new Set(),
  drawer: { mode: "closed" },
  details: { appId: null },
  config: cachedBoot?.config ?? null,
  previousConfig: null,
  collapsed: readJson<string[]>("tambo.collapsed", []),
  theme: readStored<ThemeMode>("tambo.theme", ["dark", "light", "system"], "system"),
  view: readStored<ViewMode>("tambo.view", ["compact", "covers"], "compact"),
  shortcuts: readJson<boolean>("tambo.shortcuts", true),
  history: [],

  addHistoryPoint: (point) =>
    set((state) => {
      const next = [...state.history, point];
      if (next.length > HISTORY_MAX) next.shift();
      return { history: next };
    }),

  applyConfig: (config, etag) => {
    writeCachedConfig(config);
    set({
      config,
      etag,
      configSource: "server",
      lastSyncAt: Date.now(),
      theme:
        readStored<ThemeMode>("tambo.theme", ["dark", "light", "system"], "system") ??
        config.settings.theme,
      loadError: null,
    });
  },

  // Restauración desde caché: sin etag (no hay If-Match contra datos
  // viejos, así que guardar queda bloqueado hasta revalidar).
  applyCachedConfig: (config, savedAt) => {
    set({
      config,
      etag: null,
      configSource: "cache",
      lastSyncAt: savedAt,
      theme:
        readStored<ThemeMode>("tambo.theme", ["dark", "light", "system"], "system") ??
        config.settings.theme,
    });
  },

  load: async () => {
    try {
      const response = await fetch("/api/config", { headers: { "Cache-Control": "no-cache" } });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        set({ online: true, loadError: body.error ?? `error ${response.status}` });
        // Sin respuesta válida del servidor: se muestra la caché validada
        // si existe, sin reemplazar lo que ya está en pantalla.
        const cached = readCachedConfig();
        if (cached && !get().config) get().applyCachedConfig(cached.config, cached.savedAt);
        return;
      }
      const etag = response.headers.get("ETag");
      const config = (await response.json()) as TamboConfig;
      set({ online: true });
      if (etag) get().applyConfig(config, etag);
    } catch {
      // Servidor sin responder: se conservan las tarjetas existentes y se
      // restaura la caché validada solo si la pantalla estaba vacía.
      const cached = readCachedConfig();
      set({ online: false });
      if (cached && !get().config) get().applyCachedConfig(cached.config, cached.savedAt);
    }
  },

  loadHealth: async () => {
    try {
      const response = await fetch("/api/health");
      if (!response.ok) {
        set({ healthStale: true });
        return;
      }
      const raw = (await response.json()) as Record<string, HealthEntry>;
      // Una app gestionada por Sablier y dormida no está caída: la marca
      // como "unknown" para no disparar alertas rojas en la tarjeta.
      const services = get().services;
      const health: Record<string, HealthEntry> = { ...raw };
      for (const [appId, entry] of Object.entries(services)) {
        if (!entry.sablier || entry.sablier.sessionActive) continue;
        const current = health[appId];
        health[appId] = {
          status: "unknown",
          ...(current?.code !== undefined ? { code: current.code } : {}),
          ...(current?.ms !== undefined ? { ms: current.ms } : {}),
          ...(current?.checkedAt ? { checkedAt: current.checkedAt } : {}),
        };
      }
      set({ health, online: true, healthStale: false, healthUpdatedAt: Date.now() });
    } catch {
      // Fallo solo de salud: se conservan los últimos datos y se marca que
      // están desactualizados; la conexión del portal no cambia por esto.
      set({ healthStale: true });
    }
  },

  loadServices: async () => {
    try {
      const response = await fetch("/api/services");
      if (!response.ok) return;
      const body = (await response.json()) as {
        services: Record<string, ServiceEntry>;
        machine: MachineStats | null;
      };
      const now = Date.now();
      const point: HistoryPoint = {
        ts: now,
        cpuPercent: body.machine?.cpuPercent ?? null,
        memoryUsedBytes: body.machine?.memoryUsedBytes ?? 0,
        memoryTotalBytes: body.machine?.memoryTotalBytes ?? 0,
        load1: body.machine?.load1 ?? 0,
        services: body.services,
      };
      // Solo las apps gestionadas por Sablier entran en su propio mapa: la
      // UI distingue las que escalan a cero de las que no.
      const sablier: Record<string, SablierState> = {};
      for (const [appId, entry] of Object.entries(body.services)) {
        if (entry.sablier) sablier[appId] = entry.sablier;
      }
      set((state) => {
        const next = [...state.history, point];
        if (next.length > HISTORY_MAX) next.shift();
        return {
          services: body.services,
          sablier,
          machine: body.machine,
          online: true,
          history: next,
        };
      });
    } catch {
      set({ online: false });
    }
  },

  powerAction: async (appId, action) => {
    try {
      const response = await fetch(`/api/services/${appId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Tambo": "1" },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        set({
          actionError:
            body.error ?? `no se pudo ${action === "start" ? "encender" : "apagar"} la app`,
        });
        return;
      }
      set({ actionError: null });
      get().pushToast(action === "start" ? "App despertada" : "App apagada", "ok");
      // Notificación nativa del SO (si el usuario la permitió).
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          new Notification(action === "start" ? "App despertada" : "App apagada", {
            body: appId,
            icon: "/icon.svg",
            tag: `tambo-${appId}`,
          });
        } catch {}
      }
      // Badge en el icono de la app (PWA).
      if (typeof navigator !== "undefined" && "setAppBadge" in navigator) {
        const downCount = Object.values(get().health).filter((h) => h.status === "down").length;
        try {
          const nav = navigator as Navigator & {
            setAppBadge?: (n: number) => Promise<void>;
            clearAppBadge?: () => Promise<void>;
          };
          if (downCount > 0) void nav.setAppBadge?.(downCount);
          else void nav.clearAppBadge?.();
        } catch {}
      }
    } catch {
      set({ online: false });
      get().pushToast("Sin conexión con Tambo", "down");
      return;
    }
    void get().loadServices();
    // El arranque en frío tarda; se re-muestrea salud y unidades un rato.
    for (const delay of [4_000, 15_000, 40_000]) {
      setTimeout(() => {
        void useStore.getState().loadServices();
        void useStore.getState().loadHealth();
      }, delay);
    }
  },

  clearActionError: () => set({ actionError: null }),

  undo: () => {
    const { previousConfig, config } = get();
    if (!previousConfig) return;
    set({ config: previousConfig, previousConfig: config, canUndo: false });
    get().pushToast("Cambio deshecho", "info");
  },

  pushToast: (message, tone = "info") => {
    const id = Date.now() + Math.random();
    set((state) => ({ toasts: [...state.toasts, { id, message, tone }] }));
    setTimeout(() => {
      useStore.getState().dismissToast(id);
    }, 4_000);
  },
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  save: async (next) => {
    const { etag, config, configSource } = get();
    if (!config || !etag) {
      set({
        saveStatus: "error",
        saveError:
          configSource === "cache"
            ? "Sin conexión con Tambo: no se puede guardar ahora. El borrador se conserva en este panel."
            : "Sin configuración confirmada: recarga para poder guardar.",
      });
      return false;
    }
    set((state) => ({
      saving: true,
      saveStatus: "saving",
      saveError: null,
      config: next,
      previousConfig: state.config,
      canUndo: true,
    }));
    try {
      const response = await fetch("/api/config", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "If-Match": etag,
          "X-Tambo": "1",
        },
        body: JSON.stringify(next),
      });
      if (response.status === 412) {
        set({ saving: false, saveStatus: "error", conflict: true });
        return false;
      }
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        set({
          saving: false,
          canUndo: false,
          saveStatus: "error",
          saveError: body.error ?? `no se pudo guardar (error ${response.status})`,
          config,
        });
        return false;
      }
      const body = (await response.json()) as { etag: string };
      set({ saving: false, saveStatus: "saved", conflict: false, config: next, etag: body.etag });
      if (typeof BroadcastChannel !== "undefined") {
        try {
          const ch = new BroadcastChannel("tambo-sync");
          ch.postMessage("config-changed");
          ch.close();
        } catch {}
      }
      setTimeout(() => {
        if (useStore.getState().saveStatus === "saved") useStore.setState({ saveStatus: "idle" });
      }, 2_500);
      return true;
    } catch {
      // Red caída a mitad del guardado: nada se confirmó y no hay cola
      // silenciosa; el borrador vive en el formulario abierto.
      set({
        saving: false,
        canUndo: false,
        saveStatus: "error",
        online: false,
        saveError: "Tambo no responde: no se pudo guardar. El borrador se conserva en este panel.",
        config,
      });
      return false;
    }
  },

  setQuery: (query) => set({ query }),
  setQuickFilter: (quickFilter) => set({ quickFilter }),

  setEditing: (editing) => set({ editing, drawer: { mode: "closed" }, selectedApps: new Set() }),

  toggleSelectApp: (appId) =>
    set((state) => {
      const next = new Set(state.selectedApps);
      if (next.has(appId)) next.delete(appId);
      else next.add(appId);
      return { selectedApps: next };
    }),

  clearSelection: () => set({ selectedApps: new Set() }),

  batchPowerAction: async (action) => {
    const { selectedApps } = get();
    if (selectedApps.size === 0) return;
    const ids = [...selectedApps];
    await Promise.all(
      ids.map(async (appId) => {
        try {
          await fetch(`/api/services/${appId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Tambo": "1" },
            body: JSON.stringify({ action }),
          });
        } catch {}
      }),
    );
    get().pushToast(`${ids.length} apps ${action === "start" ? "despertadas" : "apagadas"}`, "ok");
    get().clearSelection();
    void get().loadServices();
  },

  openDrawer: (drawer) => set({ drawer }),

  closeDrawer: () => set({ drawer: { mode: "closed" } }),

  openDetails: (appId) => set({ details: { appId } }),

  toggleCollapse: (groupId) => {
    const collapsed = get().collapsed.includes(groupId)
      ? get().collapsed.filter((id) => id !== groupId)
      : [...get().collapsed, groupId];
    set({ collapsed });
    writeJson("tambo.collapsed", collapsed);
  },

  setTheme: (theme) => {
    set({ theme });
    writeJson("tambo.theme", theme);
  },

  setView: (view) => {
    set({ view });
    writeJson("tambo.view", view);
  },

  setShortcuts: (shortcuts) => {
    set({ shortcuts });
    writeJson("tambo.shortcuts", shortcuts);
  },

  resolveConflict: () => {
    set({ conflict: false });
    void get().load();
  },
}));
