import type { AppEntry, Group } from "../schema";

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}+/gu, "");
}

/**
 * Coincidencia por subsecuencia: los caracteres aparecen en orden.
 * Ambos lados se normalizan: sin mayúsculas ni tildes.
 */
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

/**
 * Rango de coincidencia: menor es mejor.
 * 0 exacto en nombre, 1 prefijo de nombre, 2 palabra de nombre,
 * 3 subsecuencia en nombre, 4 campos secundarios.
 */
function rankApp(app: AppEntry, group: Group, query: string): number | null {
  const q = normalize(query.trim());
  if (!q) return null;
  const name = normalize(app.name);
  if (name === q) return 0;
  if (name.startsWith(q)) return 1;
  if (
    name
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
      .some((word) => word.startsWith(q))
  )
    return 2;
  if (subsequence(q, name)) return 3;
  const secondary = [app.description ?? "", app.tags.join(" "), group.name, hostOf(app.url)];
  if (secondary.some((target) => subsequence(q, target))) return 4;
  return null;
}

/** Coincidencia sin ranking, para validar y para las pruebas antiguas. */
export function appMatches(app: AppEntry, group: Group, query: string): boolean {
  return rankApp(app, group, query) !== null;
}

/**
 * Grupos con apps que coinciden, en orden guardado y con el mejor
 * resultado primero dentro de cada grupo. Los grupos sin resultados
 * desaparecen; el nombre del grupo sigue visible para desambiguar.
 */
export function filterGroups(groups: Group[], query: string): Group[] {
  const q = query.trim();
  if (!q) return groups;
  const result: Group[] = [];
  for (const group of groups) {
    const matched = group.apps
      .map((app) => ({ app, rank: rankApp(app, group, q) }))
      .filter((entry): entry is { app: AppEntry; rank: number } => entry.rank !== null)
      .sort((a, b) => a.rank - b.rank || 0)
      .map((entry) => entry.app);
    // Orden estable: entre iguales se conserva el orden guardado.
    if (matched.length > 0) result.push({ ...group, apps: stableByOriginal(group.apps, matched) });
  }
  return result;
}

/** Reordena `subset` según rank, desempatando por el orden original. */
function stableByOriginal(original: AppEntry[], ranked: AppEntry[]): AppEntry[] {
  const order = new Map(original.map((app, index) => [app.id, index]));
  const rankOf = new Map(ranked.map((app, index) => [app.id, index]));
  return [...ranked].sort((a, b) => {
    const ra = rankOf.get(a.id) ?? 0;
    const rb = rankOf.get(b.id) ?? 0;
    if (ra !== rb) return ra - rb;
    return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
  });
}

/** Primera app visible, para Enter en el buscador. */
export function firstMatch(groups: Group[]): AppEntry | null {
  for (const group of groups) {
    const app = group.apps[0];
    if (app) return app;
  }
  return null;
}
