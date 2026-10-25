import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { useStore } from "../store";
import { configSchema } from "../schema";

/** Exportar e importar apps.json desde el portal. */
export function ConfigIO() {
  const config = useStore((s) => s.config);
  const save = useStore((s) => s.save);
  const pushToast = useStore((s) => s.pushToast);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onExport = () => {
    if (!config) return;
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "apps.json";
    a.click();
    URL.revokeObjectURL(url);
    pushToast("Configuración exportada", "ok");
  };

  const onImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const result = configSchema.safeParse(parsed);
      if (!result.success) {
        pushToast("El archivo no es una configuración válida", "down");
        return;
      }
      const ok = await save(result.data);
      if (ok) pushToast("Configuración importada", "ok");
      else pushToast("No se pudo guardar la configuración", "down");
    } catch {
      pushToast("Error al leer el archivo", "down");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="btn btn-icon btn-ghost"
        aria-label="Exportar configuración"
        title="Exportar apps.json"
        onClick={onExport}
        disabled={!config}
      >
        <Download size={15} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        className="btn btn-icon btn-ghost"
        aria-label="Importar configuración"
        title="Importar apps.json"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
      >
        <Upload size={15} strokeWidth={1.75} />
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        style={{ display: "none" }}
        onChange={(e) => void onImport(e)}
      />
    </>
  );
}
