import type { AppEntry, Group, TamboConfig } from "../schema";

/** Operaciones puras sobre la configuración: siempre devuelven un objeto nuevo. */

export function cloneConfig(config: TamboConfig): TamboConfig {
  return structuredClone(config);
}

function locate(config: TamboConfig, appId: string): { gi: number; ai: number } | null {
  for (let gi = 0; gi < config.groups.length; gi++) {
    const ai = config.groups[gi].apps.findIndex((app) => app.id === appId);
    if (ai >= 0) return { gi, ai };
  }
  return null;
}

/** Crea o reemplaza una app; si ya existía conserva su posición. */
export function upsertApp(config: TamboConfig, app: AppEntry, groupId: string): TamboConfig {
  const next = cloneConfig(config);
  const where = locate(next, app.id);
  if (where) next.groups[where.gi].apps.splice(where.ai, 1);
  const target = next.groups.find((group) => group.id === groupId) ?? next.groups[0];
  if (!target) return next;
  if (where && next.groups[where.gi]?.id === groupId) {
    target.apps.splice(Math.min(where.ai, target.apps.length), 0, app);
  } else {
    target.apps.push(app);
  }
  return next;
}

export function removeApp(config: TamboConfig, appId: string): TamboConfig {
  const next = cloneConfig(config);
  for (const group of next.groups) {
    group.apps = group.apps.filter((app) => app.id !== appId);
  }
  return next;
}

export function setPinned(config: TamboConfig, appId: string, pinned: boolean): TamboConfig {
  const next = cloneConfig(config);
  for (const group of next.groups) {
    for (const app of group.apps) {
      if (app.id === appId) app.pinned = pinned;
    }
  }
  return next;
}

/** Mueve una app dentro de su grupo o entre grupos. */
export function moveApp(
  config: TamboConfig,
  appId: string,
  toGroupId: string,
  toIndex: number,
): TamboConfig {
  const next = cloneConfig(config);
  const where = locate(next, appId);
  const target = next.groups.find((group) => group.id === toGroupId);
  if (!where || !target) return next;
  const [app] = next.groups[where.gi].apps.splice(where.ai, 1);
  target.apps.splice(Math.max(0, Math.min(toIndex, target.apps.length)), 0, app);
  return next;
}

export function moveGroup(config: TamboConfig, groupId: string, toIndex: number): TamboConfig {
  const next = cloneConfig(config);
  const from = next.groups.findIndex((group) => group.id === groupId);
  if (from < 0) return next;
  const [group] = next.groups.splice(from, 1);
  next.groups.splice(Math.max(0, Math.min(toIndex, next.groups.length)), 0, group);
  return next;
}

export function upsertGroup(config: TamboConfig, group: Group): TamboConfig {
  const next = cloneConfig(config);
  const at = next.groups.findIndex((candidate) => candidate.id === group.id);
  if (at >= 0) next.groups[at] = group;
  else next.groups.push(group);
  return next;
}

export function removeGroup(config: TamboConfig, groupId: string): TamboConfig {
  const next = cloneConfig(config);
  next.groups = next.groups.filter((group) => group.id !== groupId);
  return next;
}

/** Slug en minúsculas único en todo el archivo. */
export function uniqueId(config: TamboConfig, base: string): string {
  const taken = new Set<string>();
  for (const group of config.groups) {
    taken.add(group.id);
    for (const app of group.apps) taken.add(app.id);
  }
  const slug =
    base
      .normalize("NFD")
      .replace(/\p{M}+/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "app";
  if (!taken.has(slug)) return slug;
  let n = 2;
  while (taken.has(`${slug}-${n}`)) n++;
  return `${slug}-${n}`;
}
