import { useEffect, useState } from "react";
import { X, Keyboard } from "lucide-react";

const SHORTCUTS = [
  { keys: "/", desc: "Buscar apps" },
  { keys: "Cmd/Ctrl + K", desc: "Buscar apps" },
  { keys: "Esc", desc: "Cerrar panel o limpiar búsqueda" },
  { keys: "e", desc: "Activar/desactivar modo edición" },
  { keys: "t", desc: "Cambiar tema claro/oscuro" },
  { keys: "1-9", desc: "Abrir app anclada (en orden)" },
  { keys: "?", desc: "Mostrar esta ayuda" },
];

export function KeyboardHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      const target = event.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (typing) return;
      if (event.key === "?" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        setOpen((v) => !v);
      }
      if (event.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="modal-backdrop"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Atajos de teclado"
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>
            <Keyboard size={16} strokeWidth={1.75} /> Atajos de teclado
          </h2>
          <button
            type="button"
            className="btn btn-icon btn-ghost"
            aria-label="Cerrar"
            onClick={() => setOpen(false)}
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </header>
        <ul className="shortcut-list">
          {SHORTCUTS.map((s) => (
            <li key={s.keys}>
              <kbd>{s.keys}</kbd>
              <span>{s.desc}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
