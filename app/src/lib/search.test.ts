import { describe, expect, it } from "vite-plus/test";
import { appSchema, groupSchema, configSchema } from "../schema";
import { appMatches, filterGroups, firstMatch, subsequence } from "./search";

const group = groupSchema.parse({
  id: "elcaliz",
  name: "El Cáliz",
  color: "gold",
  apps: [
    {
      id: "erp",
      name: "ERP",
      description: "Aplicación web del ERP",
      url: "https://erp.elcaliz.lab.andresgaibor.com",
      tags: ["dev"],
    },
    {
      id: "admin",
      name: "Admin de la plataforma",
      url: "https://admin.elcaliz.lab.andresgaibor.com",
    },
  ],
});

const otros = groupSchema.parse({
  id: "herramientas",
  name: "Herramientas",
  color: "teal",
  apps: [{ id: "dmon", name: "Delegation Monitor", url: "https://dmon.lab.andresgaibor.com" }],
});

describe("subsequence", () => {
  it("ignora mayúsculas y tildes", () => {
    expect(subsequence("erp", "ERP")).toBe(true);
    expect(subsequence("caliz", "CÁLIZ")).toBe(true);
  });
  it("exige el orden de los caracteres", () => {
    expect(subsequence("rpe", "erp")).toBe(false);
    expect(subsequence("ep", "erp")).toBe(true);
  });
});

describe("appMatches", () => {
  const app = group.apps[0];
  it("busca por nombre, etiqueta y host", () => {
    expect(appMatches(app, group, "erp")).toBe(true);
    expect(appMatches(app, group, "dev")).toBe(true);
    expect(appMatches(app, group, "elcaliz")).toBe(true);
  });
  it("busca por descripción y por nombre de grupo", () => {
    expect(appMatches(app, group, "web del")).toBe(true);
    expect(appMatches(group.apps[1], group, "caliz")).toBe(true);
  });
  it("no coincide cuando no hay subsecuencia", () => {
    expect(appMatches(app, group, "zzz")).toBe(false);
  });
});

describe("filterGroups", () => {
  it("con query vacío devuelve todo", () => {
    expect(filterGroups([group, otros], "")).toHaveLength(2);
  });
  it("oculta los grupos sin resultados", () => {
    const filtered = filterGroups([group, otros], "delegation");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("herramientas");
  });
  it("conserva solo las apps que coinciden", () => {
    const filtered = filterGroups([group], "admin");
    expect(filtered[0].apps.map((app) => app.id)).toEqual(["admin"]);
  });
});

describe("firstMatch", () => {
  it("devuelve la primera app visible para Enter", () => {
    const config = configSchema.parse({
      version: 1,
      settings: {},
      groups: [group, otros],
    });
    const app = firstMatch(config.groups);
    expect(app?.id).toBe("erp");
    expect(appSchema.safeParse(app).success).toBe(true);
  });
});
