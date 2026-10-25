import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { configSchema, type TamboConfig } from "../src/schema";

export type ReadResult =
  | { ok: true; config: TamboConfig; etag: string }
  | { ok: false; code: "missing" | "invalid"; message: string; etag: string | null };

/** Lee, valida y escribe data/apps.json con escritura atómica y copia .bak. */
export class ConfigStore {
  readonly file: string;

  constructor(dataDir: string) {
    this.file = join(dataDir, "apps.json");
  }

  private etagOf(raw: string): string {
    return `"${createHash("sha256").update(raw).digest("hex").slice(0, 32)}"`;
  }

  async readRaw(): Promise<{ raw: string; etag: string } | null> {
    try {
      const raw = await readFile(this.file, "utf8");
      return { raw, etag: this.etagOf(raw) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async read(): Promise<ReadResult> {
    const current = await this.readRaw();
    if (!current) {
      return { ok: false, code: "missing", message: "apps.json no existe", etag: null };
    }
    let json: unknown;
    try {
      json = JSON.parse(current.raw);
    } catch (error) {
      return {
        ok: false,
        code: "invalid",
        message: `JSON inválido: ${(error as Error).message}`,
        etag: current.etag,
      };
    }
    const parsed = configSchema.safeParse(json);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const where = first?.path.length ? ` en ${first.path.join(".")}` : "";
      return {
        ok: false,
        code: "invalid",
        message: `esquema inválido${where}: ${first?.message ?? "error desconocido"}`,
        etag: current.etag,
      };
    }
    return { ok: true, config: parsed.data, etag: current.etag };
  }

  async write(next: TamboConfig): Promise<{ etag: string }> {
    const serialized = `${JSON.stringify(next, null, 2)}\n`;
    await mkdir(dirname(this.file), { recursive: true });
    if (await this.readRaw()) {
      await copyFile(this.file, `${this.file}.bak`);
    }
    const tmp = join(dirname(this.file), `.apps.json.${process.pid}.tmp`);
    await writeFile(tmp, serialized, "utf8");
    await rename(tmp, this.file);
    return { etag: this.etagOf(serialized) };
  }
}
