import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { configSchema } from "../src/schema";
import { ConfigStore } from "./config-store";
import { getConfig, putConfig, resolveStaticPath } from "./handlers";

const base = configSchema.parse({
  version: 1,
  settings: {},
  groups: [
    {
      id: "g1",
      name: "G1",
      color: "gold",
      apps: [
        { id: "a1", name: "A1", url: "https://a.test", health: { url: "http://127.0.0.1:1" } },
      ],
    },
  ],
});

let dir: string;
let store: ConfigStore;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "tambo-test-"));
  store = new ConfigStore(dir);
  await writeFile(store.file, JSON.stringify(base));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const etag = async () => (await store.readRaw())!.etag;

async function put(overrides: Partial<Parameters<typeof putConfig>[1]>) {
  const input = {
    body: JSON.stringify(base),
    ifMatch: await etag(),
    origin: "https://tambo.lab.andresgaibor.com",
    host: "tambo.lab.andresgaibor.com",
    xTambo: "1",
    secure: true,
    ...overrides,
  };
  return putConfig(store, input);
}

describe("getConfig", () => {
  it("devuelve la configuración validada con ETag", async () => {
    const response = await getConfig(store);
    expect(response.status).toBe(200);
    expect(response.headers?.ETag).toBeTruthy();
  });
});

describe("putConfig", () => {
  it("un cuerpo inválido no modifica el archivo", async () => {
    const before = await readFile(store.file, "utf8");
    const response = await put({ body: JSON.stringify({ ...base, version: 2 }) });
    expect(response.status).toBe(422);
    expect(await readFile(store.file, "utf8")).toBe(before);
  });

  it("exige If-Match: 428 si falta y 412 si cambió", async () => {
    expect((await put({ ifMatch: null })).status).toBe(428);
    expect((await put({ ifMatch: '"caduco"' })).status).toBe(412);
  });

  it("exige X-Tambo y un Origin del propio portal", async () => {
    expect((await put({ xTambo: null })).status).toBe(403);
    expect((await put({ origin: "https://ajeno.test" })).status).toBe(403);
  });

  it("rechaza cuerpos mayores a 1 MB", async () => {
    const big = "x".repeat(1024 * 1024 + 1);
    expect((await put({ body: big })).status).toBe(413);
  });

  it("un PUT válido escribe, deja copia .bak y devuelve el nuevo ETag", async () => {
    const antes = await etag();
    const changed = structuredClone(base);
    changed.groups[0].apps[0].name = "Renombrada";
    const response = await put({ body: JSON.stringify(changed) });
    expect(response.status).toBe(200);
    const saved = JSON.parse(await readFile(store.file, "utf8"));
    expect(saved.groups[0].apps[0].name).toBe("Renombrada");
    expect(existsSync(`${store.file}.bak`)).toBe(true);
    const { etag: nuevo } = response.body as { etag: string };
    expect(nuevo).not.toBe(antes);
    expect((await store.readRaw())!.etag).toBe(nuevo);
  });
});

describe("resolveStaticPath", () => {
  it("sirve un webp de shots con su tipo", () => {
    const resolved = resolveStaticPath(dir, "shots", "app-1.webp");
    expect(resolved.ok).toBe(true);
  });

  it("rechaza salir de la carpeta", () => {
    expect(resolveStaticPath(dir, "assets", "../apps.json").ok).toBe(false);
    expect(resolveStaticPath(dir, "assets", "%2e%2e/apps.json").ok).toBe(false);
    expect(resolveStaticPath(dir, "assets", "/etc/passwd").ok).toBe(false);
  });

  it("solo acepta extensiones de la lista cerrada", () => {
    expect(resolveStaticPath(dir, "assets", "x.txt").ok).toBe(false);
    expect(resolveStaticPath(dir, "assets", "logo.svg").ok).toBe(true);
  });
});
