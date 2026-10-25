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
import { ToastStack } from "./components/ToastStack";
import { ErrorBanner } from "./components/ErrorBanner";
import { EmptyState } from "./components/EmptyState";
import { SkeletonBoard } from "./components/SkeletonBoard";
import { AppMenu } from "./components/AppMenu";
import { KeyboardHelp } from "./components/KeyboardHelp";
import { Logo } from "./components/Logo";
import { Pencil } from "lucide-react";
import { AppIconSprite } from "./components/AppIdentity";
import type { MenuPoint } from "./components/AppCard";

export default function App() {
  const config = useStore((s) => s.config);
  const query = useStore((s) => s.query);
  const services = useStore((s) => s.services);
  const health = useStore((s) => s.health);
  const quickFilter = useStore((s) => s.quickFilter);
  const setQuickFilter = useStore((s) => s.setQuickFilter);
  const editing = useStore((s) => s.editing);
  const setEditing = useStore((s) => s.setEditing);
  const selectedApps = useStore((s) => s.selectedApps);
  const batchPowerAction = useStore((s) => s.batchPowerAction);
  const clearSelection = useStore((s) => s.clearSelection);
  const view = useStore((s) => s.view);
  const shortcuts = useStore((s) => s.shortcuts);
  const loadError = useStore((s) => s.loadError);
  const online = useStore((s) => s.online);
  const load = useStore((s) => s.load);
  const loadHealth = useStore((s) => s.loadHealth);
  const theme = useStore((s) => s.theme);
  const drawerOpen = useStore((s) => s.drawer.mode !== "closed");
  const detailsOpen = useStore((s) => s.details.appId !== null);
  const detailsAppId = useStore((s) => s.details.appId);
  const openDetails = useStore((s) => s.openDetails);
  const [menu, setMenu] = useState<{ app: AppEntry; point: MenuPoint } | null>(null);
  const menuRef = useRef(menu);
  menuRef.current = menu;

  useEffect(() => {
    void load();
    void loadHealth();
    void useStore.getState().loadServices();
    const timer = setInterval(() => {
      void useStore.getState().loadHealth();
      // Recuperación automática: mientras la configuración venga de la
      // caché o el portal esté sin respuesta, se revalida.
      const st = useStore.getState();
      if (!st.online || st.configSource === "cache") void st.load();
    }, 10_000);
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

  // Deep link: #app-id abre el drawer de esa app.
  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash.replace(/^#/, "");
      if (hash && config) {
        const found = flattenApps(config).some((a) => a.id === hash);
        if (found) openDetails(hash);
      }
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, [config, openDetails]);

  // Mantener el hash sincronizado con el drawer de detalles.
  useEffect(() => {
    if (detailsAppId) {
      if (window.location.hash !== `#${detailsAppId}`) {
        window.history.replaceState(null, "", `#${detailsAppId}`);
      }
    } else if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, [detailsAppId]);

  // Solicitar permiso de notificaciones una vez (no bloquea).
  useEffect(() => {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "default") {
      // Esperar a la primera interacción del usuario.
      const handler = () => {
        void Notification.requestPermission();
        window.removeEventListener("click", handler);
      };
      window.addEventListener("click", handler, { once: true });
      return () => window.removeEventListener("click", handler);
    }
  }, []);

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

  // Sincronización entre pestañas: cuando una pestaña guarda, las demás
  // recargan la configuración sin recargar la página.
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel("tambo-sync");
    const onMessage = (event: MessageEvent) => {
      if (event.data === "config-changed") {
        void useStore.getState().load();
        void useStore.getState().loadServices();
      }
    };
    channel.addEventListener("message", onMessage);
    return () => {
      channel.removeEventListener("message", onMessage);
      channel.close();
    };
  }, []);

  // Window Controls Overlay: solo cuando el navegador lo activa de verdad.
  // La clase wco mueve el encabezado al área de título con env(titlebar-area-*).
  useEffect(() => {
    const overlay = (
      navigator as Navigator & {
        windowControlsOverlay?: {
          visible: boolean;
          addEventListener(type: "geometrychange", listener: () => void): void;
          removeEventListener(type: "geometrychange", listener: () => void): void;
        };
      }
    ).windowControlsOverlay;
    if (!overlay) return;
    const update = () => {
      document.documentElement.classList.toggle("wco", Boolean(overlay.visible));
    };
    overlay.addEventListener("geometrychange", update);
    update();
    return () => overlay.removeEventListener("geometrychange", update);
  }, []);

  // Tema: data-theme en la raíz y meta theme-color acorde. El color sigue la
  // superficie del encabezado para que la ventana del SO no destone.
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    const light =
      theme === "light" ||
      (theme === "system" && window.matchMedia("(prefers-color-scheme: light)").matches);
    document
      .querySelectorAll('meta[name="theme-color"]')
      .forEach((meta) => meta.setAttribute("content", light ? "#FFFFFF" : "#12151C"));
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

  const filtered = useMemo(() => {
    let groups = filterGroups(config?.groups ?? [], query);
    if (quickFilter === "all") return groups;
    return groups
      .map((group) => ({
        ...group,
        apps: group.apps.filter((app) => {
          if (quickFilter === "prod") return app.tags.includes("prod");
          if (quickFilter === "dev") return app.tags.includes("dev");
          const svc = services?.[app.id];
          if (quickFilter === "sleeping") return !!svc?.sablier && !svc.sablier.sessionActive;
          if (quickFilter === "down") return health?.[app.id]?.status === "down";
          return true;
        }),
      }))
      .filter((g) => g.apps.length > 0);
  }, [config, query, quickFilter, services, health]);
  const hasApps = !!config && flattenApps(config).length > 0;
  const searching = query.trim().length > 0;
  const openMenu = (app: AppEntry, point: MenuPoint) => setMenu({ app, point });

  return (
    <>
      <AppIconSprite />
      <a href="#main-content" className="skip-link">
        Saltar al contenido
      </a>
      <Header />
      <ErrorBanner />
      {editing && (
        <div className="edit-banner" role="status">
          <Pencil size={14} strokeWidth={1.75} />
          <span>
            Modo edición: arrastra tarjetas/grupos, edita con el lápiz, o haz clic en una tarjeta
            para seleccionarla.
          </span>
          <button type="button" className="btn btn-accent" onClick={() => setEditing(false)}>
            Terminar edición
          </button>
        </div>
      )}
      <main id="main-content" className="main" data-view={view} tabIndex={-1}>
        {!config && !loadError && online && <SkeletonBoard />}
        {!config && (!online || !!loadError) && (
          <div className="empty" role="alert">
            <Logo size={48} />
            <p>Sin conexión con Tambo</p>
            <p className="card-desc">
              No hay una copia guardada en este navegador. Cuando haya conexión, la primera carga
              guardará tus accesos para poder abrirlos sin servidor.
            </p>
            <button type="button" className="btn" onClick={() => void load()}>
              Reintentar
            </button>
          </div>
        )}
        {config && !hasApps && <EmptyState />}
        {config && hasApps && (
          <>
            {/* Con búsqueda activa la fila de anclados se oculta: los
                resultados ya están a la vista y ninguna app se duplica. */}
            {!searching && <PinnedRow onOpenMenu={openMenu} />}
            <div className="quick-filters" role="group" aria-label="Filtros rápidos">
              {(["all", "prod", "dev", "sleeping", "down"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`quick-filter${quickFilter === f ? " is-active" : ""}`}
                  onClick={() => setQuickFilter(f)}
                >
                  {f === "all"
                    ? "Todas"
                    : f === "prod"
                      ? "Prod"
                      : f === "dev"
                        ? "Dev"
                        : f === "sleeping"
                          ? "Dormidas"
                          : "Caídas"}
                </button>
              ))}
            </div>
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
      {editing && selectedApps.size > 0 && (
        <div className="batch-bar" role="toolbar" aria-label="Acciones en lote">
          <span>{selectedApps.size} seleccionadas</span>
          <button
            type="button"
            className="btn btn-accent"
            onClick={() => void batchPowerAction("start")}
          >
            Encender
          </button>
          <button type="button" className="btn" onClick={() => void batchPowerAction("stop")}>
            Apagar
          </button>
          <button type="button" className="btn btn-ghost" onClick={clearSelection}>
            Limpiar
          </button>
        </div>
      )}
      {menu && (
        <AppMenu app={menu.app} x={menu.point.x} y={menu.point.y} onClose={() => setMenu(null)} />
      )}
      {drawerOpen && <EditDrawer />}
      {detailsOpen && <DetailsDrawer />}
      <ToastStack />
      <KeyboardHelp />
    </>
  );
}
