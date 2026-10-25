import { X } from "lucide-react";
import { useStore } from "../store";

export function ErrorBanner() {
  const loadError = useStore((s) => s.loadError);
  const load = useStore((s) => s.load);
  const actionError = useStore((s) => s.actionError);
  const clearActionError = useStore((s) => s.clearActionError);
  if (!loadError && !actionError) return null;
  return (
    <div className="banner" role={loadError ? "alert" : "status"}>
      {loadError ? (
        <>
          <span>No se pudo leer la configuración: {loadError}</span>
          <button type="button" className="btn" onClick={() => void load()}>
            Reintentar
          </button>
        </>
      ) : (
        <>
          <span>{actionError}</span>
          <button
            type="button"
            className="btn btn-icon btn-ghost"
            aria-label="Descartar"
            onClick={clearActionError}
          >
            <X size={14} strokeWidth={1.75} />
          </button>
        </>
      )}
    </div>
  );
}
