import { memo, useEffect, useState, type CSSProperties, type MouseEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Info, Loader2, MoreHorizontal, Cpu, HardDrive, Zap } from "lucide-react";
import type { AppEntry, Group, GroupColor } from "../schema";
import { sablierRemainingMs, sablierTone, sablierWord, useStore, type ViewMode } from "../store";
import { envOf, statusVar, statusWord, fmtBytes, fmtCpu } from "../lib/format";
import { highlight } from "../lib/highlight";
import { Cover } from "./Cover";
import { AppIdentity } from "./AppIdentity";

export type MenuPoint = { x: number; y: number };

function AppCardImpl({
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
  const query = useStore((s) => s.query);
  const powerAction = useStore((s) => s.powerAction);
  const [now, setNow] = useState(Date.now());
  const [waking, setWaking] = useState(false);
  const editing = useStore((s) => s.editing);
  const selectedApps = useStore((s) => s.selectedApps);
  const toggleSelectApp = useStore((s) => s.toggleSelectApp);
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

  const env = envOf(app);
  const sablier = service?.sablier;

  // Tick para la cuenta regresiva de la sesión de Sablier.
  useEffect(() => {
    if (!sablier?.sessionActive) return;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [sablier?.sessionActive, sablier?.expiresAt]);
  // Una app gestionada por Sablier y apagada no está caída: está dormida a
  // cero, así que el texto lo dice en vez de "Sin comprobar".
  const word = sablier && service?.state !== "active" ? sablierWord(sablier) : statusWord(health);
  const statusTone =
    sablier && service?.state !== "active" ? sablierTone(sablier) : statusVar(health);

  // Botones hermanos del enlace, nunca anidados: la zona clicable grande la
  // da el ::after del enlace, y los botones viven por encima.
  const actions = (
    <div className="card-actions">
      {editing && (
        <button
          type="button"
          className={`card-action-btn${selectedApps.has(app.id) ? " is-selected" : ""}`}
          aria-label={
            selectedApps.has(app.id) ? `Deseleccionar ${app.name}` : `Seleccionar ${app.name}`
          }
          aria-pressed={selectedApps.has(app.id)}
          onClick={(event) => {
            stop(event);
            toggleSelectApp(app.id);
          }}
        >
          <span className="select-dot" />
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

  const onLinkClick = async (event: MouseEvent) => {
    // Si la app está dormida por Sablier, la despertamos primero y luego
    // abrimos el enlace, para no mostrar una página caída.
    if (sablier && !sablier.sessionActive && app.service) {
      event.preventDefault();
      setWaking(true);
      try {
        await powerAction(app.id, "start");
        const healthUrl = app.health?.url ?? "";
        const wakeUrl = `/wake.html?name=${encodeURIComponent(app.name)}&url=${encodeURIComponent(app.url)}&health=${encodeURIComponent(healthUrl)}`;
        window.open(wakeUrl, "_blank", "noopener");
        setWaking(false);
      } catch {
        setWaking(false);
        window.open(app.url, openIn === "newTab" ? "_blank" : "_self", "noopener");
      }
    }
  };

  const linkProps = {
    className: "card-link",
    href: app.url,
    target: openIn === "newTab" ? ("_blank" as const) : undefined,
    rel: "noopener",
    onClick: (event: MouseEvent) => void onLinkClick(event),
    onMouseEnter: () => {
      // Prefetch de la app al pasar el cursor (solo enlaces http).
      if (app.url.startsWith("http")) {
        const link = document.createElement("link");
        link.rel = "prefetch";
        link.href = app.url;
        document.head.appendChild(link);
        setTimeout(() => link.remove(), 10_000);
      }
    },
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
            <AppIdentity app={app} color={color} size={32} radius={8} />
            <span className="card-name">{highlight(app.name, query)}</span>
          </span>
          {app.description && <span className="card-desc">{app.description}</span>}
          {/* Pie común alineado al fondo: la descripción nunca lo desplaza. */}
          <span className="compact-foot">
            {service && service.memoryBytes != null && !service.shared && (
              <span className="compact-resources" title="RAM y CPU de la unidad systemd">
                <span className="resource-item">
                  <HardDrive size={12} strokeWidth={1.75} />
                  {fmtBytes(service.memoryBytes)}
                </span>
                <span className="resource-sep" aria-hidden="true">
                  ·
                </span>
                <span className="resource-item">
                  <Cpu size={12} strokeWidth={1.75} />
                  {fmtCpu(service.cpuPercent)}%
                </span>
              </span>
            )}
            {service?.shared && (
              <span
                className="compact-resources shared"
                title={`Unidad ${app.service} compartida con ${service.shared} apps`}
              >
                <Cpu size={12} strokeWidth={1.75} />
                Compartida ({service.shared})
              </span>
            )}
            {env && (
              <span className="chip" data-tag={env}>
                {env}
              </span>
            )}
            {sablier && (
              <span
                className="chip chip-sablier"
                data-tone={sablier.sessionActive ? "on" : "off"}
                title={
                  sablier.sessionActive && sablier.expiresAt
                    ? `En sesión · ${Math.max(1, Math.ceil(sablierRemainingMs(sablier, now) / 60_000))} min restantes · Sablier escala a cero tras ${sablier.sessionMinutes ?? 30} min sin tráfico`
                    : "Sablier: escala a cero tras 30 min sin tráfico"
                }
                aria-label={`Estado Sablier: ${sablier.sessionActive ? "en sesión" : "dormida"}`}
              >
                <Zap size={11} strokeWidth={1.75} aria-hidden="true" />
                {sablier.sessionActive && sablierRemainingMs(sablier, now) > 0
                  ? "En sesión"
                  : sablierWord(sablier)}
              </span>
            )}
            <span className="status-inline" data-status={health?.status ?? "unknown"}>
              <span
                className="dot"
                style={{ "--status": statusTone } as CSSProperties}
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
            <span className="card-name">{highlight(app.name, query)}</span>
            {app.description && <span className="card-desc">{app.description}</span>}
            <span className="card-foot">
              {env && (
                <span className="chip" data-tag={env}>
                  {env}
                </span>
              )}
              {sablier && (
                <span
                  className="chip chip-sablier"
                  data-tone={sablier.sessionActive ? "on" : "off"}
                  title={
                    sablier.sessionActive && sablier.expiresAt
                      ? `En sesión · ${Math.max(1, Math.ceil(sablierRemainingMs(sablier, now) / 60_000))} min restantes · Sablier escala a cero tras ${sablier.sessionMinutes ?? 30} min sin tráfico`
                      : "Sablier: escala a cero tras 30 min sin tráfico"
                  }
                  aria-label={`Estado Sablier: ${sablier.sessionActive ? "en sesión" : "dormida"}`}
                >
                  <Zap size={11} strokeWidth={1.75} aria-hidden="true" />
                  {sablier.sessionActive && sablierRemainingMs(sablier, now) > 0
                    ? "En sesión"
                    : sablierWord(sablier)}
                </span>
              )}
              <span className="status-inline" data-status={health?.status ?? "unknown"}>
                <span
                  className="dot"
                  style={{ "--status": statusTone } as CSSProperties}
                  aria-hidden="true"
                />
                {word}
              </span>
            </span>
          </span>
        </a>
      )}
      {waking && (
        <div className="wake-screen" role="status" aria-live="polite">
          <div className="wake-card">
            <AppIdentity app={app} color={color} size={56} radius={14} />
            <h2 className="wake-title">{app.name}</h2>
            <p className="wake-status">
              <Loader2 size={16} strokeWidth={1.75} className="spin" />
              Despertando la instancia…
            </p>
            <div className="wake-progress">
              <div className="wake-progress-bar" />
            </div>
            <p className="wake-hint">Se abrirá automáticamente cuando esté lista.</p>
          </div>
        </div>
      )}
      {actions}
    </div>
  );
}

export const AppCard = memo(AppCardImpl);
