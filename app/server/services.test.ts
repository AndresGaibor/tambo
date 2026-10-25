import { describe, expect, it } from "vite-plus/test";
import { configSchema } from "../src/schema";
import { getServices, postService } from "./handlers";
import { unitFor } from "./services";

const config = configSchema.parse({
  version: 1,
  settings: {},
  groups: [
    {
      id: "g",
      name: "G",
      color: "gold",
      apps: [
        { id: "erp", name: "ERP", url: "https://erp.test", service: "stack.service" },
        { id: "admin", name: "Admin", url: "https://admin.test", service: "stack.service" },
        { id: "titula", name: "Titula", url: "https://titula.test" },
      ],
    },
  ],
});

describe("unitFor", () => {
  it("resuelve la unidad declarada en apps.json", () => {
    expect(unitFor(config, "erp")).toBe("stack.service");
  });
  it("devuelve null para apps sin service o desconocidas", () => {
    expect(unitFor(config, "titula")).toBeNull();
    expect(unitFor(config, "no-existe")).toBeNull();
    expect(unitFor(null, "erp")).toBeNull();
  });
});

describe("getServices", () => {
  it("consulta una sola vez las unidades compartidas", async () => {
    const consultadas: string[] = [];
    const response = await getServices({
      getConfig: () => config,
      snapshot: async (cfg) => {
        const services: Record<string, { unit: string; state: string }> = {};
        for (const group of cfg?.groups ?? []) {
          for (const app of group.apps) {
            if (!app.service) continue;
            if (!consultadas.includes(app.service)) consultadas.push(app.service);
            services[app.id] = { unit: app.service, state: "active" };
          }
        }
        return { services, machine: null };
      },
    });
    expect(response.status).toBe(200);
    const body = response.body as { services: Record<string, { unit: string }> };
    expect(body.services["erp"].unit).toBe("stack.service");
    expect(body.services["titula"]).toBeUndefined();
    expect(consultadas).toEqual(["stack.service"]);
  });
});

describe("postService", () => {
  const deps = {
    getConfig: () => config,
    unitFor: (cfg: Parameters<typeof unitFor>[0], appId: string) => unitFor(cfg, appId),
  };

  it("rechaza acciones distintas de start y stop", async () => {
    const response = await postService({
      ...deps,
      runAction: async () => ({ state: "" }),
      action: "restart",
      appId: "erp",
    });
    expect(response.status).toBe(400);
  });

  it("404 si la app no declara service: nunca se aceptan unidades del cliente", async () => {
    const response = await postService({
      ...deps,
      runAction: async () => ({ state: "" }),
      action: "start",
      appId: "titula",
    });
    expect(response.status).toBe(404);
  });

  it("enciende la unidad declarada y devuelve su estado", async () => {
    const llamadas: string[][] = [];
    const response = await postService({
      ...deps,
      runAction: async (unit, action) => {
        llamadas.push([unit, action]);
        return { state: "activating" };
      },
      action: "start",
      appId: "admin",
    });
    expect(response.status).toBe(200);
    expect(llamadas).toEqual([["stack.service", "start"]]);
    expect(response.body).toMatchObject({ ok: true, unit: "stack.service", state: "activating" });
  });

  it("500 con mensaje si systemctl falla", async () => {
    const response = await postService({
      ...deps,
      runAction: async () => {
        throw new Error("bus no disponible");
      },
      action: "stop",
      appId: "erp",
    });
    expect(response.status).toBe(500);
  });
});

describe("schema: campo service", () => {
  it("acepta un nombre de unidad .service y rechaza cualquier otra cosa", () => {
    const base: {
      version: number;
      settings: object;
      groups: { id: string; name: string; color: string; apps: Array<Record<string, unknown>> }[];
    } = {
      version: 1,
      settings: {},
      groups: [
        {
          id: "g",
          name: "G",
          color: "gold",
          apps: [{ id: "a", name: "A", url: "https://a.test" }],
        },
      ],
    };
    const conUnidad = structuredClone(base);
    conUnidad.groups[0].apps[0].service = "mi-app.service";
    expect(configSchema.safeParse(conUnidad).success).toBe(true);
    const conTravesura = structuredClone(base);
    conTravesura.groups[0].apps[0].service = "/bin/xd; rm -rf";
    expect(configSchema.safeParse(conTravesura).success).toBe(false);
  });
});
