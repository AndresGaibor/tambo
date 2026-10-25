import { create } from "zustand";
import type { HealthEntry } from "../server/health";
import type { ServiceEntry } from "../server/services";
import type { MachineStats } from "../server/stats";
import type { TamboConfig } from "./schema";

export type ThemeMode = "dark" | "light" | "system";

export type DrawerState =
  | { mode: "closed" }
  | { mode: "app"; appId: string | null; groupId: string }
  | { mode: "group"; groupId: string | null };

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage puede no estar disponible; el colapso no es crítico.
  }
}

function readThemeOverride(): ThemeMode | null {
  try {
    const raw = localStorage.getItem("tambo.theme");
    return raw === "dark" || raw === "light" || raw === "system" ? raw : null;
  } catch {
    return null;
  }
}

type TamboState = {
  config: TamboConfig | null;
  etag: string | null;
  health: Record<string, HealthEntry>;
  services: Record<string, ServiceEntry>;
  machine: MachineStats | null;
  online: boolean;
  loadError: string | null;
  saveError: string | null;
  actionError: string | null;
  saving: boolean;
  conflict: boolean;
  query: string;
  editing: boolean;
  drawer: DrawerState;
  collapsed: string[];
  theme: ThemeMode;

  applyConfig: (config: TamboConfig, etag: string) => void;
  load: () => Promise<void>;
  loadHealth: () => Promise<void>;
  loadServices: () => Promise<void>;
  powerAction: (appId: string, action: "start" | "stop") => Promise<void>;
  clearActionError: () => void;
  save: (next: TamboConfig) => Promise<boolean>;
  setQuery: (query: string) => void;
  setEditing: (editing: boolean) => void;
  openDrawer: (drawer: DrawerState) => void;
  closeDrawer: () => void;
  toggleCollapse: (groupId: string) => void;
  setTheme: (theme: ThemeMode) => void;
  resolveConflict: () => void;
};

export const useStore = create<TamboState>((set, get) => ({
  config: null,
  etag: null,
  health: {},
  services: {},
  machine: null,
  online: true,
  loadError: null,
  saveError: null,
  actionError: null,
  saving: false,
  conflict: false,
  query: "",
  editing: false,
  drawer: { mode: "closed" },
  collapsed: readJson<string[]>("tambo.collapsed", []),
  theme: readThemeOverride() ?? "system",

  applyConfig: (config, etag) => {
    const override = readThemeOverride();
    set({
      config,
      etag,
      theme: override ?? config.settings.theme,
      loadError: null,
    });
  },

  load: async () => {
    try {
      const response = await fetch("/api/config", { headers: { "Cache-Control": "no-cache" } });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        set({ online: true, loadError: body.error ?? `error ${response.status}` });
        return;
      }
      const etag = response.headers.get("ETag");
      const config = (await response.json()) as TamboConfig;
      set({ online: true });
      if (etag) get().applyConfig(config, etag);
    } catch {
      set({ online: false });
    }
  },

  loadHealth: async () => {
    try {
      const response = await fetch("/api/health");
      if (!response.ok) return;
      const health = (await response.json()) as Record<string, HealthEntry>;
      set({ health, online: true });
    } catch {
      set({ online: false });
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
      set({ services: body.services, machine: body.machine, online: true });
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
    } catch {
      set({ online: false });
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

  save: async (next) => {
    const { etag, config } = get();
    if (!config || !etag) return false;
    set({ saving: true, saveError: null, config: next });
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
        set({ saving: false, conflict: true });
        return false;
      }
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        set({
          saving: false,
          saveError: body.error ?? `no se pudo guardar (error ${response.status})`,
          config,
        });
        return false;
      }
      const body = (await response.json()) as { etag: string };
      set({ saving: false, conflict: false, config: next, etag: body.etag });
      return true;
    } catch {
      set({ saving: false, online: false, config });
      return false;
    }
  },

  setQuery: (query) => set({ query }),

  setEditing: (editing) => set({ editing, drawer: { mode: "closed" } }),

  openDrawer: (drawer) => set({ drawer }),

  closeDrawer: () => set({ drawer: { mode: "closed" } }),

  toggleCollapse: (groupId) => {
    const collapsed = get().collapsed.includes(groupId)
      ? get().collapsed.filter((id) => id !== groupId)
      : [...get().collapsed, groupId];
    set({ collapsed });
    writeJson("tambo.collapsed", collapsed);
  },

  setTheme: (theme) => {
    set({ theme });
    try {
      localStorage.setItem("tambo.theme", theme);
    } catch {
      // sin localStorage se aplica solo por esta sesión
    }
  },

  resolveConflict: () => {
    set({ conflict: false });
    void get().load();
  },
}));
