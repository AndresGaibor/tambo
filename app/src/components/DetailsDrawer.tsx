import { useEffect, useRef, useState } from "react";
import { Copy, Power, X } from "lucide-react";
import type { CSSProperties } from "react";
import { findApp } from "../schema";
import { useStore } from "../store";
import { clockOf, fmtBytes, fmtCpu, statusText, statusVar } from "../lib/format";
import { AppIdentity } from "./AppIdentity";

/**
 * Panel de detalles técnicos: URL completa, unidad systemd, recursos y
 * estado con su última comprobación. Los recursos de una unidad compartida
 * no se atribuyen a cada app: se explica qué abarcan.
 */
export function DetailsDrawer() {
  const details = useStore((s) => s.details);
  const config = useStore((s) => s.config);
  const health = useStore((s) => s.health);
  const services = useStore((s) => s.services);
  const healthUpdatedAt = useStore((s) => s.healthUpdatedAt);
  const close = useStore((s) => s.openDetails);
  const powerAction = useStore((s) => s.powerAction);
  const closeDrawer = useStore((s) => s.closeDrawer);
  const ref = useRef<HTMLElement>(null);
  const openerRef = useRef<Element | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!details.appId) return;
    openerRef.current = document.activeElement;
    requestAnimationFrame(() => ref.current?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.isComposing) {
        close(null);
        (openerRef.current as HTMLElement | null)?.focus?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [details.appId, close]);

  if (!details.appId) return null;
  const found = config ? findApp(config, details.appId) : null;
  if (!found) return null;
  const { app, group } = found;
  const entry = health[app.id];
  const service = services[app.id];
  const hasOwnMetrics = !!service && service.memoryBytes != null && !service.shared;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(app.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1_500);
    } catch {
      // sin permiso de portapapeles no hay nada más que hacer
    }
  };

  return (
    <>
      <div
        className="drawer-backdrop"
        onClick={() => {
          close(null);
          (openerRef.current as HTMLElement | null)?.focus?.();
        }}
        aria-hidden="true"
      />
      <aside
        className="drawer"
        role="dialog"
        aria-label={`Detalles de ${app.name}`}
        tabIndex={-1}
        ref={ref}
      >
        <header className="drawer-head">
          <AppIdentity app={app} color={group.color} size={32} radius={8} />
          <h2 className="drawer-title">{app.name}</h2>
          <button
            type="button"
            className="btn btn-icon btn-ghost"
            aria-label="Cerrar detalles"
            onClick={() => {
              close(null);
              (openerRef.current as HTMLElement | null)?.focus?.();
            }}
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </header>
        <div className="drawer-body">
          <p className="details-status">
            <span
              className="dot"
              style={{ "--status": statusVar(entry) } as CSSProperties}
              aria-hidden="true"
            />
            {statusText(entry)}
          </p>
          <p className="details-note">Última comprobación: {clockOf(healthUpdatedAt)}.</p>

          <div className="field">
            <label htmlFor="d-url">URL</label>
            <div className="details-row">
              <input id="d-url" readOnly value={app.url} className="details-mono" />
              <button
                type="button"
                className="btn btn-icon"
                aria-label="Copiar URL"
                onClick={() => void copy()}
              >
                <Copy size={15} strokeWidth={1.75} />
              </button>
            </div>
            {copied && (
              <span className="field-error" style={{ color: "var(--text-muted)" }}>
                Copiada
              </span>
            )}
          </div>

          <div className="field">
            <label>Grupo</label>
            <p className="details-value">{group.name}</p>
          </div>

          {app.service ? (
            <div className="field">
              <label>Unidad systemd</label>
              <p className="details-value details-mono">{app.service}</p>
              <p className="details-value details-mono details-muted">
                Estado: {service?.state ?? "desconocido"}
              </p>
            </div>
          ) : (
            <div className="field">
              <label>Recursos</label>
              <p className="details-value details-muted">
                No disponible: la app no declara unidad systemd.
              </p>
            </div>
          )}

          <div className="field">
            <label>Recursos (RAM y CPU)</label>
            {hasOwnMetrics && service ? (
              <dl className="server-pop-grid">
                <dt>RAM</dt>
                <dd>
                  {fmtBytes(service.memoryBytes ?? 0)} (memoria anónima del cgroup de la unidad)
                </dd>
                <dt>CPU</dt>
                <dd>
                  {fmtCpu(service.cpuPercent)}% del total de la VM (4 núcleos), promediado entre
                  muestreos de 15 s
                </dd>
              </dl>
            ) : service?.shared ? (
              <p className="details-value details-muted">
                No disponible por app: la unidad <code>{app.service}</code> sirve a {service.shared}{" "}
                apps y sus contadores son del conjunto. El total aparece en Servidor OCI, en el
                encabezado.
              </p>
            ) : (
              <p className="details-value details-muted">No disponible.</p>
            )}
          </div>

          {app.service && (
            <button
              type="button"
              className="btn"
              onClick={() =>
                void powerAction(app.id, service?.state === "active" ? "stop" : "start")
              }
            >
              <Power size={15} strokeWidth={1.75} />
              {service?.state === "active" ? "Apagar" : "Encender"}
            </button>
          )}
          <button type="button" className="btn" onClick={closeDrawer}>
            Cerrar
          </button>
        </div>
      </aside>
    </>
  );
}
