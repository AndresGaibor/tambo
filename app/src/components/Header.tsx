import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  LayoutGrid,
  Monitor,
  Moon,
  Pencil,
  Rows3,
  Search,
  Server,
  Sun,
  X,
} from "lucide-react";
import { Logo } from "./Logo";
import { useStore, type ViewMode } from "../store";
import { flattenApps } from "../schema";
import { filterGroups, firstMatch } from "../lib/search";
import { agoOf, clockOf, fmtBytes, fmtCpu, openApp } from "../lib/format";

function SearchBar() {
  const query = useStore((s) => s.query);
  const setQuery = useStore((s) => s.setQuery);
  const config = useStore((s) => s.config);
  const filtered = useMemo(() => filterGroups(config?.groups ?? [], query), [config, query]);
  const isMac = useMemo(
    () => /mac|iphone|ipad/i.test(navigator.platform ?? navigator.userAgent),
    [],
  );

  return (
    <div className="search">
      <span className="search-icon">
        <Search size={16} strokeWidth={1.75} />
      </span>
      <input
        data-search-input
        type="text"
        placeholder="Buscar aplicaciones…"
        aria-label="Buscar aplicaciones"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Enter") {
            const app = firstMatch(filtered);
            const openIn = useStore.getState().config?.settings.openIn ?? "newTab";
            if (app) openApp(app, openIn);
          }
          if (event.key === "Escape") {
            if (query) setQuery("");
            else event.currentTarget.blur();
          }
        }}
      />
      {query ? (
        <button
          type="button"
          className="search-clear"
          aria-label="Limpiar búsqueda"
          onClick={() => setQuery("")}
        >
          <X size={14} strokeWidth={1.75} />
        </button>
      ) : (
        <kbd className="search-hint" aria-hidden="true">
          {isMac ? "⌘K" : "Ctrl K"}
        </kbd>
      )}
    </div>
  );
}

function ThemeButton() {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const label = theme === "system" ? "Sistema" : theme === "dark" ? "Oscuro" : "Claro";
  return (
    <button
      type="button"
      className="btn btn-ghost theme-btn"
      onClick={() => setTheme(theme === "system" ? "light" : theme === "light" ? "dark" : "system")}
      aria-label={`Tema: ${label}. Activar cambia al siguiente tema`}
      title={`Tema: ${label}`}
    >
      {theme === "system" ? (
        <Monitor size={16} strokeWidth={1.75} />
      ) : theme === "dark" ? (
        <Moon size={16} strokeWidth={1.75} />
      ) : (
        <Sun size={16} strokeWidth={1.75} />
      )}
      <span className="btn-text">Tema: {label}</span>
    </button>
  );
}

function ViewButton() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (
        !ref.current?.contains(event.target as Node) &&
        !anchorRef.current?.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.isComposing) {
        setOpen(false);
        anchorRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (mode: ViewMode) => {
    setView(mode);
    setOpen(false);
    anchorRef.current?.focus();
  };

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost theme-btn"
        ref={anchorRef}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Vista: ${view === "compact" ? "Compacta" : "Portadas"}. Cambiar`}
        title="Cambiar la vista de las tarjetas"
        onClick={() => setOpen((value) => !value)}
      >
        {view === "compact" ? (
          <LayoutGrid size={16} strokeWidth={1.75} />
        ) : (
          <Rows3 size={16} strokeWidth={1.75} />
        )}
        <span className="btn-text">Vista</span>
        <ChevronDown size={14} strokeWidth={1.75} className="chevron" />
      </button>
      {open && (
        <div className="menu view-pop" role="menu" aria-label="Vista" ref={ref}>
          <button
            type="button"
            className="menu-item"
            role="menuitemradio"
            aria-checked={view === "compact"}
            onClick={() => pick("compact")}
          >
            <LayoutGrid size={15} strokeWidth={1.75} /> Compacta
            {view === "compact" && (
              <span className="view-check" aria-hidden="true">
                ✓
              </span>
            )}
          </button>
          <button
            type="button"
            className="menu-item"
            role="menuitemradio"
            aria-checked={view === "covers"}
            onClick={() => pick("covers")}
          >
            <Rows3 size={15} strokeWidth={1.75} /> Portadas
            {view === "covers" && (
              <span className="view-check" aria-hidden="true">
                ✓
              </span>
            )}
          </button>
        </div>
      )}
    </>
  );
}

function MachinePanel({
  onClose,
  anchorRef,
}: {
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const machine = useStore((s) => s.machine);
  const services = useStore((s) => s.services);
  const healthUpdatedAt = useStore((s) => s.healthUpdatedAt);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (
        !ref.current?.contains(event.target as Node) &&
        !anchorRef.current?.contains(event.target as Node)
      ) {
        onClose();
      }
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
  }, [onClose, anchorRef]);

  // Origen real de las cifras: la VM oci (systemd y cgroups del host),
  // nunca el Mac del usuario.
  const unidades = Object.values(services).filter((entry) => entry.memoryBytes != null);
  const compartidas = unidades.filter((entry) => (entry.shared ?? 1) > 1).length;

  return (
    <div className="menu server-pop" role="dialog" aria-label="Recursos del servidor" ref={ref}>
      <p className="server-pop-title">Servidor OCI</p>
      {machine ? (
        <>
          <dl className="server-pop-grid">
            <dt>CPU</dt>
            <dd>
              {fmtCpu(machine.cpuPercent)}% de {machine.cores} núcleos
            </dd>
            <dt>RAM</dt>
            <dd>
              {fmtBytes(machine.memoryUsedBytes)} de {fmtBytes(machine.memoryTotalBytes)}
            </dd>
            <dt>Carga</dt>
            <dd>{machine.load1.toFixed(2)}</dd>
          </dl>
          <p className="server-pop-note">
            CPU: porcentaje del total de la máquina ({machine.cores} núcleos), medido por delta
            entre muestreos de 15 s. RAM: memoria usada del total. Origen: contadores de systemd y
            cgroups del host de la VM; no incluye el MacBook. Actualizado {agoOf(healthUpdatedAt)} (
            {clockOf(healthUpdatedAt)}).
          </p>
          {compartidas > 0 && (
            <p className="server-pop-note">
              {compartidas} unidad(es) sirven a varias apps: su memoria y CPU son del conjunto y no
              se atribuyen a cada app individual.
            </p>
          )}
        </>
      ) : (
        <p className="server-pop-note">Sin datos del servidor todavía.</p>
      )}
    </div>
  );
}

function MachineButton() {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        type="button"
        className="btn btn-ghost theme-btn machine-btn"
        ref={anchorRef}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
        title="Recursos del servidor OCI"
      >
        <Server size={16} strokeWidth={1.75} />
        <span className="btn-text">Servidor OCI</span>
      </button>
      {open && <MachinePanel onClose={() => setOpen(false)} anchorRef={anchorRef} />}
    </>
  );
}

function GlobalStatus() {
  const config = useStore((s) => s.config);
  const health = useStore((s) => s.health);
  const online = useStore((s) => s.online);
  const stale = useStore((s) => s.healthStale);
  const loadHealth = useStore((s) => s.loadHealth);
  const healthUpdatedAt = useStore((s) => s.healthUpdatedAt);
  if (!config) return null;
  const total = flattenApps(config).length;
  const up = Object.values(health).filter((entry) => entry.status === "up").length;
  return (
    <>
      {!online && <span className="badge-offline">Sin conexión</span>}
      {stale && (
        <button
          type="button"
          className="badge-stale"
          onClick={() => void loadHealth()}
          title={`Última comprobación: ${clockOf(healthUpdatedAt)}. Reintentar`}
        >
          Datos desactualizados · Reintentar
        </button>
      )}
      <span className="global-status" title="Apps activas sobre el total">
        <span className="global-status-long">
          {up} de {total} activas
        </span>
        <span className="global-status-short">
          {up}/{total}
        </span>
      </span>
    </>
  );
}

export function Header() {
  const editing = useStore((s) => s.editing);
  const setEditing = useStore((s) => s.setEditing);
  const saveStatus = useStore((s) => s.saveStatus);
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <header className="header" data-search-open={searchOpen ? "true" : "false"}>
      <div className="header-left">
        <button
          type="button"
          className="btn btn-icon btn-ghost search-mobile-btn"
          aria-label="Buscar"
          onClick={() => setSearchOpen((open) => !open)}
        >
          <Search size={16} strokeWidth={1.75} />
        </button>
        <span className="brand">
          <Logo />
          <h1>Tambo</h1>
        </span>
      </div>
      <div className="header-search">
        <SearchBar />
      </div>
      <div className="header-right">
        <GlobalStatus />
        <MachineButton />
        <ViewButton />
        <ThemeButton />
        <button
          type="button"
          className="btn btn-ghost theme-btn"
          aria-pressed={editing}
          onClick={() => setEditing(!editing)}
        >
          <Pencil size={15} strokeWidth={1.75} />
          <span className="btn-text">Editar</span>
        </button>
        {editing && saveStatus !== "idle" && (
          <span
            className={`save-status${saveStatus === "error" ? " save-error" : ""}`}
            role="status"
          >
            {saveStatus === "saving" ? "Guardando…" : saveStatus === "saved" ? "Guardado" : "Error"}
          </span>
        )}
      </div>
    </header>
  );
}
