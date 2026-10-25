import { describe, expect, it } from "vite-plus/test";
import { fnv1a, generateCover } from "./cover";

describe("generateCover", () => {
  it("es determinista: mismo id, mismo SVG", () => {
    const a = generateCover({ id: "elcaliz-erp", color: "gold", label: "E" });
    const b = generateCover({ id: "elcaliz-erp", color: "gold", label: "E" });
    expect(a).toBe(b);
  });

  it("cambia con el id y con el color", () => {
    const base = generateCover({ id: "app-1", color: "gold", label: "A" });
    expect(generateCover({ id: "app-2", color: "gold", label: "A" })).not.toBe(base);
    expect(generateCover({ id: "app-1", color: "teal", label: "A" })).not.toBe(base);
  });

  it("usa el color del grupo como variable CSS del tema", () => {
    expect(generateCover({ id: "app-1", color: "teal", label: "A" })).toContain("var(--c-teal)");
  });

  it("cubre las tres variantes del motivo", () => {
    const byVariant = new Map<number, string>();
    for (let i = 0; byVariant.size < 3 && i < 100; i++) {
      const id = `app-${i}`;
      byVariant.set(fnv1a(id) % 3, id);
    }
    expect(byVariant.size).toBe(3);
    const escalonado = generateCover({ id: byVariant.get(0)!, color: "gold", label: "A" });
    const anillos = generateCover({ id: byVariant.get(1)!, color: "gold", label: "A" });
    const reticula = generateCover({ id: byVariant.get(2)!, color: "gold", label: "A" });
    expect(escalonado).toContain("stroke-linecap");
    expect((anillos.match(/<circle/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(reticula).toContain("fill-opacity:0.16");
  });

  it("escapa el texto que se dibuja", () => {
    const svg = generateCover({ id: "app-1", color: "gold", label: "<b>&" });
    expect(svg).toContain("&lt;b&gt;&amp;");
  });

  it("dibuja el emoji más grande que la inicial", () => {
    const emoji = generateCover({ id: "app-1", color: "gold", label: "🛠️" });
    const inicial = generateCover({ id: "app-1", color: "gold", label: "E" });
    expect(emoji).toContain("font-size:64px");
    expect(inicial).toContain("font-size:56px");
  });
});
