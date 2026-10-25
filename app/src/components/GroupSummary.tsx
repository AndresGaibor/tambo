import { HardDrive, Moon } from "lucide-react";
import type { Group } from "../schema";
import { useStore } from "../store";
import { fmtBytes } from "../lib/format";

/** Resumen agregado de un grupo en vista compacta. */
export function GroupSummary({ group }: { group: Group }) {
  const services = useStore((s) => s.services);
  const health = useStore((s) => s.health);

  const stats = group.apps.reduce(
    (acc, app) => {
      const svc = app.service ? services[app.id] : undefined;
      const h = health[app.id];
      acc.total += 1;
      if (svc?.sablier && !svc.sablier.sessionActive) acc.sleeping += 1;
      else if (h?.status === "up") acc.up += 1;
      else if (h?.status === "down") acc.down += 1;
      if (svc?.memoryBytes && !svc.shared) acc.ram += svc.memoryBytes;
      return acc;
    },
    { total: 0, up: 0, down: 0, sleeping: 0, ram: 0 },
  );

  if (stats.total === 0) return null;

  return (
    <div className="group-summary" aria-label={`Resumen de ${group.name}`}>
      <span className="group-summary-item">
        <span className="group-summary-count">{stats.total}</span> apps
      </span>
      {stats.up > 0 && (
        <span className="group-summary-item" data-tone="ok">
          {stats.up} activas
        </span>
      )}
      {stats.sleeping > 0 && (
        <span className="group-summary-item" data-tone="sleep">
          <Moon size={11} strokeWidth={1.75} /> {stats.sleeping} dormidas
        </span>
      )}
      {stats.down > 0 && (
        <span className="group-summary-item" data-tone="down">
          {stats.down} caídas
        </span>
      )}
      {stats.ram > 0 && (
        <span className="group-summary-item">
          <HardDrive size={11} strokeWidth={1.75} /> {fmtBytes(stats.ram)}
        </span>
      )}
    </div>
  );
}
