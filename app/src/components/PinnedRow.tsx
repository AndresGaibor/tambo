import type { CSSProperties } from "react";
import { useStore } from "../store";
import { initialOf, statusText, statusVar } from "../lib/format";

export function PinnedRow() {
  const config = useStore((s) => s.config);
  const health = useStore((s) => s.health);
  if (!config) return null;

  const pinned = config.groups
    .flatMap((group) => group.apps.map((app) => ({ app, color: group.color })))
    .filter(({ app }) => app.pinned)
    .slice(0, 9);
  if (pinned.length === 0) return null;

  const openIn = config.settings.openIn;

  return (
    <div className="pinned">
      <span className="pinned-label">Anclados</span>
      <div className="pinned-row">
        {pinned.map(({ app, color }, index) => {
          const entry = health[app.id];
          return (
            <a
              key={app.id}
              className="pinned-card"
              style={{ "--g": `var(--c-${color})` } as CSSProperties}
              href={app.url}
              target={openIn === "newTab" ? "_blank" : undefined}
              rel="noopener"
              title={`${app.name} — atajo ${index + 1}`}
            >
              <span className="pinned-glyph">
                {app.cover.kind === "emoji" ? app.cover.value : initialOf(app.name)}
              </span>
              <span>{app.name}</span>
              <span
                className="dot"
                role="img"
                aria-label={statusText(entry)}
                title={statusText(entry)}
                style={{ "--status": statusVar(entry) } as CSSProperties}
              />
            </a>
          );
        })}
      </div>
    </div>
  );
}
