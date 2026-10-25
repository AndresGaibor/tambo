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
  HardDrive,
  Cpu,
  Activity,
  AlertTriangle,
  Download,
  Zap,
  TrendingUp,
  Minimize2,
  Maximize2,
  Users,
} from "lucide-react";
import { Logo } from "./Logo";
import { ConfigIO } from "./ConfigIO";
import { sablierInstances, sablierWord, useStore, type ViewMode } from "../store";
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
  const history = useStore((s) => s.history);

  const [expandedServices, setExpandedServices] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sablierOk, setSablierOk] = useState<boolean | null>(null);

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

  // Comprobación periódica de Sablier: si no responde, las apps no escalarán
  // a cero automáticamente y hay que avisar.
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch("/api/sablier/health");
        const body = res.ok ? ((await res.json()) as { ok?: boolean }) : null;
        if (!cancelled) setSablierOk(body?.ok === true);
      } catch {
        if (!cancelled) setSablierOk(false);
      }
    };
    void check();
    const timer = window.setInterval(check, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  // Origen real de las cifras: la VM oci (systemd y cgroups del host),
  // nunca el Mac del usuario.
  const unidades = Object.values(services).filter((entry) => entry.memoryBytes != null);
  const compartidas = unidades.filter((entry) => (entry.shared ?? 1) > 1).length;

  // Instancias que Sablier gestiona: unas están en sesión y otras dormidas
  // a cero tras los 30 min sin tráfico.
  const sablier = sablierInstances(services);
  const sablierActivas = sablier.filter((entry) => entry.state.sessionActive).length;
  const sablierDormidas = sablier.length - sablierActivas;
  // RAM que Sablier mantiene liberada al tener dormidas las instancias.
  const sablierFreedBytes = sablier
    .filter((entry) => !entry.state.sessionActive)
    .reduce((sum, entry) => {
      const svc = Object.values(services).find((s) => s.unit === entry.unit);
      return sum + (svc?.memoryBytes ?? 0);
    }, 0);

  // Historial: minutos-app dormidos en los últimos puntos disponibles.
  const historyPoints = history.slice(-60);
  const sleepingMinutes = Math.round(
    historyPoints.reduce((sum, point) => {
      const sablierUnits = Object.values(point.services ?? {}).filter(
        (s) => s.sablier && !s.sablier.sessionActive,
      );
      return sum + sablierUnits.length * (15 / 60);
    }, 0),
  );

  // Cálculo de porcentajes para barras de progreso
  const ramPercent = machine
    ? Math.min(100, Math.round((machine.memoryUsedBytes / machine.memoryTotalBytes) * 100))
    : 0;
  const cpuPercent = machine ? Math.min(100, Math.round(machine.cpuPercent ?? 0)) : 0;
  const loadPercent = machine
    ? Math.min(100, Math.round((machine.load1 / machine.cores) * 100))
    : 0;

  // Colores semánticos según uso
  const getUsageColor = (percent: number) => {
    if (percent >= 80) return "var(--down)";
    if (percent >= 60) return "var(--warn)";
    return "var(--ok)";
  };

  const ramColor = getUsageColor(ramPercent);
  const cpuColor = getUsageColor(cpuPercent);
  const loadColor = getUsageColor(loadPercent);

  // Preparar datos para sparklines (últimos 30 puntos)
  const sparklinePoints = useMemo(() => {
    return history.slice(-30).map((p, i) => ({
      x: i,
      cpu: p.cpuPercent ?? 0,
      ram: p.memoryTotalBytes > 0 ? Math.round((p.memoryUsedBytes / p.memoryTotalBytes) * 100) : 0,
      load:
        p.memoryTotalBytes > 0
          ? Math.min(100, Math.round((p.load1 / (p.memoryTotalBytes > 0 ? 4 : 4)) * 100))
          : 0,
    }));
  }, [history]);

  // Función para generar path SVG del sparkline
  const generateSparklinePath = (
    points: { x: number; cpu: number; ram: number; load: number }[],
    metric: "cpu" | "ram" | "load",
  ) => {
    if (points.length < 2) return "";
    const width = 120;
    const height = 30;
    const padding = 2;
    const xScale = (width - 2 * padding) / Math.max(1, points.length - 1);

    return points
      .map((p, i) => {
        const x = padding + i * xScale;
        const y = height - padding - (p[metric] / 100) * (height - 2 * padding);
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  };

  const cpuPath = generateSparklinePath(sparklinePoints, "cpu");
  const ramPath = generateSparklinePath(sparklinePoints, "ram");
  const loadPath = generateSparklinePath(sparklinePoints, "load");

  // Total memory and CPU across all services
  const totalServiceMem = Object.values(services).reduce((sum, s) => sum + (s.memoryBytes ?? 0), 0);
  const totalServiceCpu = Object.values(services).reduce((sum, s) => sum + (s.cpuPercent ?? 0), 0);

  // Export CSV
  const handleExport = () => {
    setExporting(true);
    const rows = [
      [
        "timestamp",
        "cpu_percent",
        "ram_used_bytes",
        "ram_total_bytes",
        "load1",
        "unit",
        "memory_bytes",
        "cpu_percent",
      ],
      ...history.flatMap((p) =>
        Object.entries(p.services)
          .filter(([, s]) => s.memoryBytes != null)
          .map(([unit, s]) => [
            new Date(p.ts).toISOString(),
            p.cpuPercent ?? "",
            p.memoryUsedBytes,
            p.memoryTotalBytes,
            p.load1.toFixed(2),
            unit,
            s.memoryBytes ?? "",
            s.cpuPercent ?? "",
          ]),
      ),
    ];
    const csv = rows.map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tambo-resources-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  };

  return (
    <div className="menu server-pop" role="dialog" aria-label="Recursos del servidor" ref={ref}>
      <header className="server-pop-header">
        <div className="server-pop-header-content">
          <Activity size={18} strokeWidth={1.75} className="server-pop-icon" />
          <div>
            <p className="server-pop-title">Servidor OCI</p>
            <p className="server-pop-subtitle">
              VM oci · {machine?.cores ?? 4} núcleos · {fmtBytes(machine?.memoryTotalBytes ?? 0)}{" "}
              totales
            </p>
          </div>
        </div>
        <div className="server-pop-header-actions">
          <button
            type="button"
            className="btn btn-icon btn-ghost server-pop-action"
            onClick={handleExport}
            aria-label="Exportar CSV"
            disabled={exporting}
            title="Exportar historial CSV"
          >
            <Download size={14} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className="btn btn-icon btn-ghost server-pop-close"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <X size={14} strokeWidth={1.75} />
          </button>
        </div>
      </header>

      {machine ? (
        <>
          {sablierOk === false && (
            <div className="server-pop-banner" role="alert">
              <AlertTriangle size={14} strokeWidth={1.75} />
              Sablier no responde: las apps no escalarán a cero automáticamente.
            </div>
          )}
          <div className="server-pop-metrics">
            {/* CPU Metric with Sparkline */}
            <div
              className="metric-card"
              style={{ "--metric-color": cpuColor } as React.CSSProperties}
            >
              <div className="metric-header">
                <div className="metric-label">
                  <Cpu size={14} strokeWidth={1.75} />
                  <span>CPU</span>
                </div>
                <span className="metric-value" style={{ color: cpuColor }}>
                  {fmtCpu(machine.cpuPercent)}%
                </span>
              </div>
              <div className="metric-sparkline">
                <svg width="120" height="30" viewBox="0 0 120 30" aria-hidden="true">
                  <defs>
                    <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={cpuColor} stopOpacity="0.3" />
                      <stop offset="100%" stopColor={cpuColor} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {cpuPath && (
                    <>
                      <path d={`${cpuPath} L 118 28 L 2 28 Z`} fill="url(#cpuGradient)" />
                      <path
                        d={cpuPath}
                        stroke={cpuColor}
                        strokeWidth="1.5"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </>
                  )}
                </svg>
              </div>
              <div className="metric-bar-track">
                <div
                  className="metric-bar"
                  style={{
                    width: `${cpuPercent}%`,
                    backgroundColor: cpuColor,
                  }}
                />
              </div>
              <p className="metric-detail">
                {fmtCpu(machine.cpuPercent)}% de {machine.cores} núcleos · Carga:{" "}
                {machine.load1.toFixed(2)}
                {totalServiceCpu > 0 && <span> · Servicios: {fmtCpu(totalServiceCpu)}%</span>}
              </p>
            </div>

            {/* RAM Metric with Sparkline */}
            <div
              className="metric-card"
              style={{ "--metric-color": ramColor } as React.CSSProperties}
            >
              <div className="metric-header">
                <div className="metric-label">
                  <HardDrive size={14} strokeWidth={1.75} />
                  <span>RAM</span>
                </div>
                <span className="metric-value" style={{ color: ramColor }}>
                  {fmtBytes(machine.memoryUsedBytes)} / {fmtBytes(machine.memoryTotalBytes)}
                </span>
              </div>
              <div className="metric-sparkline">
                <svg width="120" height="30" viewBox="0 0 120 30" aria-hidden="true">
                  <defs>
                    <linearGradient id="ramGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={ramColor} stopOpacity="0.3" />
                      <stop offset="100%" stopColor={ramColor} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {ramPath && (
                    <>
                      <path d={`${ramPath} L 118 28 L 2 28 Z`} fill="url(#ramGradient)" />
                      <path
                        d={ramPath}
                        stroke={ramColor}
                        strokeWidth="1.5"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </>
                  )}
                </svg>
              </div>
              <div className="metric-bar-track">
                <div
                  className="metric-bar"
                  style={{
                    width: `${ramPercent}%`,
                    backgroundColor: ramColor,
                  }}
                />
              </div>
              <p className="metric-detail">
                {fmtBytes(machine.memoryUsedBytes)} de {fmtBytes(machine.memoryTotalBytes)} (
                {ramPercent}%)
                {totalServiceMem > 0 && <span> · Servicios: {fmtBytes(totalServiceMem)}</span>}
              </p>
            </div>

            {/* Load Metric with Sparkline */}
            <div
              className="metric-card"
              style={{ "--metric-color": loadColor } as React.CSSProperties}
            >
              <div className="metric-header">
                <div className="metric-label">
                  <Activity size={14} strokeWidth={1.75} />
                  <span>Carga</span>
                </div>
                <span className="metric-value" style={{ color: loadColor }}>
                  {machine.load1.toFixed(2)}
                </span>
              </div>
              <div className="metric-sparkline">
                <svg width="120" height="30" viewBox="0 0 120 30" aria-hidden="true">
                  <defs>
                    <linearGradient id="loadGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={loadColor} stopOpacity="0.3" />
                      <stop offset="100%" stopColor={loadColor} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {loadPath && (
                    <>
                      <path d={`${loadPath} L 118 28 L 2 28 Z`} fill="url(#loadGradient)" />
                      <path
                        d={loadPath}
                        stroke={loadColor}
                        strokeWidth="1.5"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </>
                  )}
                </svg>
              </div>
              <div className="metric-bar-track">
                <div
                  className="metric-bar"
                  style={{
                    width: `${loadPercent}%`,
                    backgroundColor: loadColor,
                  }}
                />
              </div>
              <p className="metric-detail">
                Load 1m: {machine.load1.toFixed(2)} de {machine.cores} ({loadPercent}%)
              </p>
            </div>
          </div>

          {/* Alertas de umbral */}
          {(cpuPercent >= 80 || ramPercent >= 80 || loadPercent >= 80) && (
            <div className="server-pop-alerts">
              {cpuPercent >= 80 && (
                <div className="alert alert-critical">
                  <Zap size={13} strokeWidth={1.75} />
                  <span>CPU crítica: {fmtCpu(machine.cpuPercent)}%</span>
                </div>
              )}
              {ramPercent >= 80 && (
                <div className="alert alert-critical">
                  <AlertTriangle size={13} strokeWidth={1.75} />
                  <span>RAM crítica: {ramPercent}%</span>
                </div>
              )}
              {loadPercent >= 80 && (
                <div className="alert alert-critical">
                  <TrendingUp size={13} strokeWidth={1.75} />
                  <span>Carga alta: {machine.load1.toFixed(2)}</span>
                </div>
              )}
              {cpuPercent >= 60 && cpuPercent < 80 && (
                <div className="alert alert-warning">
                  <Zap size={13} strokeWidth={1.75} />
                  <span>CPU alta: {fmtCpu(machine.cpuPercent)}%</span>
                </div>
              )}
              {ramPercent >= 60 && ramPercent < 80 && (
                <div className="alert alert-warning">
                  <AlertTriangle size={13} strokeWidth={1.75} />
                  <span>RAM alta: {ramPercent}%</span>
                </div>
              )}
            </div>
          )}

          {sablier.length > 0 && (
            <div className="server-pop-details">
              <details className="server-pop-services" open={expandedServices}>
                <summary onClick={() => setExpandedServices(!expandedServices)}>
                  <span>
                    Sablier · {sablierDormidas} dormidas / {sablierActivas} activas
                  </span>
                  <span className="chevron">
                    {expandedServices ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                  </span>
                </summary>
                <ul>
                  {sablier.map((entry) => (
                    <li key={entry.unit} className="sablier-row">
                      <code>{entry.unit.replace(/\.service$/, "")}</code>
                      <span className="sablier-group">
                        {entry.state.groups.length > 0 ? entry.state.groups.join(", ") : "—"}
                      </span>
                      <span
                        className="sablier-status"
                        data-tone={entry.state.sessionActive ? "on" : "off"}
                      >
                        {sablierWord(entry.state)}
                      </span>
                    </li>
                  ))}
                </ul>
                {sablierDormidas > 0 && sablierFreedBytes > 0 && (
                  <p className="server-pop-note">
                    Sablier mantiene dormidas {sablierDormidas} apps, liberando ~
                    {fmtBytes(sablierFreedBytes)}.
                  </p>
                )}
                {sleepingMinutes > 0 && (
                  <p className="server-pop-note">
                    Últimos 15 min: ~{sleepingMinutes} min-app dormidos (ahorro de RAM).
                  </p>
                )}
                <p className="server-pop-note">
                  <Zap size={13} strokeWidth={1.75} />
                  Escala a cero: tras 30 min sin tráfico Sablier detiene la instancia. Al abrir la
                  app, el portal pide a Sablier que la despierte y abra sesión.
                </p>
              </details>
            </div>
          )}

          <div className="server-pop-details">
            <p className="server-pop-note">
              <strong>Origen:</strong> contadores de systemd y cgroups del host de la VM (no el
              MacBook).
              <br />
              CPU: % del total de la máquina ({machine.cores} núcleos), delta entre muestreos de 15
              s. RAM: memoria usada del total.
              <br />
              Actualizado {agoOf(healthUpdatedAt)} ({clockOf(healthUpdatedAt)}).
            </p>
            {compartidas > 0 && (
              <p className="server-pop-note warning">
                <AlertTriangle size={13} strokeWidth={1.75} />
                {compartidas} unidad(es) sirven a varias apps: su memoria y CPU son del conjunto y
                no se atribuyen a cada app individual.
              </p>
            )}
            {Object.keys(services).length > 0 && (
              <details className="server-pop-services" open={expandedServices}>
                <summary onClick={() => setExpandedServices(!expandedServices)}>
                  <span>Unidades con métricas ({unidades.length})</span>
                  <span className="chevron">
                    {expandedServices ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                  </span>
                </summary>
                <ul>
                  {Object.entries(services)
                    .filter(([, entry]) => entry.memoryBytes != null)
                    .sort(([, a], [, b]) => (b.memoryBytes ?? 0) - (a.memoryBytes ?? 0))
                    .map(([id, entry]) => {
                      const mem = entry.memoryBytes ?? 0;
                      const cpu = entry.cpuPercent ?? 0;
                      const memPct = machine?.memoryTotalBytes
                        ? Math.round((mem / machine.memoryTotalBytes) * 100)
                        : 0;
                      const cpuPct = machine?.cores ? Math.round((cpu / machine.cores) * 100) : 0;
                      const isShared = entry.shared && entry.shared > 1;
                      return (
                        <li key={id}>
                          <code>{id}</code>
                          <span className="mem-cell">
                            <HardDrive size={11} strokeWidth={1.5} />
                            {fmtBytes(mem)}
                            <span className="pct">({memPct}%)</span>
                          </span>
                          <span className="cpu-cell">
                            <Cpu size={11} strokeWidth={1.5} />
                            {fmtCpu(cpu)}%<span className="pct">({cpuPct}% total)</span>
                          </span>
                          {isShared && <span className="shared-badge">×{entry.shared}</span>}
                          {isShared && (
                            <details className="shared-unit-breakdown">
                              <summary>
                                <Users size={11} strokeWidth={1.5} />
                                Desglose estimado ({entry.shared} apps)
                              </summary>
                              <dl className="breakdown-grid">
                                <dt>Total</dt>
                                <dd>
                                  <span>{fmtBytes(mem)}</span>
                                  <span>{cpu > 0 ? fmtCpu(cpu) + "%" : "—"}</span>
                                </dd>
                                <dt>Por app (estimado)</dt>
                                <dd>
                                  <span>{fmtBytes(Math.round(mem / (entry.shared || 1)))} c/u</span>
                                  <span>
                                    {cpu > 0 ? fmtCpu(cpu / (entry.shared || 1)) + "% c/u" : "—"}
                                  </span>
                                </dd>
                              </dl>
                            </details>
                          )}
                        </li>
                      );
                    })}
                </ul>
              </details>
            )}
          </div>
        </>
      ) : (
        <div className="server-pop-empty">
          <Activity size={32} strokeWidth={1.5} />
          <p>Sin datos del servidor todavía</p>
        </div>
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
  const canUndo = useStore((s) => s.canUndo);
  const undo = useStore((s) => s.undo);
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
          className="btn btn-icon btn-ghost"
          aria-label="Atajos de teclado"
          title="Atajos de teclado (?)"
          onClick={() =>
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "?", bubbles: true }))
          }
        >
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>?</span>
        </button>
        <button
          type="button"
          className={`btn btn-ghost theme-btn${editing ? " is-editing" : ""}`}
          aria-pressed={editing}
          onClick={() => setEditing(!editing)}
        >
          <Pencil size={15} strokeWidth={1.75} />
          <span className="btn-text">{editing ? "Terminar edición" : "Editar"}</span>
        </button>
        {editing && saveStatus !== "idle" && (
          <span
            className={`save-status${saveStatus === "error" ? " save-error" : ""}`}
            role="status"
          >
            {saveStatus === "saving" ? "Guardando…" : saveStatus === "saved" ? "Guardado" : "Error"}
          </span>
        )}
        {editing && <ConfigIO />}
        {editing && canUndo && (
          <button
            type="button"
            className="btn btn-ghost theme-btn"
            onClick={() => undo()}
            title="Deshacer último cambio (Ctrl+Z)"
          >
            Deshacer
          </button>
        )}
      </div>
    </header>
  );
}
