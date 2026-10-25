import { useEffect, useRef } from "react";
import { Link2, Pencil, Pin, PinOff, Trash2 } from "lucide-react";
import type { AppEntry } from "../schema";
import { findApp } from "../schema";
import { removeApp, setPinned } from "../lib/edit";
import { useStore } from "../store";

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
  const editing = useStore((s) => s.editing);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const onCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(app.url);
    } catch {
      // sin permiso de portapapeles no hay nada más que hacer
    }
    onClose();
  };

  const onTogglePin = () => {
    const { config, save } = useStore.getState();
    if (config) void save(setPinned(config, app.id, !app.pinned));
    onClose();
  };

  const onEdit = () => {
    const { config, openDrawer } = useStore.getState();
    const found = config ? findApp(config, app.id) : null;
    if (found) openDrawer({ mode: "app", appId: app.id, groupId: found.group.id });
    onClose();
  };

  const onRemove = () => {
    const { config, save } = useStore.getState();
    if (config) void save(removeApp(config, app.id));
    onClose();
  };

  const style = {
    left: Math.min(x, window.innerWidth - 210),
    top: Math.min(y, window.innerHeight - 170),
  };

  return (
    <div className="menu" role="menu" style={style} ref={ref}>
      <button type="button" className="menu-item" role="menuitem" onClick={() => void onCopyUrl()}>
        <Link2 size={15} strokeWidth={1.75} /> Copiar URL
      </button>
      <button type="button" className="menu-item" role="menuitem" onClick={onTogglePin}>
        {app.pinned ? (
          <PinOff size={15} strokeWidth={1.75} />
        ) : (
          <Pin size={15} strokeWidth={1.75} />
        )}
        {app.pinned ? "Desanclar" : "Anclar"}
      </button>
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
