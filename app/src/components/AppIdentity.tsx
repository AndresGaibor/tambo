import type { ComponentType } from "react";
import { icons } from "lucide-react";
import type { AppEntry, GroupColor } from "../schema";
import { initialOf } from "../lib/format";

type LucideIcon = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

/**
 * Identidad visual de una app, con la misma prioridad en anclados,
 * tarjeta compacta y vista de portadas:
 * 1. Recurso propio elegido para la app (cover svg o image).
 * 2. Icono configurado en apps.json (lucide:<nombre> o emoji).
 * 3. Inicial del nombre como respaldo.
 * No se descargan favicons: no existe esa función en Tambo.
 */
export function AppIdentity({
  app,
  color,
  size = 36,
  radius = 9,
}: {
  app: AppEntry;
  color: GroupColor;
  size?: number;
  radius?: number;
}) {
  const style = {
    width: size,
    height: size,
    borderRadius: radius,
    "--g": `var(--c-${color})`,
  } as React.CSSProperties;

  if (app.cover.kind === "svg" || app.cover.kind === "image") {
    return (
      <span className="identity" style={style} aria-hidden="true">
        <img src={`/assets/${app.cover.src}`} alt="" loading="lazy" />
      </span>
    );
  }

  if (app.icon?.startsWith("lucide:")) {
    const name = app.icon
      .slice("lucide:".length)
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("");
    const Cmp = (icons as Record<string, LucideIcon>)[name];
    if (Cmp) {
      return (
        <span className="identity identity-icon" style={style} aria-hidden="true">
          <Cmp size={Math.round(size * 0.55)} strokeWidth={1.75} />
        </span>
      );
    }
  }
  if (app.icon && !app.icon.startsWith("lucide:")) {
    return (
      <span className="identity" style={style} aria-hidden="true">
        <span style={{ fontSize: Math.round(size * 0.52) }}>{app.icon}</span>
      </span>
    );
  }
  // Un emoji configurado como portada cuenta como icono configurado.
  const emoji = app.cover.kind === "emoji" ? app.cover.value : null;
  if (emoji) {
    return (
      <span className="identity" style={style} aria-hidden="true">
        <span style={{ fontSize: Math.round(size * 0.52) }}>{emoji}</span>
      </span>
    );
  }
  return (
    <span className="identity identity-icon" style={style} aria-hidden="true">
      <span style={{ fontSize: Math.round(size * 0.44) }}>{initialOf(app.name)}</span>
    </span>
  );
}
