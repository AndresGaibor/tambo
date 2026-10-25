import { useEffect, useRef, useState, useMemo } from "react";
import { Copy, Power, X, HardDrive, Cpu, Users, Calculator } from "lucide-react";
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

  // Calcular desglose estimado para unidades compartidas
  const sharedBreakdown = useMemo(() => {
    if (!service?.shared || service.shared <= 1 || !service.memoryBytes) return null;
    const count = service.shared;
    const memPerApp = Math.round(service.memoryBytes / count);
    const cpuPerApp = service.cpuPercent ? service.cpuPercent / count : 0;
    // Buscar qué apps comparten esta unidad
    const sharedApps =
      config?.groups.flatMap((g) => g.apps).filter((a) => a.service === app.service) ?? [];
    return {
      count,
      totalMem: service.memoryBytes,
      totalCpu: service.cpuPercent ?? 0,
      memPerApp,
      cpuPerApp,
      sharedApps: sharedApps.map((a) => a.name),
    };
  }, [service, config]);

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
                  <div className="resource-row">
                    <HardDrive size={14} strokeWidth={1.75} />
                    <span>{fmtBytes(service.memoryBytes ?? 0)}</span>
                    <span className="resource-hint">memoria anónima del cgroup</span>
                  </div>
                </dd>
                <dt>CPU</dt>
                <dd>
                  <div className="resource-row">
                    <Cpu size={14} strokeWidth={1.75} />
                    <span>{fmtCpu(service.cpuPercent)}%</span>
                    <span className="resource-hint">del total de la VM (4 núcleos)</span>
                  </div>
                </dd>
              </dl>
            ) : service?.shared ? (
              <>
                <p className="details-value details-muted">
                  No disponible por app: la unidad <code>{app.service}</code> sirve a{" "}
                  {service.shared} apps y sus contadores son del conjunto. El total aparece en
                  Servidor OCI, en el encabezado.
                </p>
                {sharedBreakdown && (
                  <details className="shared-breakdown" open>
                    <summary>
                      <Users size={14} strokeWidth={1.75} />
                      Desglose estimado por app ({sharedBreakdown.count} apps)
                      <Calculator size={13} strokeWidth={1.75} />
                    </summary>
                    <dl className="shared-breakdown-grid">
                      <dt>Total unidad</dt>
                      <dd className="total-row">
                        <span>
                          <HardDrive size={13} strokeWidth={1.5} />
                          {fmtBytes(sharedBreakdown.totalMem)}
                        </span>
                        <span>
                          <Cpu size={13} strokeWidth={1.5} />
                          {sharedBreakdown.totalCpu > 0
                            ? fmtCpu(sharedBreakdown.totalCpu) + "%"
                            : "—"}
                        </span>
                      </dd>
                      <dt>Por app (reparto equitativo estimado)</dt>
                      <dd className="per-app-row">
                        <span>
                          <HardDrive size={13} strokeWidth={1.5} />
                          {fmtBytes(sharedBreakdown.memPerApp)} c/u
                        </span>
                        <span>
                          <Cpu size={13} strokeWidth={1.5} />
                          {sharedBreakdown.cpuPerApp > 0
                            ? fmtCpu(sharedBreakdown.cpuPerApp) + "% c/u"
                            : "—"}
                        </span>
                      </dd>
                      <dt>Apps en esta unidad</dt>
                      <dd className="apps-list">
                        {sharedBreakdown.sharedApps.map((name, i) => (
                          <span key={i} className="app-tag">
                            {name}
                          </span>
                        ))}
                      </dd>
                    </dl>
                    <p className="breakdown-note">
                      <em>Nota:</em> Los cgroups no distinguen entre procesos de distintas apps en
                      la misma unidad. El reparto equitativo es una estimación; el consumo real
                      puede variar según la carga de cada app.
                    </p>
                  </details>
                )}
              </>
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
