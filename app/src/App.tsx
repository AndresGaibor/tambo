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
import { ErrorBanner } from "./components/ErrorBanner";
import { EmptyState } from "./components/EmptyState";
import { AppMenu } from "./components/AppMenu";
import { Logo } from "./components/Logo";
import type { MenuPoint } from "./components/AppCard";

export default function App() {
  const config = useStore((s) => s.config);
  const query = useStore((s) => s.query);
  const editing = useStore((s) => s.editing);
  const drawerOpen = useStore((s) => s.drawer.mode !== "closed");
  const loadError = useStore((s) => s.loadError);
  const load = useStore((s) => s.load);
  const loadHealth = useStore((s) => s.loadHealth);
  const theme = useStore((s) => s.theme);
  const [menu, setMenu] = useState<{ app: AppEntry; point: MenuPoint } | null>(null);
  const menuRef = useRef(menu);
  menuRef.current = menu;

  useEffect(() => {
    void load();
    void loadHealth();
    const timer = setInterval(() => void useStore.getState().loadHealth(), 10_000);
    return () => clearInterval(timer);
  }, [load, loadHealth]);

  // Actualización en vivo: el servidor avisa con un evento HMR propio y se
  // vuelve a pedir la configuración sin recargar la página.
  useEffect(() => {
    const hot = import.meta.hot;
    if (!hot) return;
    const onConfig = () => void useStore.getState().load();
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

  // Atajos: / o Cmd+K busca, 1-9 abre ancladas, e edita, t cambia el tema.
  useEffect(() => {
    const focusSearch = () =>
      document.querySelector<HTMLInputElement>("[data-search-input]")?.focus();
    const onKey = (event: KeyboardEvent) => {
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
        if (menuRef.current) return; // el menú se cierra solo
        const state = useStore.getState();
        if (state.drawer.mode !== "closed") state.closeDrawer();
        else if (typing) {
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
  }, []);

  const filtered = useMemo(() => filterGroups(config?.groups ?? [], query), [config, query]);
  const hasApps = !!config && flattenApps(config).length > 0;
  const openMenu = (app: AppEntry, point: MenuPoint) => setMenu({ app, point });

  return (
    <>
      <Header />
      <ErrorBanner />
      <main className="main">
        {!config && !loadError && (
          <div className="splash">
            <Logo size={48} />
          </div>
        )}
        {config && !hasApps && <EmptyState />}
        {config && hasApps && (
          <>
            <PinnedRow />
            {editing ? (
              <EditableBoard onOpenMenu={openMenu} />
            ) : (
              <>
                {filtered.map((group, index) => (
                  <GroupSection key={group.id} group={group} index={index} onOpenMenu={openMenu} />
                ))}
                {query && filtered.length === 0 && (
                  <div className="empty">
                    <p>Sin resultados para «{query}»</p>
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
    </>
  );
}
