import { Plus } from "lucide-react";
import { Logo } from "./Logo";
import { useStore } from "../store";

const EXAMPLE = `{
  "version": 1,
  "settings": { "theme": "system", "openIn": "newTab", "healthIntervalSec": 30 },
  "groups": [
    {
      "id": "elcaliz",
      "name": "El Cáliz",
      "color": "gold",
      "apps": [
        {
          "id": "elcaliz-erp",
          "name": "ERP",
          "url": "https://erp.elcaliz.lab.andresgaibor.com",
          "tags": ["dev"],
          "pinned": true,
          "cover": { "kind": "auto" },
          "health": { "url": "http://127.0.0.1:15173" }
        }
      ]
    }
  ]
}`;

export function EmptyState() {
  const setEditing = useStore((s) => s.setEditing);
  const openDrawer = useStore((s) => s.openDrawer);

  return (
    <div className="empty">
      <Logo size={64} />
      <p>
        Aún no hay apps. Agrega la primera o edita <code>data/apps.json</code> a mano; la página se
        actualiza sola al guardar.
      </p>
      <button
        type="button"
        className="btn btn-accent"
        onClick={() => {
          setEditing(true);
          openDrawer({ mode: "group", groupId: null });
        }}
      >
        <Plus size={15} strokeWidth={1.75} /> Agregar la primera app
      </button>
      <pre>{EXAMPLE}</pre>
    </div>
  );
}
