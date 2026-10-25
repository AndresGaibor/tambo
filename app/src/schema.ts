import { z } from "zod";

export const GROUP_COLORS = [
  "ember",
  "gold",
  "moss",
  "teal",
  "sky",
  "indigo",
  "violet",
  "rose",
] as const;
export type GroupColor = (typeof GROUP_COLORS)[number];

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug en minúsculas sin espacios");

const httpUrl = z
  .string()
  .url()
  .refine((v) => /^https?:\/\//.test(v), "URL http o https");

export const coverSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("auto") }),
  z.strictObject({ kind: z.literal("emoji"), value: z.string().min(1).max(16) }),
  z.strictObject({ kind: z.literal("svg"), src: z.string().min(1).max(200) }),
  z.strictObject({ kind: z.literal("image"), src: z.string().min(1).max(200) }),
  z.strictObject({ kind: z.literal("shot") }),
]);
export type Cover = z.output<typeof coverSchema>;

export const healthSchema = z.strictObject({
  url: httpUrl,
  expect: z
    .union([
      z.number().int().min(100).max(599),
      z.tuple([z.number().int().min(100).max(599), z.number().int().min(100).max(599)]),
    ])
    .optional(),
});
export type Health = z.output<typeof healthSchema>;

const unitName = z
  .string()
  .regex(/^[A-Za-z0-9@:_\-.]+\.service$/, "nombre de unidad systemd .service");

export const appSchema = z.strictObject({
  id: slug,
  name: z.string().min(1).max(64),
  description: z.string().max(120).optional(),
  url: httpUrl,
  tags: z.array(z.string().min(1).max(24)).max(8).default([]),
  pinned: z.boolean().default(false),
  cover: coverSchema.default({ kind: "auto" }),
  health: healthSchema.optional(),
  // Unidad systemd de usuario que enciende esta app desde el portal.
  service: unitName.optional(),
  // Icono estable de la app: "lucide:<nombre>" o un emoji. La identidad
  // visual prioriza cover svg/image, luego este icono, luego la inicial.
  icon: z.string().max(64).optional(),
});
export type AppEntry = z.output<typeof appSchema>;

export const groupSchema = z.strictObject({
  id: slug,
  name: z.string().min(1).max(64),
  color: z.enum(GROUP_COLORS),
  icon: z.string().max(64).optional(),
  apps: z.array(appSchema).default([]),
});
export type Group = z.output<typeof groupSchema>;

export const settingsSchema = z.strictObject({
  theme: z.enum(["system", "dark", "light"]).default("system"),
  openIn: z.enum(["newTab", "sameWindow"]).default("newTab"),
  healthIntervalSec: z.number().int().min(10).max(300).default(30),
});
export type Settings = z.output<typeof settingsSchema>;

export const configSchema = z
  .strictObject({
    version: z.literal(1),
    settings: settingsSchema,
    groups: z.array(groupSchema).default([]),
  })
  .superRefine((cfg, ctx) => {
    const seen = new Set<string>();
    const check = (id: string, path: (string | number)[]) => {
      if (seen.has(id)) {
        ctx.addIssue({ code: "custom", path, message: `id duplicado en el archivo: ${id}` });
      }
      seen.add(id);
    };
    cfg.groups.forEach((group, gi) => {
      check(group.id, ["groups", gi, "id"]);
      group.apps.forEach((app, ai) => {
        check(app.id, ["groups", gi, "apps", ai, "id"]);
      });
    });
  });
export type TamboConfig = z.output<typeof configSchema>;

/** Todas las apps del archivo, aplanadas, en orden de aparición. */
export function flattenApps(config: TamboConfig): AppEntry[] {
  return config.groups.flatMap((group) => group.apps);
}

/** Busca una app y su grupo por id. */
export function findApp(
  config: TamboConfig,
  appId: string,
): { group: Group; app: AppEntry } | null {
  for (const group of config.groups) {
    const app = group.apps.find((candidate) => candidate.id === appId);
    if (app) return { group, app };
  }
  return null;
}
