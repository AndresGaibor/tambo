import { useState, type CSSProperties } from "react";
import { MoreHorizontal, Zap } from "lucide-react";
import { useStore } from "../store";
import { statusText, statusVar } from "../lib/format";
import { AppIdentity } from "./AppIdentity";
import type { MenuPoint } from "./AppCard";
import type { AppEntry } from "../schema";

/** Fila de anclados: enlaces reales con acciones reales, nunca anidadas. */
export function PinnedRow({
  onOpenMenu,
}: {
  onOpenMenu: (app: AppEntry, point: MenuPoint) => void;
}) {
  const config = useStore((s) => s.config);
  const health = useStore((s) => s.health);
  const services = useStore((s) => s.services);
  const openIn = config?.settings.openIn ?? "newTab";
  const [menuFor, setMenuFor] = useState<string | null>(null);
  if (!config) return null;

  const pinned = config.groups
    .flatMap((group) => group.apps.map((app) => ({ app, group })))
    .filter(({ app }) => app.pinned)
    .slice(0, 9);
  if (pinned.length === 0) return null;

  return (
    <div className="pinned">
      <span className="pinned-label">Anclados</span>
      <div className="pinned-row">
        {pinned.map(({ app, group }) => {
          const entry = health[app.id];
          return (
            <span key={app.id} className="pinned-item">
              <a
                className="pinned-card"
                style={{ "--g": `var(--c-${group.color})` } as CSSProperties}
                href={app.url}
                target={openIn === "newTab" ? "_blank" : undefined}
                rel="noopener"
                title={`${app.name} — ${group.name}`}
              >
                <AppIdentity app={app} color={group.color} size={22} radius={6} />
                <span className="pinned-text">
                  <span className="pinned-name">{app.name}</span>
                  <span className="pinned-group">{group.name}</span>
                  {services[app.id]?.sablier && !services[app.id]?.sablier?.sessionActive && (
                    <span className="pinned-sablier" title="Dormida a cero por Sablier">
                      <Zap size={10} strokeWidth={1.75} aria-hidden="true" /> Dormida
                    </span>
                  )}
                </span>
                <span
                  className="dot"
                  role="img"
                  aria-label={statusText(entry)}
                  title={statusText(entry)}
                  style={{ "--status": statusVar(entry) } as CSSProperties}
                />
              </a>
              <button
                type="button"
                className="pinned-menu"
                aria-label={`Menú de ${app.name}`}
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  onOpenMenu(app, { x: rect.left, y: rect.bottom + 6 });
                  setMenuFor(app.id);
                }}
                data-open={menuFor === app.id ? "true" : undefined}
              >
                <MoreHorizontal size={14} strokeWidth={1.75} />
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}
