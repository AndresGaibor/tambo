import { useEffect, useMemo, useRef, useState } from "react";
import type { AppEntry } from "./schema";
import { flattenApps } from "./schema";
import { filterGroups } from "./lib/search";
import { openApp } from "./lib/format";
import { useStore } from "./store";
import { Header } from "./components/Header";
import { PinnedRow } from "./components/PinnedRow";
import { GroupSection } from "./components/GroupSection";
import { EditableBoard } from "./components/EditableBoard";
import { EditDrawer } from "./components/EditDrawer";
import { DetailsDrawer } from "./components/DetailsDrawer";
import { ErrorBanner } from "./components/ErrorBanner";
import { EmptyState } from "./components/EmptyState";
import { AppMenu } from "./components/AppMenu";
import { Logo } from "./components/Logo";
import { AppIconSprite } from "./components/AppIdentity";
import type { MenuPoint } from "./components/AppCard";

export default function App() {
  const config = useStore((s) => s.config);
  const query = useStore((s) => s.query);
  const editing = useStore((s) => s.editing);
  const view = useStore((s) => s.view);
  const shortcuts = useStore((s) => s.shortcuts);
  const loadError = useStore((s) => s.loadError);
  const load = useStore((s) => s.load);
  const loadHealth = useStore((s) => s.loadHealth);
  const theme = useStore((s) => s.theme);
  const drawerOpen = useStore((s) => s.drawer.mode !== "closed");
  const detailsOpen = useStore((s) => s.details.appId !== null);
  const [menu, setMenu] = useState<{ app: AppEntry; point: MenuPoint } | null>(null);
  const menuRef = useRef(menu);
  menuRef.current = menu;

  useEffect(() => {
    void load();
    void loadHealth();
    void useStore.getState().loadServices();
    const timer = setInterval(() => void useStore.getState().loadHealth(), 10_000);
    const servicesTimer = setInterval(() => void useStore.getState().loadServices(), 15_000);
    // La configuración también se relee: si cambia apps.json a mano o por
    // otro proceso, el mapeo app → unidad no debe quedarse obsoleto.
    const configTimer = setInterval(() => void useStore.getState().load(), 30_000);
    return () => {
      clearInterval(timer);
      clearInterval(servicesTimer);
      clearInterval(configTimer);
    };
  }, [load, loadHealth]);

  // Actualización en vivo: el servidor avisa con un evento HMR propio y se
  // vuelve a pedir la configuración sin recargar la página.
  useEffect(() => {
    const hot = import.meta.hot;
    if (!hot) return;
    const onConfig = () => {
      void useStore.getState().load();
      // El mapeo de unidades pudo cambiar: hay que releer los servicios.
      void useStore.getState().loadServices();
    };
    hot.on("tambo:config", onConfig);
    return () => hot.off("tambo:config", onConfig);
  }, []);

  // Tema: data-theme en la raíz y meta theme-color acorde.
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    const light =
      theme === "light" ||
      (theme === "system" && window.matchMedia("(prefers-color-scheme: light)").matches);
    document
      .querySelectorAll('meta[name="theme-color"]')
      .forEach((meta) => meta.setAttribute("content", light ? "#F7F5F0" : "#0B0D12"));
  }, [theme]);

  // Atajos: / o Cmd+K buscan siempre; e, t y 1-9 son conmutables y nunca
  // actúan mientras se escribe, se compone texto (IME) o hay modificadores.
  useEffect(() => {
    const focusSearch = () =>
      document.querySelector<HTMLInputElement>("[data-search-input]")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      const target = event.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        focusSearch();
        return;
      }
      if (event.key === "Escape") {
        // Cascada: primero el menú o panel superior, después la búsqueda.
        if (menuRef.current) return; // el menú se cierra y devuelve el foco solo
        const state = useStore.getState();
        if (state.details.appId) {
          state.openDetails(null);
          return;
        }
        if (state.drawer.mode !== "closed") return; // el panel lo maneja su efecto
        if (typing) {
          const input = target as HTMLInputElement | null;
          if (input?.value) state.setQuery("");
          else input?.blur();
        } else if (state.query) state.setQuery("");
        return;
      }
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "/") {
        event.preventDefault();
        focusSearch();
        return;
      }
      const state = useStore.getState();
      if (!state.shortcuts) return;
      if (event.key === "e") {
        state.setEditing(!state.editing);
        return;
      }
      if (event.key === "t") {
        const light =
          state.theme === "light" ||
          (state.theme === "system" && window.matchMedia("(prefers-color-scheme: light)").matches);
        state.setTheme(light ? "dark" : "light");
        return;
      }
      if (/^[1-9]$/.test(event.key) && state.config) {
        const pinned = flattenApps(state.config).filter((app) => app.pinned);
        const app = pinned[Number(event.key) - 1];
        if (app) openApp(app, state.config.settings.openIn);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcuts]);

  const filtered = useMemo(() => filterGroups(config?.groups ?? [], query), [config, query]);
  const hasApps = !!config && flattenApps(config).length > 0;
  const searching = query.trim().length > 0;
  const openMenu = (app: AppEntry, point: MenuPoint) => setMenu({ app, point });

  return (
    <>
      <AppIconSprite />
      <Header />
      <ErrorBanner />
      <main className="main" data-view={view}>
        {!config && !loadError && (
          <div className="splash">
            <Logo size={48} />
          </div>
        )}
        {config && !hasApps && <EmptyState />}
        {config && hasApps && (
          <>
            {/* Con búsqueda activa la fila de anclados se oculta: los
                resultados ya están a la vista y ninguna app se duplica. */}
            {!searching && <PinnedRow onOpenMenu={openMenu} />}
            {editing ? (
              <EditableBoard onOpenMenu={openMenu} />
            ) : (
              <>
                {filtered.map((group) => (
                  <GroupSection key={group.id} group={group} view={view} onOpenMenu={openMenu} />
                ))}
                {searching && filtered.length === 0 && (
                  <div className="empty">
                    <p>No hay aplicaciones para «{query}»</p>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => useStore.getState().setQuery("")}
                    >
                      Limpiar búsqueda
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>
      {menu && (
        <AppMenu app={menu.app} x={menu.point.x} y={menu.point.y} onClose={() => setMenu(null)} />
      )}
      {drawerOpen && <EditDrawer />}
      {detailsOpen && <DetailsDrawer />}
    </>
  );
}
