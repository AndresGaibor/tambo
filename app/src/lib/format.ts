export type { HealthEntry, HealthStatus } from "../../server/health";
import type { HealthEntry } from "../../server/health";
import type { AppEntry, Settings } from "../schema";

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function statusVar(entry: HealthEntry | undefined): string {
  if (entry?.status === "up")
    return entry.ms !== undefined && entry.ms >= 1000 ? "var(--warn)" : "var(--ok)";
  if (entry?.status === "down") return "var(--down)";
  return "var(--unknown)";
}

function relative(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.round(minutes / 60)} h`;
}

function since(entry: HealthEntry, now: number): number {
  return entry.checkedAt ? now - Date.parse(entry.checkedAt) : 0;
}

/** Texto de estado para tooltip y atributo accesible. */
export function statusText(entry: HealthEntry | undefined, now = Date.now()): string {
  if (!entry || entry.status === "unknown") return "Estado desconocido";
  if (entry.status === "down") {
    return `Sin respuesta desde hace ${relative(since(entry, now))}`;
  }
  const slow = entry.ms !== undefined && entry.ms >= 1000;
  const head = slow ? "Lenta" : "Activa";
  const ms = entry.ms !== undefined ? `, ${entry.ms} ms` : "";
  return `${head}${ms}, hace ${relative(since(entry, now))}`;
}

/** Inicial del nombre para portadas y anclados. */
export function initialOf(name: string): string {
  const [first] = Array.from(name.trim());
  return (first ?? "?").toUpperCase();
}

/** 3313725440 -> "3.1 GB"; 314572800 -> "300 MB" */
export function fmtBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/** Porcentaje de CPU legible; sin dato aún, guion. */
export function fmtCpu(percent: number | null | undefined): string {
  if (percent == null || Number.isNaN(percent)) return "—";
  return String(percent < 10 ? Math.round(percent * 10) / 10 : Math.round(percent));
}

/** Abre una app según settings.openIn. Cmd o Ctrl con clic abre pestaña nueva. */
export function openApp(app: AppEntry, openIn: Settings["openIn"]): void {
  if (openIn === "sameWindow") {
    window.location.href = app.url;
  } else {
    window.open(app.url, "_blank", "noopener");
  }
}
