import type { CSSProperties } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, MoreHorizontal } from "lucide-react";
import type { AppEntry, Group, GroupColor } from "../schema";
import { useStore } from "../store";
import { hostOf, statusText, statusVar } from "../lib/format";
import { Cover } from "./Cover";

export type MenuPoint = { x: number; y: number };

export function AppCard({
  app,
  group,
  color,
  index,
  onOpenMenu,
}: {
  app: AppEntry;
  group: Group;
  color: GroupColor;
  index: number;
  onOpenMenu: (app: AppEntry, point: MenuPoint) => void;
}) {
  const health = useStore((s) => s.health[app.id]);
  const editing = useStore((s) => s.editing);
  const openIn = useStore((s) => s.config?.settings.openIn ?? "newTab");
  const sortable = useSortable({
    id: app.id,
    data: { type: "app", groupId: group.id },
    disabled: !editing,
  });

  const stop = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <a
      ref={sortable.setNodeRef}
      className={`card${sortable.isDragging ? " is-dragging" : ""}`}
      style={
        {
          "--g": `var(--c-${color})`,
          animationDelay: `${Math.min(index, 11) * 20}ms`,
          transform: CSS.Transform.toString(sortable.transform),
          transition: sortable.transition,
        } as CSSProperties
      }
      data-down={health?.status === "down" ? "true" : undefined}
      data-edit={editing ? "true" : undefined}
      href={app.url}
      target={openIn === "newTab" ? "_blank" : undefined}
      rel="noopener"
      onContextMenu={(event) => {
        event.preventDefault();
        onOpenMenu(app, { x: event.clientX, y: event.clientY });
      }}
    >
      <div className="card-cover">
        <Cover app={app} color={color} />
        <span
          className="dot card-dot"
          role="img"
          aria-label={statusText(health)}
          title={statusText(health)}
          style={{ "--status": statusVar(health) } as CSSProperties}
        />
      </div>
      <div className="card-body">
        <span className="card-name">{app.name}</span>
        {app.description && <span className="card-desc">{app.description}</span>}
        {health?.status === "down" && <span className="card-down-label">Sin respuesta</span>}
        <div className="card-foot">
          {app.tags.map((tag) => (
            <span key={tag} className="chip" data-tag={tag}>
              {tag}
            </span>
          ))}
          <span className="card-host">{hostOf(app.url)}</span>
        </div>
      </div>
      <div className="card-actions">
        {editing && (
          <button
            type="button"
            className="card-action-btn drag-handle"
            aria-label={`Arrastrar ${app.name}`}
            onClick={stop}
            onContextMenu={stop}
            {...sortable.attributes}
            {...sortable.listeners}
          >
            <GripVertical size={16} strokeWidth={1.75} />
          </button>
        )}
        <button
          type="button"
          className="card-action-btn"
          aria-label={`Menú de ${app.name}`}
          onClick={(event) => {
            stop(event);
            const rect = event.currentTarget.getBoundingClientRect();
            onOpenMenu(app, { x: rect.left, y: rect.bottom + 6 });
          }}
        >
          <MoreHorizontal size={16} strokeWidth={1.75} />
        </button>
      </div>
    </a>
  );
}
