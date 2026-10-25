import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { SablierState, ServiceEntry, TamboConfig } from "../src/schema";
import {
  SESSION_MINUTES,
  sablierAvailable,
  sablierExpiresAt,
  sablierInstance,
  sablierInstances,
  sablierStart,
} from "./sablier";

const run = promisify(execFile);

export type ServiceAction = "start" | "stop";

export type { SablierState, ServiceEntry };

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

/**
 * Una unidad está gestionada por Sablier si su fichero de usuario lleva la
 * sección [X-Sablier]. La lectura es best-effort: si el fichero no existe o
 * no se puede leer, la unidad no se considera gestionada.
 */
export async function managedBySablier(unit: string): Promise<boolean> {
  // La unidad ya viene con el sufijo .service: no se duplica.
  const name = unit.endsWith(".service") ? unit : `${unit}.service`;
  const file = join(homedir(), ".config", "systemd", "user", name);
  try {
    const content = await readFile(file, "utf8");
    return /^\s*\[X-Sablier\]/m.test(content);
  } catch {
    return false;
  }
}

/** Bloque de estado de Sablier para una unidad gestionada. */
async function sablierState(unit: string, sessionMinutes?: number): Promise<SablierState> {
  // La llamada abre el flujo de eventos si aún no está abierto: así el
  // cliente va teniendo la foto de las instancias sin esperar al primero.
  await sablierInstances();
  const instance = sablierInstance(unit);
  const expiresAt = sablierExpiresAt(unit);
  // systemd manda: si la unidad está parada, Sablier puede tener una foto
  // vieja (por ejemplo tras un apagado directo) y el estado real es parado.
  const running = await isActive(unit);
  const status = running ? (instance?.status ?? "ready") : "stopped";
  return {
    sessionActive: running && status === "ready",
    status,
    groups: instance?.groups ?? [],
    ...(expiresAt && running ? { expiresAt } : {}),
    managed: true,
    ...(sessionMinutes ? { sessionMinutes } : {}),
  };
}

/** ¿Está la unidad en marcha? */
async function isActive(unit: string): Promise<boolean> {
  try {
    const out = await systemctlUser(["is-active", unit]);
    return out.trim() === "active";
  } catch {
    return false;
  }
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
  const sablierCache = new Map<string, SablierState | undefined>();
  for (const group of config.groups) {
    for (const app of group.apps) {
      if (!app.service) continue;
      const info = cache.get(app.service) ?? (await unitInfo(app.service));
      cache.set(app.service, info);
      if (!sablierCache.has(app.service)) {
        sablierCache.set(
          app.service,
          (await managedBySablier(app.service))
            ? await sablierState(app.service, app.sessionMinutes)
            : undefined,
        );
      }
      const sablier = sablierCache.get(app.service);
      services[app.id] = {
        unit: app.service,
        state: info.state,
        ...(info.cgroup ? { cgroup: info.cgroup } : {}),
        ...(sablier ? { sablier } : {}),
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

/**
 * Enciende o apaga la unidad. "start" delega en Sablier cuando está
 * disponible: así la instancia queda en sesión y el auto-stop la devuelve a
 * cero sola tras la sesión. Sin Sablier se usa systemctl, como antes.
 *
 * "stop" va siempre por systemctl: Sablier no tiene endpoint de parada.
 */
export async function runServiceAction(
  unit: string,
  action: ServiceAction,
  sessionMinutes?: number,
): Promise<{ state: string; sablier?: SablierState }> {
  if (action === "start") {
    if (await sablierAvailable()) {
      const result = await sablierStart([unit], sessionMinutes ?? SESSION_MINUTES);
      if (result.ok) {
        // Sablier devuelve "ready" en cuanto acepta la sesión, pero systemd
        // puede tardar unos segundos en dejar la unidad en "active". Se sondea
        // brevemente para no reportar un falso "inactivo" justo después de
        // despertarla.
        const deadline = Date.now() + 20_000;
        while (Date.now() < deadline && !(await isActive(unit))) {
          await new Promise((resolve) => setTimeout(resolve, 1_000));
        }
        return {
          state: (await unitInfo(unit)).state,
          sablier: await sablierState(unit, sessionMinutes),
        };
      }
      // Sablier no pudo arrancar la instancia: se cae a systemctl para no
      // dejar la app sin botón funcional.
      await systemctlUser(["start", unit]);
      return { state: (await unitInfo(unit)).state };
    }
  }
  await systemctlUser([action, unit]);
  return { state: (await unitInfo(unit)).state };
}
