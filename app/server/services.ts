import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { TamboConfig } from "../src/schema";

const run = promisify(execFile);

export type ServiceAction = "start" | "stop";
export type ServiceEntry = { unit: string; state: string };

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

async function unitState(unit: string): Promise<string> {
  try {
    const out = await systemctlUser(["show", unit, "--property=ActiveState", "--value"]);
    return out.trim() || "unknown";
  } catch {
    return "unknown";
  }
}

/** Estado por app; las unidades compartidas se consultan una sola vez. */
export async function servicesSnapshot(config: TamboConfig | null): Promise<{
  services: Record<string, ServiceEntry>;
}> {
  const services: Record<string, ServiceEntry> = {};
  if (!config) return { services };
  const cache = new Map<string, string>();
  for (const group of config.groups) {
    for (const app of group.apps) {
      if (!app.service) continue;
      const state = cache.get(app.service) ?? (await unitState(app.service));
      cache.set(app.service, state);
      services[app.id] = { unit: app.service, state };
    }
  }
  return { services };
}

export async function runServiceAction(
  unit: string,
  action: ServiceAction,
): Promise<{ state: string }> {
  await systemctlUser([action, unit]);
  return { state: await unitState(unit) };
}
