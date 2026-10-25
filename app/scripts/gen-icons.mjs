// Genera los PNG de la PWA a partir de la chakana: 192, 512, 512 maskable
// (glifo dentro del 80% central) y 180 para Apple. Uso: pnpm icons
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "public", "icons");

const CHAKANA =
  "M96 186 L96 156 L126 156 L126 126 L156 126 L156 96 L186 96 L326 96 L356 96 L356 126 L386 126 L386 156 L416 156 L416 186 L416 326 L416 356 L386 356 L386 386 L356 386 L356 416 L326 416 L186 416 L156 416 L156 386 L126 386 L126 356 L96 356 L96 326 Z M256 200 A56 56 0 1 0 256 312 A56 56 0 1 0 256 200 Z";

function iconSvg({ rounded = true, glyph = 0.625 }) {
  const box = 512 * glyph;
  const off = (512 - box) / 2;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">`,
    `<rect width="512" height="512"${rounded ? ' rx="113"' : ""} fill="#0B0D12"/>`,
    `<g transform="translate(${off} ${off}) scale(${box / 320})">`,
    `<path d="${CHAKANA}" fill="#F5B83D" fill-rule="evenodd"/>`,
    `</g></svg>`,
  ].join("");
}

const targets = [
  ["icon-192.png", iconSvg({}), 192],
  ["icon-512.png", iconSvg({}), 512],
  ["icon-512-maskable.png", iconSvg({ rounded: false }), 512],
  ["icon-180.png", iconSvg({}), 180],
];

await mkdir(outDir, { recursive: true });
for (const [name, svg, size] of targets) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(join(outDir, name));
  console.log(`generado ${name}`);
}
