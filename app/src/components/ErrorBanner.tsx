import { useStore } from "../store";

export function ErrorBanner() {
  const loadError = useStore((s) => s.loadError);
  const load = useStore((s) => s.load);
  if (!loadError) return null;
  return (
    <div className="banner" role="alert">
      <span>No se pudo leer la configuración: {loadError}</span>
      <button type="button" className="btn" onClick={() => void load()}>
        Reintentar
      </button>
    </div>
  );
}
