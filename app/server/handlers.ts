import { mkdir, writeFile } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";
import { configSchema } from "../src/schema";
import type { ConfigStore } from "./config-store";
import type { HealthService } from "./health";

export const MAX_BODY_BYTES = 1024 * 1024;
export const MAX_ASSET_BYTES = 2 * 1024 * 1024;

export type ApiResponse = {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
};

const noCache = { "Cache-Control": "no-cache" };

export async function getConfig(store: ConfigStore): Promise<ApiResponse> {
  const result = await store.read();
  if (result.ok) {
    return { status: 200, body: result.config, headers: { ETag: result.etag, ...noCache } };
  }
  return { status: result.code === "missing" ? 500 : 422, body: { error: result.message } };
}

export type PutInput = {
  body: string;
  ifMatch?: string | null;
  origin?: string | null;
  host?: string | null;
  xTambo?: string | null;
  secure?: boolean;
};

/**
 * Reemplaza apps.json. Exige X-Tambo: 1, Origin del propio portal e
 * If-Match con el ETag vigente (428 si falta, 412 si cambió, 422 si el
 * cuerpo no valida y entonces el archivo queda intacto).
 */
export async function putConfig(store: ConfigStore, input: PutInput): Promise<ApiResponse> {
  if (input.xTambo !== "1") {
    return { status: 403, body: { error: "falta la cabecera X-Tambo: 1" } };
  }
  const scheme = input.secure ? "https" : "http";
  const allowed = input.host ? [`${scheme}://${input.host}`, `http://${input.host}`] : [];
  if (!input.origin || !allowed.includes(input.origin)) {
    return { status: 403, body: { error: "origin no permitido" } };
  }
  if (Buffer.byteLength(input.body) > MAX_BODY_BYTES) {
    return { status: 413, body: { error: "cuerpo mayor a 1 MB" } };
  }
  const current = await store.readRaw();
  if (!current) {
    return { status: 500, body: { error: "apps.json no existe" } };
  }
  const ifMatch = input.ifMatch?.trim().replace(/^W\//, "");
  if (!ifMatch) {
    return { status: 428, body: { error: "If-Match requerido" } };
  }
  if (ifMatch !== current.etag && ifMatch !== current.etag.replaceAll('"', "")) {
    return { status: 412, body: { error: "la configuración cambió en el servidor" } };
  }
  let json: unknown;
  try {
    json = JSON.parse(input.body);
  } catch {
    return { status: 400, body: { error: "JSON inválido" } };
  }
  const parsed = configSchema.safeParse(json);
  if (!parsed.success) {
    return {
      status: 422,
      body: {
        error: "esquema inválido",
        issues: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
      },
    };
  }
  const { etag } = await store.write(parsed.data);
  return { status: 200, body: { etag }, headers: { ETag: etag, ...noCache } };
}

export function getHealth(service: HealthService): ApiResponse {
  return { status: 200, body: service.snapshot(), headers: noCache };
}

export function refreshHealth(service: HealthService): ApiResponse {
  void service.refresh();
  return { status: 202, body: { ok: true } };
}

const STATIC_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

const STATIC_KINDS = new Set(["shots", "assets"]);

/** Resuelve una ruta estática dentro de data/<kind>/ con lista cerrada de extensiones. */
export function resolveStaticPath(
  dataDir: string,
  kind: string,
  rel: string,
): { ok: true; abs: string; type: string; cache: string } | { ok: false; status: 404 | 403 } {
  if (!STATIC_KINDS.has(kind)) return { ok: false, status: 404 };
  let decoded: string;
  try {
    decoded = decodeURIComponent(rel);
  } catch {
    return { ok: false, status: 404 };
  }
  const base = resolve(dataDir, kind);
  const abs = resolve(base, decoded);
  if (abs !== base && !abs.startsWith(base + sep)) return { ok: false, status: 403 };
  if (decoded.split("/").some((part) => part === ".." || part === "")) {
    return { ok: false, status: 404 };
  }
  const name = basename(abs).toLowerCase();
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return { ok: false, status: 404 };
  const type = STATIC_TYPES[name.slice(dot)];
  if (!type) return { ok: false, status: 404 };
  return {
    ok: true,
    abs,
    type,
    cache: kind === "shots" ? "public, max-age=60" : "public, max-age=3600",
  };
}

const ASSET_EXT: Record<string, string> = {
  "image/svg+xml": "svg",
  "image/png": "png",
  "image/webp": "webp",
};

function sniffAsset(ext: string, body: Buffer): boolean {
  if (ext === "svg") return body.slice(0, 512).toString("utf8").includes("<svg");
  if (ext === "png") return body.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  if (ext === "webp") {
    return (
      body.subarray(0, 4).toString("ascii") === "RIFF" &&
      body.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }
  return false;
}

/**
 * Fase 2: sube un SVG, PNG o WebP de hasta 2 MB para data/assets/.
 * El nombre llega en ?name= y se normaliza a slug.ext.
 */
export async function uploadAsset(
  dataDir: string,
  input: { name?: string | null; contentType?: string | null; body: Buffer },
): Promise<ApiResponse> {
  if (input.body.byteLength > MAX_ASSET_BYTES) {
    return { status: 413, body: { error: "archivo mayor a 2 MB" } };
  }
  const match = /^([\w-]+)\.(svg|png|webp)$/i.exec(input.name?.trim() ?? "");
  if (!match) {
    return { status: 400, body: { error: "nombre esperado: slug con extensión svg, png o webp" } };
  }
  const ext = match[2].toLowerCase();
  const slug = match[1].toLowerCase();
  if (input.contentType && ASSET_EXT[input.contentType.split(";")[0].trim()] !== ext) {
    return { status: 415, body: { error: "content-type no coincide con la extensión" } };
  }
  if (!sniffAsset(ext, input.body)) {
    return { status: 415, body: { error: "el contenido no parece un SVG, PNG o WebP" } };
  }
  const filename = `${slug}.${ext}`;
  const dir = join(dataDir, "assets");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), input.body);
  return { status: 201, body: { src: filename }, headers: { Location: `/assets/${filename}` } };
}
