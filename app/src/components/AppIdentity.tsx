import spriteMarkup from "../assets/apps-sprite.svg?raw";
import type { AppEntry, GroupColor } from "../schema";
import { initialOf } from "../lib/format";

/**
 * Sprite incrustado una sola vez en el documento: los <use> apuntan a
 * fragmentos del mismo documento, que funcionan en todos los navegadores
 * (la referencia externa a archivo no siempre renderiza).
 */
export function AppIconSprite() {
  return <span hidden dangerouslySetInnerHTML={{ __html: spriteMarkup }} />;
}

/**
 * Identidad visual de una app, con la misma prioridad en anclados y
 * tarjetas:
 * 1. Recurso propio elegido para la app (cover svg o image).
 * 2. Icono configurado en apps.json:
 *    - "tambo:<glifo>" del sprite incluido en /icons/apps/sprite.svg
 *      (trazo 1.75, currentColor: hereda el color del proyecto),
 *    - "lucide:<nombre>" de la biblioteca,
 *    - un emoji literal.
 * 3. Inicial del nombre como respaldo.
 * El icono y la portada son propiedades independientes: una portada nunca
 * resuelve el icono compacto. No se descargan favicons.
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
  const glyph = Math.round(size * 0.62);

  if (app.cover.kind === "svg" || app.cover.kind === "image") {
    return (
      <span className="identity" style={style} aria-hidden="true">
        <img src={`/assets/${app.cover.src}`} alt="" loading="lazy" />
      </span>
    );
  }

  if (app.icon?.startsWith("tambo:")) {
    const glyphId = app.icon.slice("tambo:".length);
    if (/^[a-z0-9-]+$/.test(glyphId)) {
      return (
        <span className="identity identity-glyph" style={style} aria-hidden="true">
          <svg width={glyph} height={glyph} style={{ color: "var(--g)" }}>
            <use href={`#tambo-${glyphId}`} />
          </svg>
        </span>
      );
    }
  }

  if (app.icon?.startsWith("lucide:")) {
    return (
      <span className="identity identity-glyph" style={style} aria-hidden="true">
        <TamboLucide name={app.icon.slice("lucide:".length)} glyph={glyph} />
      </span>
    );
  }

  if (app.icon) {
    return (
      <span className="identity" style={style} aria-hidden="true">
        <span style={{ fontSize: Math.round(size * 0.52) }}>{app.icon}</span>
      </span>
    );
  }

  return (
    <span className="identity identity-icon" style={style} aria-hidden="true">
      <span style={{ fontSize: Math.round(size * 0.44) }}>{initialOf(app.name)}</span>
    </span>
  );
}

// lucide se resuelve por nombre con el mapa ya incluido en el bundle.
import { icons } from "lucide-react";
import type { ComponentType } from "react";

type LucideIcon = ComponentType<{ size?: number; strokeWidth?: number }>;

function TamboLucide({ name, glyph }: { name: string; glyph: number }) {
  const key = name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  const Cmp = (icons as Record<string, LucideIcon>)[key];
  if (!Cmp) return null;
  return <Cmp size={glyph} strokeWidth={1.75} />;
}
