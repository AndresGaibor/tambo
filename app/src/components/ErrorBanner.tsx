import { X } from "lucide-react";
import { useStore } from "../store";
import { clockOf } from "../lib/format";

/** Bandera superior: errores de carga, desconexión y avisos de acción. */
export function ErrorBanner() {
  const loadError = useStore((s) => s.loadError);
  const load = useStore((s) => s.load);
  const actionError = useStore((s) => s.actionError);
  const clearActionError = useStore((s) => s.clearActionError);
  const online = useStore((s) => s.online);
  const configSource = useStore((s) => s.configSource);
  const lastSyncAt = useStore((s) => s.lastSyncAt);

  // Desconexión real (fallos de petición; navigator.onLine solo auxiliar):
  // se muestran los accesos guardados con la última sincronización.
  const offline = !online || configSource === "cache";

  if (loadError) {
    return (
      <div className="banner" role="alert">
        <span>No se pudo leer la configuración: {loadError}</span>
        <button type="button" className="btn" onClick={() => void load()}>
          Reintentar
        </button>
      </div>
    );
  }

  if (offline) {
    return (
      <div className="banner banner-offline" role="status">
        <span>
          Sin conexión con Tambo — se muestran los accesos guardados · última sincronización{" "}
          {clockOf(lastSyncAt)}
        </span>
        <button type="button" className="btn" onClick={() => void load()}>
          Reintentar
        </button>
      </div>
    );
  }

  if (actionError) {
    return (
      <div className="banner" role="status">
        <span>{actionError}</span>
        <button
          type="button"
          className="btn btn-icon btn-ghost"
          aria-label="Descartar"
          onClick={clearActionError}
        >
          <X size={14} strokeWidth={1.75} />
        </button>
      </div>
    );
  }

  return null;
}
