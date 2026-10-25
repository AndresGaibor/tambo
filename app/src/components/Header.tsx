import { useMemo, useState } from "react";
import { Monitor, Moon, Pencil, Search, Sun, X } from "lucide-react";
import { Logo } from "./Logo";
import { useStore } from "../store";
import { flattenApps } from "../schema";
import { filterGroups, firstMatch } from "../lib/search";
import { openApp } from "../lib/format";

function SearchBar() {
  const query = useStore((s) => s.query);
  const setQuery = useStore((s) => s.setQuery);
  const config = useStore((s) => s.config);
  const filtered = useMemo(() => filterGroups(config?.groups ?? [], query), [config, query]);

  return (
    <div className="search">
      <span className="search-icon">
        <Search size={16} strokeWidth={1.75} />
      </span>
      <input
        data-search-input
        type="text"
        placeholder="Buscar apps, grupos, etiquetas o hosts"
        aria-label="Buscar"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
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
        <kbd className="search-hint">/</kbd>
      )}
    </div>
  );
}

function ThemeButton() {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const next =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: light)").matches
        ? "dark"
        : "light"
      : theme === "dark"
        ? "light"
        : "dark";
  return (
    <button
      type="button"
      className="btn btn-icon btn-ghost"
      onClick={() => setTheme(next)}
      aria-label={`Cambiar tema (actual: ${theme})`}
      title={`Tema: ${theme}`}
    >
      {theme === "system" ? (
        <Monitor size={16} strokeWidth={1.75} />
      ) : theme === "dark" ? (
        <Moon size={16} strokeWidth={1.75} />
      ) : (
        <Sun size={16} strokeWidth={1.75} />
      )}
    </button>
  );
}

function GlobalStatus() {
  const config = useStore((s) => s.config);
  const health = useStore((s) => s.health);
  const online = useStore((s) => s.online);
  if (!config) return null;
  const total = flattenApps(config).length;
  const up = Object.values(health).filter((entry) => entry.status === "up").length;
  return (
    <>
      {!online && <span className="badge-offline">Sin conexión</span>}
      <span className="global-status" title="Apps activas sobre el total">
        <strong>{up}</strong>
        <span className="global-status-long">/{total} activas</span>
      </span>
    </>
  );
}

export function Header() {
  const editing = useStore((s) => s.editing);
  const setEditing = useStore((s) => s.setEditing);
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
        <ThemeButton />
        <button
          type="button"
          className="btn"
          aria-pressed={editing}
          onClick={() => setEditing(!editing)}
        >
          <Pencil size={15} strokeWidth={1.75} />
          {editing ? "Listo" : "Editar"}
        </button>
      </div>
    </header>
  );
}
