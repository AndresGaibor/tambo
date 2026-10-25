import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin, ViteDevServer } from "vite-plus";
import { ConfigStore } from "./config-store";
import {
  MAX_ASSET_BYTES,
  MAX_BODY_BYTES,
  getConfig,
  getHealth,
  getServices,
  postService,
  putConfig,
  refreshHealth,
  resolveStaticPath,
  uploadAsset,
  writeAllowed,
  type ApiResponse,
} from "./handlers";
import { HealthService } from "./health";
import { runServiceAction, servicesSnapshot, unitFor } from "./services";
import { StatsKeeper, type MachineStats } from "./stats";
import type { ServiceEntry } from "./services";
import type { TamboConfig } from "../src/schema";

function send(res: ServerResponse, api: ApiResponse): void {
  const headers = { "Content-Type": "application/json; charset=utf-8", ...api.headers };
  res.statusCode = api.status;
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  res.end(JSON.stringify(api.body));
}

function readBody(req: IncomingMessage, limit: number): Promise<Buffer | "too-large" | null> {
  return new Promise((settled) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        req.destroy();
        settled("too-large");
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => settled(Buffer.concat(chunks)));
    req.on("error", () => settled(null));
  });
}

/**
 * Plugin de Tambo: la API y los estáticos de data/ viven en el propio
 * servidor de desarrollo de Vite. Los manejadores son funciones puras en
 * handlers.ts para poder moverlos a un servicio aparte sin reescribirlos.
 */
export function tamboPlugin(): Plugin {
  return {
    name: "tambo-portal",
    configureServer(server: ViteDevServer) {
      const dataDir = process.env.TAMBO_DATA_DIR ?? resolve(process.cwd(), "../data");
      const store = new ConfigStore(dataDir);
      let latest: TamboConfig | null = null;

      const reload = async () => {
        const result = await store.read();
        latest = result.ok ? result.config : null;
        return result;
      };

      const health = new HealthService({ getConfig: () => latest });
      const stats = new StatsKeeper();
      // Estado de unidades + recursos: la lectura de cgroups comparte el
      // systemctl que ya resuelve ActiveState y ControlGroup por unidad.
      const snapshotWithStats = async (
        config: TamboConfig | null,
      ): Promise<{ services: Record<string, ServiceEntry>; machine: MachineStats | null }> => {
        const { services } = await servicesSnapshot(config);
        const cgroups = [
          ...new Set(
            Object.values(services)
              .map((entry) => entry.cgroup)
              .filter((cgroup): cgroup is string => !!cgroup),
          ),
        ];
        const usage = await stats.usage(cgroups);
        for (const entry of Object.values(services)) {
          if (!entry.cgroup) continue;
          const sample = usage.get(entry.cgroup);
          if (sample) {
            entry.memoryBytes = sample.memoryBytes;
            entry.cpuPercent = sample.cpuPercent;
          }
        }
        return { services, machine: await stats.machine() };
      };
      // Primer chequeo inmediato al arrancar; luego, cada healthIntervalSec.
      void reload().then(() => {
        health.start();
        void health.refresh();
      });
      server.httpServer?.on("close", () => health.stop());

      // Actualización en vivo: cualquier cambio de apps.json, venga de la
      // API o de una edición a mano, avisa a todos los clientes por HMR.
      server.watcher.add(store.file);
      const onFileChange = (changed: string) => {
        if (resolve(changed) !== store.file) return;
        void reload().then((result) => {
          server.ws.send("tambo:config", { etag: result.etag });
        });
      };
      server.watcher.on("change", onFileChange);
      server.watcher.on("add", onFileChange);
      server.watcher.on("unlink", onFileChange);

      server.middlewares.use((req, res, next) => {
        void (async () => {
          // Path crudo, sin normalizar: new URL() resolvería los segmentos
          // ".." antes de que el guardián de estáticos pudiera verlos.
          const raw = req.url ?? "/";
          const queryAt = raw.indexOf("?");
          const path = queryAt >= 0 ? raw.slice(0, queryAt) : raw;
          const params = new URLSearchParams(queryAt >= 0 ? raw.slice(queryAt + 1) : "");
          const method = req.method ?? "GET";
          const guardHeaders = {
            origin: req.headers.origin ?? null,
            host: req.headers.host ?? null,
            xTambo: (req.headers["x-tambo"] as string | undefined) ?? null,
            secure: String(req.headers["x-forwarded-proto"] ?? "").includes("https"),
          };

          if (path === "/api/config") {
            if (method === "GET") {
              send(res, await getConfig(store));
              return;
            }
            if (method === "PUT") {
              const body = await readBody(req, MAX_BODY_BYTES);
              if (body === "too-large") {
                send(res, { status: 413, body: { error: "cuerpo mayor a 1 MB" } });
                return;
              }
              if (body === null) {
                send(res, { status: 400, body: { error: "no se pudo leer el cuerpo" } });
                return;
              }
              send(
                res,
                await putConfig(store, {
                  body: body.toString("utf8"),
                  ifMatch: (req.headers["if-match"] as string | undefined) ?? null,
                  ...guardHeaders,
                }),
              );
              return;
            }
          }

          if (path === "/api/health" && method === "GET") {
            send(res, getHealth(health));
            return;
          }

          if (path === "/api/health/refresh" && method === "POST") {
            send(res, refreshHealth(health));
            return;
          }

          if (path === "/api/assets" && method === "POST") {
            if (guardHeaders.xTambo !== "1") {
              send(res, { status: 403, body: { error: "falta la cabecera X-Tambo: 1" } });
              return;
            }
            const raw = await readBody(req, MAX_ASSET_BYTES);
            if (raw === "too-large") {
              send(res, { status: 413, body: { error: "archivo mayor a 2 MB" } });
              return;
            }
            if (!raw || !Buffer.isBuffer(raw)) {
              send(res, { status: 400, body: { error: "no se pudo leer el cuerpo" } });
              return;
            }
            send(
              res,
              await uploadAsset(dataDir, {
                name: params.get("name"),
                contentType: req.headers["content-type"] ?? null,
                body: raw,
              }),
            );
            return;
          }

          if (path.startsWith("/api/shots/") && method === "POST") {
            send(res, { status: 501, body: { error: "capturas llegan en la fase 3" } });
            return;
          }

          const staticMatch = /^\/(shots|assets)\/(.+)$/.exec(path);
          if (staticMatch && (method === "GET" || method === "HEAD")) {
            const resolved = resolveStaticPath(dataDir, staticMatch[1], staticMatch[2]);
            if (!resolved.ok) {
              send(res, { status: resolved.status, body: { error: "no encontrado" } });
              return;
            }
            const info = await stat(resolved.abs).catch(() => null);
            if (!info?.isFile()) {
              send(res, { status: 404, body: { error: "no encontrado" } });
              return;
            }
            res.statusCode = 200;
            res.setHeader("Content-Type", resolved.type);
            res.setHeader("Content-Length", info.size);
            res.setHeader("Cache-Control", resolved.cache);
            if (method === "HEAD") {
              res.end();
              return;
            }
            const stream = createReadStream(resolved.abs);
            stream.on("error", () => {
              if (!res.headersSent) res.statusCode = 500;
              res.end();
            });
            stream.pipe(res);
            return;
          }

          if (path === "/api/services" && method === "GET") {
            send(
              res,
              await getServices({
                getConfig: () => latest,
                snapshot: snapshotWithStats,
              }),
            );
            return;
          }

          if (path.startsWith("/api/")) {
            const serviceMatch = /^\/api\/services\/([a-z0-9-]+)$/.exec(path);
            if (serviceMatch && method === "POST") {
              if (!writeAllowed(guardHeaders)) {
                send(res, { status: 403, body: { error: "petición de escritura no permitida" } });
                return;
              }
              const raw = await readBody(req, MAX_BODY_BYTES);
              if (!Buffer.isBuffer(raw)) {
                send(res, { status: 400, body: { error: "no se pudo leer el cuerpo" } });
                return;
              }
              let action: unknown;
              try {
                action = JSON.parse(raw.toString("utf8")).action;
              } catch {
                action = null;
              }
              send(
                res,
                await postService({
                  getConfig: () => latest,
                  unitFor,
                  runAction: runServiceAction,
                  action,
                  appId: serviceMatch[1],
                }),
              );
              return;
            }
            send(res, { status: 404, body: { error: "ruta desconocida" } });
            return;
          }

          next();
        })().catch((error) => {
          server.config.logger.error(`tambo: ${(error as Error).message}`);
          if (!res.headersSent) send(res, { status: 500, body: { error: "error interno" } });
        });
      });
    },
  };
}
