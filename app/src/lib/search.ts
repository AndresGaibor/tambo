import type { AppEntry, Group } from "../schema";

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}+/gu, "");
}

/** Coincidencia por subsecuencia: los caracteres aparecen en orden. */
export function subsequence(rawQuery: string, rawText: string): boolean {
  const query = normalize(rawQuery);
  if (!query) return true;
  let at = 0;
  for (const char of normalize(rawText)) {
    if (char === query[at]) at++;
    if (at === query.length) return true;
  }
  return at === query.length;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Busca por nombre, descripción, etiquetas, grupo y host. */
export function appMatches(app: AppEntry, group: Group, query: string): boolean {
  const q = normalize(query.trim());
  if (!q) return true;
  const targets = [
    app.name,
    app.description ?? "",
    app.tags.join(" "),
    group.name,
    hostOf(app.url),
  ];
  return targets.some((target) => subsequence(q, normalize(target)));
}

/** Grupos con apps que coinciden; los grupos sin resultados desaparecen. */
export function filterGroups(groups: Group[], query: string): Group[] {
  const q = query.trim();
  if (!q) return groups;
  return groups
    .map((group) => ({
      ...group,
      apps: group.apps.filter((app) => appMatches(app, group, q)),
    }))
    .filter((group) => group.apps.length > 0);
}

/** Primera app visible, para Enter en el buscador. */
export function firstMatch(groups: Group[]): AppEntry | null {
  for (const group of groups) {
    const app = group.apps[0];
    if (app) return app;
  }
  return null;
}
