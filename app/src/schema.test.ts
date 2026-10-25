import { describe, expect, it } from "vite-plus/test";
import { configSchema } from "./schema";

const valid = {
  version: 1,
  settings: { theme: "system", openIn: "newTab", healthIntervalSec: 30 },
  groups: [
    {
      id: "g1",
      name: "G1",
      color: "gold",
      apps: [{ id: "a1", name: "A1", url: "https://a.test" }],
    },
  ],
};

describe("configSchema", () => {
  it("acepta una configuración válida y aplica los valores por defecto", () => {
    const parsed = configSchema.parse(valid);
    expect(parsed.groups[0].apps[0].pinned).toBe(false);
    expect(parsed.groups[0].apps[0].tags).toEqual([]);
    expect(parsed.groups[0].apps[0].cover).toEqual({ kind: "auto" });
  });

  it("rechaza un campo desconocido para detectar errores de tipeo", () => {
    const result = configSchema.safeParse({
      ...valid,
      groups: [{ ...valid.groups[0], extraneous: true }],
    });
    expect(result.success).toBe(false);
  });

  it("rechaza un color de grupo fuera de la lista", () => {
    const result = configSchema.safeParse({
      ...valid,
      groups: [{ ...valid.groups[0], color: "blue" }],
    });
    expect(result.success).toBe(false);
  });

  it("rechaza URLs que no son http o https", () => {
    const result = configSchema.safeParse({
      ...valid,
      groups: [{ ...valid.groups[0], apps: [{ ...valid.groups[0].apps[0], url: "ftp://a.test" }] }],
    });
    expect(result.success).toBe(false);
  });

  it("rechaza ids duplicados en todo el archivo", () => {
    const result = configSchema.safeParse({
      ...valid,
      groups: [{ ...valid.groups[0], apps: [{ ...valid.groups[0].apps[0], id: "g1" }] }],
    });
    expect(result.success).toBe(false);
  });

  it("rechaza healthIntervalSec fuera del rango de 10 a 300", () => {
    const result = configSchema.safeParse({
      ...valid,
      settings: { ...valid.settings, healthIntervalSec: 5 },
    });
    expect(result.success).toBe(false);
  });

  it("la portada emoji exige value y svg exige src", () => {
    const sinValor = configSchema.safeParse({
      ...valid,
      groups: [
        { ...valid.groups[0], apps: [{ ...valid.groups[0].apps[0], cover: { kind: "emoji" } }] },
      ],
    });
    expect(sinValor.success).toBe(false);
    const conSrc = configSchema.safeParse({
      ...valid,
      groups: [
        {
          ...valid.groups[0],
          apps: [{ ...valid.groups[0].apps[0], cover: { kind: "svg", src: "logo.svg" } }],
        },
      ],
    });
    expect(conSrc.success).toBe(true);
  });

  it("expect acepta un código o un rango de dos cifras", () => {
    const conRango = configSchema.safeParse({
      ...valid,
      groups: [
        {
          ...valid.groups[0],
          apps: [
            {
              ...valid.groups[0].apps[0],
              health: { url: "http://a.test", expect: [200, 399] },
            },
          ],
        },
      ],
    });
    expect(conRango.success).toBe(true);
    const conTexto = configSchema.safeParse({
      ...valid,
      groups: [
        {
          ...valid.groups[0],
          apps: [{ ...valid.groups[0].apps[0], health: { url: "http://a.test", expect: "200" } }],
        },
      ],
    });
    expect(conTexto.success).toBe(false);
  });
});
