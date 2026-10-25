import { useState, type CSSProperties, type MouseEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Info, MoreHorizontal, Power } from "lucide-react";
import type { AppEntry, Group, GroupColor } from "../schema";
import { useStore, type ViewMode } from "../store";
import { envOf, statusVar, statusWord } from "../lib/format";
import { Cover } from "./Cover";
import { AppIdentity } from "./AppIdentity";

export type MenuPoint = { x: number; y: number };

export function AppCard({
  app,
  group,
  color,
  view,
  onOpenMenu,
  onOpenDetails,
}: {
  app: AppEntry;
  group: Group;
  color: GroupColor;
  view: ViewMode;
  onOpenMenu: (app: AppEntry, point: MenuPoint) => void;
  onOpenDetails: (appId: string) => void;
}) {
  const health = useStore((s) => s.health[app.id]);
  const service = useStore((s) => (app.service ? s.services[app.id] : undefined));
  const powerAction = useStore((s) => s.powerAction);
  const [powering, setPowering] = useState(false);
  const editing = useStore((s) => s.editing);
  const openIn = useStore((s) => s.config?.settings.openIn ?? "newTab");
  const sortable = useSortable({
    id: app.id,
    data: { type: "app", groupId: group.id },
    disabled: !editing,
  });

  const stop = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const onPower = async (event: MouseEvent) => {
    stop(event);
    if (powering) return;
    setPowering(true);
    try {
      await powerAction(app.id, service?.state === "active" ? "stop" : "start");
    } finally {
      setPowering(false);
    }
  };

  const env = envOf(app);
  const word = statusWord(health);

  // Botones hermanos del enlace, nunca anidados: la zona clicable grande la
  // da el ::after del enlace, y los botones viven por encima.
  const actions = (
    <div className="card-actions">
      {app.service && (
        <button
          type="button"
          className="card-action-btn"
          aria-label={service?.state === "active" ? `Apagar ${app.name}` : `Encender ${app.name}`}
          title={service?.state === "active" ? `Apagar ${app.name}` : `Encender ${app.name}`}
          disabled={powering}
          onClick={(event) => void onPower(event)}
        >
          <Power
            size={16}
            strokeWidth={1.75}
            style={service?.state === "active" ? { color: "var(--ok)" } : undefined}
          />
        </button>
      )}
      <button
        type="button"
        className="card-action-btn"
        aria-label={`Detalles de ${app.name}`}
        title={`Detalles de ${app.name}`}
        onClick={(event) => {
          stop(event);
          onOpenDetails(app.id);
        }}
      >
        <Info size={16} strokeWidth={1.75} />
      </button>
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
      {editing && (
        <button
          type="button"
          className="card-action-btn drag-handle"
          aria-label={`Arrastrar ${app.name}`}
          title="Arrastrar, o Espacio y flechas con teclado"
          onClick={stop}
          onContextMenu={stop}
          {...sortable.attributes}
          {...sortable.listeners}
        >
          <GripVertical size={16} strokeWidth={1.75} />
        </button>
      )}
    </div>
  );

  const linkProps = {
    className: "card-link",
    href: app.url,
    target: openIn === "newTab" ? ("_blank" as const) : undefined,
    rel: "noopener",
  };

  return (
    <div
      ref={sortable.setNodeRef}
      className={`card card-${view}${sortable.isDragging ? " is-dragging" : ""}`}
      style={
        {
          "--g": `var(--c-${color})`,
          transform: CSS.Transform.toString(sortable.transform),
          transition: sortable.transition,
        } as CSSProperties
      }
      data-down={health?.status === "down" ? "true" : undefined}
      onContextMenu={(event) => {
        if ((event.target as HTMLElement).closest("a, button")) return;
        event.preventDefault();
        onOpenMenu(app, { x: event.clientX, y: event.clientY });
      }}
    >
      {view === "compact" ? (
        <a {...linkProps}>
          <span className="compact-head">
            <AppIdentity app={app} color={color} size={38} radius={10} />
            <span className="card-name">{app.name}</span>
          </span>
          {app.description && <span className="card-desc">{app.description}</span>}
          {/* Pie común alineado al fondo: la descripción nunca lo desplaza. */}
          <span className="compact-foot">
            {env && (
              <span className="chip" data-tag={env}>
                {env}
              </span>
            )}
            <span className="status-inline" data-status={health?.status ?? "unknown"}>
              <span
                className="dot"
                style={{ "--status": statusVar(health) } as CSSProperties}
                aria-hidden="true"
              />
              {word}
            </span>
          </span>
        </a>
      ) : (
        <a {...linkProps}>
          <span className="card-cover">
            <Cover app={app} color={color} />
          </span>
          <span className="card-body">
            <span className="card-name">{app.name}</span>
            {app.description && <span className="card-desc">{app.description}</span>}
            <span className="card-foot">
              {env && (
                <span className="chip" data-tag={env}>
                  {env}
                </span>
              )}
              <span className="status-inline" data-status={health?.status ?? "unknown"}>
                <span
                  className="dot"
                  style={{ "--status": statusVar(health) } as CSSProperties}
                  aria-hidden="true"
                />
                {word}
              </span>
            </span>
          </span>
        </a>
      )}
      {actions}
    </div>
  );
}
