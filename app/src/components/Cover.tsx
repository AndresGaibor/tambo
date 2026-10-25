import { useState } from "react";
import type { AppEntry, GroupColor } from "../schema";
import { generateCover } from "../lib/cover";
import { initialOf } from "../lib/format";

/**
 * Portada de la vista "Portadas".
 * - shot, svg e image conservan su recurso; si la imagen falla, cae a la
 *   portada automática estable (nunca a un hueco).
 * - auto dibuja el patrón determinista con altura contenida: el patrón no
 *   es una captura del producto y no debe dominar la tarjeta.
 */
export function Cover({
  app,
  color,
  compact = false,
}: {
  app: AppEntry;
  color: GroupColor;
  compact?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const cover = app.cover;

  if ((cover.kind === "shot" || cover.kind === "svg" || cover.kind === "image") && !failed) {
    const src = cover.kind === "shot" ? `/shots/${app.id}.webp` : `/assets/${cover.src}`;
    // Las ilustraciones 3:1 del kit van como banda a su proporción exacta;
    // una captura real (16:10) se muestra completa.
    const band = cover.kind === "svg" && cover.src.startsWith("covers/");
    return (
      <img
        className={`cover-img${band ? " cover-band" : ""}`}
        src={src}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }

  const label = cover.kind === "emoji" && !failed ? cover.value : initialOf(app.name);
  return (
    <span
      className={`cover-auto${compact ? " cover-auto-compact" : ""}`}
      dangerouslySetInnerHTML={{ __html: generateCover({ id: app.id, color, label }) }}
    />
  );
}
