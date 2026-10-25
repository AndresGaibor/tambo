import { useEffect, useState, type ChangeEvent } from "react";
import { Trash2, X } from "lucide-react";
import {
  GROUP_COLORS,
  configSchema,
  findApp,
  type AppEntry,
  type Cover,
  type Group,
  type GroupColor,
  type TamboConfig,
} from "../schema";
import { removeApp, removeGroup, uniqueId, upsertApp, upsertGroup } from "../lib/edit";
import { useStore } from "../store";

type AppForm = {
  name: string;
  url: string;
  description: string;
  tags: string;
  pinned: boolean;
  coverKind: Cover["kind"];
  coverValue: string;
  coverSrc: string;
  healthUrl: string;
  healthExpect: string;
  service: string;
};

type GroupForm = { name: string; color: GroupColor; icon: string };

const EMPTY_APP: AppForm = {
  name: "",
  url: "",
  description: "",
  tags: "",
  pinned: false,
  coverKind: "auto",
  coverValue: "",
  coverSrc: "",
  healthUrl: "",
  healthExpect: "",
  service: "",
};

function appToForm(app: AppEntry): AppForm {
  return {
    name: app.name,
    url: app.url,
    description: app.description ?? "",
    tags: app.tags.join(", "),
    pinned: app.pinned,
    coverKind: app.cover.kind,
    coverValue: app.cover.kind === "emoji" ? app.cover.value : "",
    coverSrc: app.cover.kind === "svg" || app.cover.kind === "image" ? app.cover.src : "",
    healthUrl: app.health?.url ?? "",
    healthExpect: !app.health?.expect
      ? ""
      : typeof app.health.expect === "number"
        ? String(app.health.expect)
        : `${app.health.expect[0]}-${app.health.expect[1]}`,
    service: app.service ?? "",
  };
}

function parseExpect(raw: string): number | [number, number] | null | undefined {
  const text = raw.trim();
  if (!text) return undefined;
  const range = /^(\d{3})\s*-\s*(\d{3})$/.exec(text);
  if (range) return [Number(range[1]), Number(range[2])];
  const code = /^(\d{3})$/.exec(text);
  if (code) return Number(code[1]);
  return null;
}

function nextColor(config: TamboConfig): GroupColor {
  const used = new Set(config.groups.map((group) => group.color));
  return GROUP_COLORS.find((color) => !used.has(color)) ?? "gold";
}

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.filter((part) => typeof part === "string").pop();
    if (typeof key === "string" && !errors[key]) errors[key] = issue.message;
  }
  return errors;
}

export function EditDrawer() {
  const drawer = useStore((s) => s.drawer);
  const config = useStore((s) => s.config);
  const saving = useStore((s) => s.saving);
  const conflict = useStore((s) => s.conflict);
  const saveError = useStore((s) => s.saveError);
  const closeDrawer = useStore((s) => s.closeDrawer);
  const save = useStore((s) => s.save);
  const resolveConflict = useStore((s) => s.resolveConflict);

  const [appForm, setAppForm] = useState<AppForm>(EMPTY_APP);
  const [groupForm, setGroupForm] = useState<GroupForm>({ name: "", color: "gold", icon: "" });
  const [groupId, setGroupId] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    setErrors({});
    setUploadError(null);
    if (drawer.mode === "app") {
      const found = drawer.appId && config ? findApp(config, drawer.appId) : null;
      setAppForm(found ? appToForm(found.app) : EMPTY_APP);
      setGroupId(drawer.groupId);
    } else if (drawer.mode === "group") {
      const group =
        drawer.groupId && config
          ? config.groups.find((candidate) => candidate.id === drawer.groupId)
          : null;
      setGroupForm(
        group
          ? { name: group.name, color: group.color, icon: group.icon ?? "" }
          : { name: "", color: config ? nextColor(config) : "gold", icon: "" },
      );
    }
  }, [drawer, config]);

  const setApp = (patch: Partial<AppForm>) => setAppForm((form) => ({ ...form, ...patch }));

  const buildApp = (): AppEntry | { errors: Record<string, string> } => {
    if (!config) return { errors: { name: "sin configuración" } };
    const existing = drawer.mode === "app" ? drawer.appId : null;
    const id = existing ?? uniqueId(config, appForm.name);
    const expect = parseExpect(appForm.healthExpect);
    if (expect === null)
      return { errors: { healthExpect: "usa un código (204) o un rango (200-399)" } };
    const cover: Cover | { errors: Record<string, string> } =
      appForm.coverKind === "emoji" && !appForm.coverValue.trim()
        ? { errors: { coverValue: "escribe un emoji" } }
        : appForm.coverKind === "svg" || appForm.coverKind === "image"
          ? appForm.coverSrc
            ? { kind: appForm.coverKind, src: appForm.coverSrc }
            : { errors: { coverSrc: "sube un archivo primero" } }
          : appForm.coverKind === "emoji"
            ? { kind: "emoji", value: appForm.coverValue.trim() }
            : appForm.coverKind === "shot"
              ? { kind: "shot" }
              : { kind: "auto" };
    if ("errors" in cover) return cover;
    const app: AppEntry = {
      id,
      name: appForm.name.trim(),
      url: appForm.url.trim(),
      tags: appForm.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 8),
      pinned: appForm.pinned,
      cover,
      ...(appForm.description.trim() ? { description: appForm.description.trim() } : {}),
      ...(appForm.healthUrl.trim()
        ? {
            health: {
              url: appForm.healthUrl.trim(),
              ...(expect !== undefined ? { expect } : {}),
            },
          }
        : {}),
      ...(appForm.service.trim() ? { service: appForm.service.trim() } : {}),
    };
    return app;
  };

  const submitApp = async () => {
    if (!config || drawer.mode !== "app") return;
    const app = buildApp();
    if ("errors" in app) {
      setErrors(app.errors);
      return;
    }
    const next = upsertApp(config, app, groupId);
    const check = configSchema.safeParse(next);
    if (!check.success) {
      setErrors(fieldErrors(check.error.issues));
      return;
    }
    const ok = await save(check.data);
    if (ok) closeDrawer();
  };

  const submitGroup = async () => {
    if (!config || drawer.mode !== "group") return;
    if (!groupForm.name.trim()) {
      setErrors({ name: "el nombre es obligatorio" });
      return;
    }
    const existing = drawer.groupId
      ? config.groups.find((candidate) => candidate.id === drawer.groupId)
      : null;
    const group: Group = {
      id: existing?.id ?? uniqueId(config, groupForm.name),
      name: groupForm.name.trim(),
      color: groupForm.color,
      ...(groupForm.icon.trim() ? { icon: groupForm.icon.trim() } : {}),
      apps: existing?.apps ?? [],
    };
    const next = upsertGroup(config, group);
    const check = configSchema.safeParse(next);
    if (!check.success) {
      setErrors(fieldErrors(check.error.issues));
      return;
    }
    const ok = await save(check.data);
    if (ok) closeDrawer();
  };

  const submit = () => (drawer.mode === "group" ? void submitGroup() : void submitApp());

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeDrawer();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        submit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const onUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploadError(null);
    try {
      const response = await fetch(`/api/assets?name=${encodeURIComponent(file.name)}`, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream", "X-Tambo": "1" },
        body: file,
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setUploadError(body.error ?? `error ${response.status}`);
        return;
      }
      const body = (await response.json()) as { src: string };
      const ext = body.src.split(".").pop();
      setApp({ coverSrc: body.src, coverKind: ext === "svg" ? "svg" : "image" });
    } catch {
      setUploadError("no se pudo subir el archivo");
    }
  };

  const remove = async () => {
    if (!config) return;
    if (drawer.mode === "app" && drawer.appId) {
      const ok = await save(removeApp(config, drawer.appId));
      if (ok) closeDrawer();
    } else if (drawer.mode === "group" && drawer.groupId) {
      const ok = await save(removeGroup(config, drawer.groupId));
      if (ok) closeDrawer();
    }
  };

  const isApp = drawer.mode === "app";
  const isNew =
    drawer.mode === "closed" ? true : drawer.mode === "app" ? !drawer.appId : !drawer.groupId;

  return (
    <>
      <div className="drawer-backdrop" onClick={closeDrawer} aria-hidden="true" />
      <aside className="drawer" role="dialog" aria-label={isApp ? "Editar app" : "Editar grupo"}>
        <header className="drawer-head">
          <h2 className="drawer-title">
            {isApp
              ? isNew
                ? "Agregar app"
                : "Editar app"
              : isNew
                ? "Agregar grupo"
                : "Editar grupo"}
          </h2>
          <button
            type="button"
            className="btn btn-icon btn-ghost"
            aria-label="Cerrar"
            onClick={closeDrawer}
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </header>
        <div className="drawer-body">
          {conflict && (
            <div className="drawer-conflict">
              La configuración cambió en el servidor mientras editabas.
              <button type="button" className="btn" onClick={resolveConflict}>
                Recargar
              </button>
            </div>
          )}
          {saveError && <div className="drawer-conflict">{saveError}</div>}
          {uploadError && <div className="drawer-conflict">{uploadError}</div>}

          {isApp ? (
            <>
              <div className="field">
                <label htmlFor="f-name">Nombre</label>
                <input
                  id="f-name"
                  value={appForm.name}
                  onChange={(e) => setApp({ name: e.target.value })}
                />
                {errors.name && <span className="field-error">{errors.name}</span>}
              </div>
              <div className="field">
                <label htmlFor="f-url">URL</label>
                <input
                  id="f-url"
                  placeholder="https://"
                  value={appForm.url}
                  onChange={(e) => setApp({ url: e.target.value })}
                />
                {errors.url && <span className="field-error">{errors.url}</span>}
              </div>
              <div className="field">
                <label htmlFor="f-desc">Descripción (opcional)</label>
                <textarea
                  id="f-desc"
                  rows={2}
                  maxLength={120}
                  value={appForm.description}
                  onChange={(e) => setApp({ description: e.target.value })}
                />
              </div>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="f-group">Grupo</label>
                  <select id="f-group" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                    {config?.groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="f-tags">Etiquetas (coma)</label>
                  <input
                    id="f-tags"
                    placeholder="dev, prod"
                    value={appForm.tags}
                    onChange={(e) => setApp({ tags: e.target.value })}
                  />
                </div>
              </div>
              <label
                className="field"
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <input
                  type="checkbox"
                  checked={appForm.pinned}
                  onChange={(e) => setApp({ pinned: e.target.checked })}
                />
                Anclada en la fila de anclados
              </label>
              <div className="field">
                <label>Portada</label>
                <div className="kind-row">
                  {(["auto", "emoji", "upload", "shot"] as const).map((kind) => {
                    const active =
                      kind === "upload"
                        ? appForm.coverKind === "svg" || appForm.coverKind === "image"
                        : appForm.coverKind === kind;
                    return (
                      <button
                        key={kind}
                        type="button"
                        className="kind-btn"
                        aria-pressed={active}
                        onClick={() =>
                          setApp({
                            coverKind:
                              kind === "upload"
                                ? "image"
                                : kind === "emoji"
                                  ? "emoji"
                                  : kind === "shot"
                                    ? "shot"
                                    : "auto",
                          })
                        }
                      >
                        {kind === "auto"
                          ? "Automática"
                          : kind === "emoji"
                            ? "Emoji"
                            : kind === "upload"
                              ? "SVG o imagen"
                              : "Captura"}
                      </button>
                    );
                  })}
                </div>
                {appForm.coverKind === "emoji" && (
                  <div className="field" style={{ marginTop: 8 }}>
                    <input
                      id="f-emoji"
                      placeholder="🛠️"
                      value={appForm.coverValue}
                      onChange={(e) => setApp({ coverValue: e.target.value })}
                    />
                    {errors.coverValue && <span className="field-error">{errors.coverValue}</span>}
                  </div>
                )}
                {(appForm.coverKind === "svg" || appForm.coverKind === "image") && (
                  <div className="field" style={{ marginTop: 8 }}>
                    <input
                      id="f-upload"
                      type="file"
                      accept=".svg,.png,.webp"
                      onChange={(e) => void onUpload(e)}
                    />
                    {appForm.coverSrc && (
                      <span className="field-error" style={{ color: "var(--text-muted)" }}>
                        {appForm.coverSrc}
                      </span>
                    )}
                    {errors.coverSrc && <span className="field-error">{errors.coverSrc}</span>}
                  </div>
                )}
              </div>
              <div className="field">
                <label htmlFor="f-health">URL de salud (opcional)</label>
                <input
                  id="f-health"
                  placeholder="http://127.0.0.1:3000"
                  value={appForm.healthUrl}
                  onChange={(e) => setApp({ healthUrl: e.target.value })}
                />
                {errors.health && <span className="field-error">{errors.health}</span>}
              </div>
              <div className="field">
                <label htmlFor="f-expect">Códigos esperados (opcional)</label>
                <input
                  id="f-expect"
                  placeholder="200-399 o 204"
                  value={appForm.healthExpect}
                  onChange={(e) => setApp({ healthExpect: e.target.value })}
                />
                {errors.healthExpect && <span className="field-error">{errors.healthExpect}</span>}
              </div>
              <div className="field">
                <label htmlFor="f-service">Unidad systemd (opcional)</label>
                <input
                  id="f-service"
                  placeholder="mi-app.service"
                  value={appForm.service}
                  onChange={(e) => setApp({ service: e.target.value })}
                />
                {errors.service && <span className="field-error">{errors.service}</span>}
              </div>
            </>
          ) : (
            <>
              <div className="field">
                <label htmlFor="g-name">Nombre</label>
                <input
                  id="g-name"
                  value={groupForm.name}
                  onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
                />
                {errors.name && <span className="field-error">{errors.name}</span>}
              </div>
              <div className="field">
                <label>Color</label>
                <div className="color-row">
                  {GROUP_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className="color-dot"
                      aria-pressed={groupForm.color === color}
                      aria-label={color}
                      title={color}
                      style={{ background: `var(--c-${color})` }}
                      onClick={() => setGroupForm({ ...groupForm, color })}
                    />
                  ))}
                </div>
              </div>
              <div className="field">
                <label htmlFor="g-icon">Icono (opcional)</label>
                <input
                  id="g-icon"
                  placeholder="lucide:leaf o un emoji"
                  value={groupForm.icon}
                  onChange={(e) => setGroupForm({ ...groupForm, icon: e.target.value })}
                />
                {errors.icon && <span className="field-error">{errors.icon}</span>}
              </div>
            </>
          )}
        </div>
        <footer className="drawer-foot">
          {!isNew && (
            <button type="button" className="btn btn-danger" onClick={() => void remove()}>
              <Trash2 size={15} strokeWidth={1.75} /> Eliminar
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" className="btn" onClick={closeDrawer}>
            Cancelar
          </button>
          <button type="button" className="btn btn-accent" disabled={saving} onClick={submit}>
            {saving ? "Guardando…" : "Guardar"} <kbd>⌘S</kbd>
          </button>
        </footer>
      </aside>
    </>
  );
}
