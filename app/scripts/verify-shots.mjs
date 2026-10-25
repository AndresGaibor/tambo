// Capturas y comprobaciones de verificación para Tambo.
// Uso: node scripts/verify-shots.mjs <url> <prefijo>
// Usa el Playwright ya presente en la VM; no es una dependencia del proyecto.
import { chromium } from "/home/ubuntu/onlook/node_modules/playwright/index.mjs";

const [url = "https://oracle.tail4a8b59.ts.net:15171/", prefix = "/tmp/tambo"] =
  process.argv.slice(2);

const browser = await chromium.launch({
  executablePath: "/home/ubuntu/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome",
});
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
await page.waitForTimeout(1_500);

const setTheme = (theme) =>
  page.evaluate((t) => {
    document.documentElement.setAttribute("data-theme", t);
    try {
      localStorage.setItem("tambo.theme", t);
    } catch {}
  }, theme);

// ===== Temas =====
await setTheme("dark");
await page.waitForTimeout(300);
await page.screenshot({ path: `${prefix}-dark-1440.png` });
await setTheme("light");
await page.waitForTimeout(300);
await page.screenshot({ path: `${prefix}-light-1440.png` });

// ===== Vista portadas =====
await setTheme("dark");
await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find((b) =>
    b.getAttribute("aria-label")?.startsWith("Vista: Compacta"),
  );
  btn?.click();
});
await page.waitForTimeout(400);
await page.screenshot({ path: `${prefix}-covers-dark-1440.png` });

// ===== Búsqueda con resultados y sin ellos =====
await page.fill("[data-search-input]", "erp");
await page.waitForTimeout(400);
await page.screenshot({ path: `${prefix}-search-erp.png` });
await page.fill("[data-search-input]", "zzzz");
await page.waitForTimeout(400);
await page.screenshot({ path: `${prefix}-search-empty.png` });
await page.fill("[data-search-input]", "");

// ===== Panel de detalles =====
await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find((b) =>
    b.getAttribute("aria-label")?.includes("Detalles de ERP"),
  );
  btn?.click();
});
await page.waitForTimeout(500);
await page.screenshot({ path: `${prefix}-details.png` });
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

// ===== Panel Servidor OCI =====
await page.evaluate(() => {
  const btn = document.querySelector(".machine-btn");
  btn?.click();
});
await page.waitForTimeout(400);
await page.screenshot({ path: `${prefix}-server-pop.png` });
await page.keyboard.press("Escape");
await page.waitForTimeout(200);

// ===== Otros tamaños (oscuro) =====
for (const [w, h, name] of [
  [1280, 800, "1280"],
  [1024, 768, "1024"],
  [390, 844, "390"],
]) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${prefix}-${name}.png` });
}

// ===== Zoom 200% (720x450 lógico equivale a 1440x900 al doble) =====
await page.setViewportSize({ width: 720, height: 450 });
await page.waitForTimeout(400);
await page.screenshot({ path: `${prefix}-zoom200.png` });

// ===== Desplazamiento horizontal prohibido =====
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
console.log("overflow-x px:", overflow);

// ===== Teclado: primer foco y atajo / =====
await page.setViewportSize({ width: 1440, height: 900 });
await page.keyboard.press("Tab");
const firstFocus = await page.evaluate(() => document.activeElement?.textContent?.slice(0, 30));
await page.keyboard.press("/");
const searchFocused = await page.evaluate(
  () => document.activeElement === document.querySelector("[data-search-input]"),
);
console.log("primer Tab:", JSON.stringify(firstFocus), "| / enfoca búsqueda:", searchFocused);

await browser.close();
console.log("capturas y comprobaciones listas");
