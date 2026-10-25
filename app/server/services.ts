import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { TamboConfig } from "../src/schema";

const run = promisify(execFile);

export type ServiceAction = "start" | "stop";
export type ServiceEntry = {
  unit: string;
  state: string;
  cgroup?: string;
  memoryBytes?: number | null;
  cpuPercent?: number | null;
  // La unidad sirve a varias apps: sus métricas son del conjunto, no de
  // cada app, así que la interfaz no las atribuye individualmente.
  shared?: number;
};

/** Ejecuta systemctl --user contra el bus de la sesión del propietario. */
export async function systemctlUser(args: string[]): Promise<string> {
  const env = { ...process.env };
  env.XDG_RUNTIME_DIR ??= `/run/user/${process.getuid?.() ?? 1000}`;
  env.DBUS_SESSION_BUS_ADDRESS ??= `unix:path=${env.XDG_RUNTIME_DIR}/bus`;
  const { stdout } = await run("systemctl", ["--user", ...args], {
    env,
    timeout: 15_000,
  });
  return stdout;
}

/** Unidad declarada por una app en apps.json, o null. */
export function unitFor(config: TamboConfig | null, appId: string): string | null {
  if (!config) return null;
  for (const group of config.groups) {
    for (const app of group.apps) {
      if (app.id === appId) return app.service ?? null;
    }
  }
  return null;
}

async function unitInfo(unit: string): Promise<{ state: string; cgroup: string | null }> {
  try {
    const out = await systemctlUser([
      "show",
      unit,
      "--property=ActiveState,ControlGroup",
      "--value",
    ]);
    const [state = "unknown", cgroup = ""] = out.split("\n").map((line) => line.trim());
    return { state: state || "unknown", cgroup: cgroup || null };
  } catch {
    return { state: "unknown", cgroup: null };
  }
}

/** Estado por app; las unidades compartidas se consultan una sola vez. */
export async function servicesSnapshot(config: TamboConfig | null): Promise<{
  services: Record<string, ServiceEntry>;
}> {
  const services: Record<string, ServiceEntry> = {};
  if (!config) return { services };
  const cache = new Map<string, { state: string; cgroup: string | null }>();
  for (const group of config.groups) {
    for (const app of group.apps) {
      if (!app.service) continue;
      const info = cache.get(app.service) ?? (await unitInfo(app.service));
      cache.set(app.service, info);
      services[app.id] = {
        unit: app.service,
        state: info.state,
        ...(info.cgroup ? { cgroup: info.cgroup } : {}),
      };
    }
  }
  // Segunda pasada: cuántas apps comparten cada unidad.
  const perUnit = new Map<string, number>();
  for (const entry of Object.values(services)) {
    perUnit.set(entry.unit, (perUnit.get(entry.unit) ?? 0) + 1);
  }
  for (const entry of Object.values(services)) {
    const count = perUnit.get(entry.unit) ?? 1;
    if (count > 1) entry.shared = count;
  }
  return { services };
}

export async function runServiceAction(
  unit: string,
  action: ServiceAction,
): Promise<{ state: string }> {
  await systemctlUser([action, unit]);
  return { state: (await unitInfo(unit)).state };
}
