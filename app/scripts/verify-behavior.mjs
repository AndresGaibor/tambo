// Verificación de comportamiento: stale + teclado. No captura pantallas salvo indicación.
import { chromium } from "/home/ubuntu/onlook/node_modules/playwright/index.mjs";

const url = "https://oracle.tail4a8b59.ts.net:15171/";
const browser = await chromium.launch({
  executablePath: "/home/ubuntu/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome",
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
await page.waitForTimeout(1_200);

// ===== 1. Fallo de /api/health: datos conservados, aviso desactualizado =====
await page.route("**/api/health", (route) => route.abort());
await page.waitForTimeout(11_500); // el intervalo de 10 s dispara y falla
const stale = await page.evaluate(() => !!document.querySelector(".badge-stale"));
const activasConservadas = await page.evaluate(
  () => document.querySelector(".global-status")?.textContent,
);
console.log("aviso desactualizado:", stale, "| datos conservados:", activasConservadas?.trim());
await page.unroute("**/api/health");
await page.evaluate(() => document.querySelector(".badge-stale")?.click());
await page.waitForTimeout(1_000);
const staleDespues = await page.evaluate(() => !!document.querySelector(".badge-stale"));
console.log("tras Reintentar el aviso desaparece:", !staleDespues);

// ===== 2. Menú por teclado con foco devuelto =====
await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find((b) =>
    b.getAttribute("aria-label")?.includes("Menú de ERP"),
  );
  btn?.focus();
});
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
const menuOpen = await page.evaluate(() => !!document.querySelector(".menu"));
const menuFocused = await page.evaluate(() =>
  document.querySelector(".menu")?.contains(document.activeElement),
);
await page.screenshot({ path: "/tmp/tambo-menu-teclado.png" });
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
const menuClosed = await page.evaluate(() => !document.querySelector(".menu"));
const focusReturned = await page.evaluate(() =>
  document.activeElement?.getAttribute("aria-label")?.includes("Menú de ERP"),
);
console.log(
  "menú abre:",
  menuOpen,
  "| foco en el menú:",
  menuFocused,
  "| Escape cierra:",
  menuClosed,
  "| foco devuelto:",
  focusReturned,
);

// ===== 3. Composición IME: los atajos no interrumpen =====
await page.focus("[data-search-input]");
await page.keyboard.insertText("erp");
const query = await page.evaluate(() => document.querySelector("[data-search-input]")?.value);
console.log("texto en buscador:", query);

// ===== 4. Escape en cascada: buscador con texto se limpia, no navega =====
await page.keyboard.press("Escape");
const queryAfter = await page.evaluate(() => document.querySelector("[data-search-input]")?.value);
console.log("Escape limpia la búsqueda:", queryAfter === "");

// ===== 5. Los botones de acción no anidan en el enlace =====
const nesting = await page.evaluate(() => !!document.querySelector("a button, a .card-action-btn"));
console.log("botones anidados dentro de enlaces:", nesting);

await browser.close();
console.log("verificación de comportamiento lista");
