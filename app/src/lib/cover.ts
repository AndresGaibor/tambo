import type { GroupColor } from "../schema";

/** Hash FNV-1a de 32 bits: semilla determinista de la portada. */
export function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Generador determinista: mismas entradas, misma secuencia de números. */
function rng(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const W = 320;
const H = 200;

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Escalera diagonal ascendente: bandas con tres a cinco peldaños. */
function steppedBands(color: string, seed: number): string {
  const random = rng(seed);
  const count = 3 + Math.floor(random() * 3);
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    const step = 26 + random() * 10;
    const x0 = 10 + (i * (W - 40)) / count + (random() * 20 - 10);
    const rungs = Math.ceil((H + 40) / step) + 1;
    let d = `M ${x0.toFixed(1)} ${H + 10}`;
    let y = H + 10;
    for (let k = 0; k < rungs; k++) {
      y -= step;
      d += ` L ${(x0 + k * step).toFixed(1)} ${y.toFixed(1)} L ${(x0 + (k + 1) * step).toFixed(1)} ${y.toFixed(1)}`;
    }
    const opacity = (0.12 + random() * 0.18).toFixed(2);
    const width = (14 + random() * 8).toFixed(1);
    parts.push(
      `<path d="${d}" fill="none" style="stroke:${color};stroke-opacity:${opacity}" stroke-width="${width}" stroke-linecap="butt"/>`,
    );
  }
  return parts.join("");
}

/** Anillos concéntricos con el centro desplazado según la semilla. */
function rings(color: string, seed: number): string {
  const random = rng(seed ^ 0x9e3779b9);
  const cx = W / 2 + (random() - 0.5) * 80;
  const cy = H / 2 + (random() - 0.5) * 50;
  const count = 4 + Math.floor(random() * 3);
  const gap = 22 + random() * 12;
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    const r = 26 + i * gap;
    const opacity = Math.max(0.06, 0.3 - i * 0.045).toFixed(2);
    parts.push(
      `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="none" style="stroke:${color};stroke-opacity:${opacity}" stroke-width="${(1.5 + random()).toFixed(1)}"/>`,
    );
  }
  return parts.join("");
}

/** Retícula de puntos con una forma destacada en el color del grupo. */
function dotGrid(color: string, seed: number): string {
  const random = rng(seed ^ 0x85ebca6b);
  const cols = 9;
  const rows = 5;
  const dx = 36;
  const dy = 42;
  const x0 = (W - (cols - 1) * dx) / 2;
  const y0 = (H - (rows - 1) * dy) / 2;
  const parts: string[] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      parts.push(
        `<circle cx="${(x0 + i * dx).toFixed(1)}" cy="${(y0 + j * dy).toFixed(1)}" r="2" style="fill:var(--text);fill-opacity:0.16"/>`,
      );
    }
  }
  const hi = Math.floor(random() * cols * rows);
  const hx = x0 + (hi % cols) * dx;
  const hy = y0 + Math.floor(hi / cols) * dy;
  const radius = 9 + random() * 4;
  parts.push(
    `<circle cx="${hx.toFixed(1)}" cy="${hy.toFixed(1)}" r="${radius.toFixed(1)}" style="fill:${color};fill-opacity:0.85"/>`,
    `<circle cx="${hx.toFixed(1)}" cy="${hy.toFixed(1)}" r="${(radius + 8).toFixed(1)}" fill="none" style="stroke:${color};stroke-opacity:0.4" stroke-width="1.5"/>`,
  );
  return parts.join("");
}

/**
 * Portada SVG generada: 320x200, siempre igual para el mismo id.
 * Se dibuja en línea para heredar las variables del tema.
 */
export function generateCover(options: { id: string; color: GroupColor; label: string }): string {
  const { id, color, label } = options;
  const seed = fnv1a(id);
  const variant = seed % 3;
  const cssColor = `var(--c-${color})`;
  const isEmoji = /\p{Extended_Pictographic}/u.test(label);
  const motif =
    variant === 0
      ? steppedBands(cssColor, seed)
      : variant === 1
        ? rings(cssColor, seed)
        : dotGrid(cssColor, seed);
  const fontSize = isEmoji ? 64 : 56;
  const fontFamily = isEmoji
    ? ""
    : "font-family:'Space Grotesk Variable',sans-serif;font-weight:600;";
  return [
    `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" role="presentation">`,
    `<defs><linearGradient id="tambo-${color}-${variant}" x1="0" y1="0" x2="1" y2="1">`,
    `<stop offset="0" style="stop-color:${cssColor};stop-opacity:0.22"/>`,
    `<stop offset="1" style="stop-color:var(--surface)"/>`,
    `</linearGradient></defs>`,
    `<rect width="${W}" height="${H}" fill="url(#tambo-${color}-${variant})"/>`,
    motif,
    `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" dominant-baseline="central" style="${fontFamily}font-size:${fontSize}px;fill:var(--text);fill-opacity:0.9">${escapeXml(label)}</text>`,
    `</svg>`,
  ].join("");
}
