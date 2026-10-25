import { useEffect, useRef } from "react";
import { Copy, Info, Pencil, Pin, PinOff, Power, Trash2 } from "lucide-react";
import type { AppEntry } from "../schema";
import { findApp } from "../schema";
import { removeApp, setPinned } from "../lib/edit";
import { useStore } from "../store";

/** Menú contextual de una app. Accesible por teclado y sin depender del clic derecho. */
export function AppMenu({
  app,
  x,
  y,
  onClose,
}: {
  app: AppEntry;
  x: number;
  y: number;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const openerRef = useRef<Element | null>(null);
  const editing = useStore((s) => s.editing);

  // El control que abrió el menú se captura una sola vez: StrictMode y los
  // re-registros del oyente no deben recapturarlo con el foco ya dentro.
  useEffect(() => {
    if (!openerRef.current) openerRef.current = document.activeElement;
    const first = ref.current?.querySelector<HTMLButtonElement>("button");
    first?.focus();
  }, []);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.isComposing) {
        onClose();
        (openerRef.current as HTMLElement | null)?.focus?.();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const finish = () => {
    onClose();
    (openerRef.current as HTMLElement | null)?.focus?.();
  };

  const onCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(app.url);
    } catch {
      // sin permiso de portapapeles no hay nada más que hacer
    }
    finish();
  };

  const onTogglePin = () => {
    const { config, save } = useStore.getState();
    if (config) void save(setPinned(config, app.id, !app.pinned));
    finish();
  };

  const onEdit = () => {
    const { config, openDrawer } = useStore.getState();
    const found = config ? findApp(config, app.id) : null;
    if (found) openDrawer({ mode: "app", appId: app.id, groupId: found.group.id });
    finish();
  };

  const onRemove = () => {
    const { config, save } = useStore.getState();
    if (config) void save(removeApp(config, app.id));
    finish();
  };

  const onPower = () => {
    const { services, powerAction } = useStore.getState();
    const active = services[app.id]?.state === "active";
    if (app.service) void powerAction(app.id, active ? "stop" : "start");
    finish();
  };

  const onDetails = () => {
    useStore.getState().openDetails(app.id);
    finish();
  };

  const style = {
    left: Math.min(x, window.innerWidth - 210),
    top: Math.min(y, window.innerHeight - 190),
  };

  return (
    <div className="menu" role="menu" style={style} ref={ref}>
      <button type="button" className="menu-item" role="menuitem" onClick={() => void onCopyUrl()}>
        <Copy size={15} strokeWidth={1.75} /> Copiar URL
      </button>
      <button type="button" className="menu-item" role="menuitem" onClick={onDetails}>
        <Info size={15} strokeWidth={1.75} /> Detalles
      </button>
      <button type="button" className="menu-item" role="menuitem" onClick={onTogglePin}>
        {app.pinned ? (
          <PinOff size={15} strokeWidth={1.75} />
        ) : (
          <Pin size={15} strokeWidth={1.75} />
        )}
        {app.pinned ? "Desanclar" : "Anclar"}
      </button>
      {app.service && (
        <button type="button" className="menu-item" role="menuitem" onClick={onPower}>
          <Power size={15} strokeWidth={1.75} />
          {useStore.getState().services[app.id]?.state === "active" ? "Apagar" : "Encender"}
        </button>
      )}
      {editing && (
        <>
          <button type="button" className="menu-item" role="menuitem" onClick={onEdit}>
            <Pencil size={15} strokeWidth={1.75} /> Editar
          </button>
          <button
            type="button"
            className="menu-item"
            role="menuitem"
            data-danger="true"
            onClick={onRemove}
          >
            <Trash2 size={15} strokeWidth={1.75} /> Eliminar
          </button>
        </>
      )}
    </div>
  );
}
