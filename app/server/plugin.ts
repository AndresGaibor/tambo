import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin, ViteDevServer } from "vite-plus";
import type { TamboConfig } from "../src/schema";
import { ConfigStore } from "./config-store";
import {
  MAX_ASSET_BYTES,
  MAX_BODY_BYTES,
  getConfig,
  getHealth,
  putConfig,
  refreshHealth,
  resolveStaticPath,
  uploadAsset,
  type ApiResponse,
} from "./handlers";
import { HealthService } from "./health";

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
      void reload().then(() => health.start());
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
          const url = new URL(req.url ?? "/", "http://tambo.local");
          const path = url.pathname;
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
                name: url.searchParams.get("name"),
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

          if (path.startsWith("/api/")) {
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
