import { describe, expect, it } from "vite-plus/test";
import { HealthService, applyOutcome, matchesExpect } from "./health";
import { configSchema } from "../src/schema";

describe("matchesExpect", () => {
  it("por defecto acepta de 200 a 399", () => {
    expect(matchesExpect(undefined, 200)).toBe(true);
    expect(matchesExpect(undefined, 302)).toBe(true);
    expect(matchesExpect(undefined, 404)).toBe(false);
  });
  it("acepta un código exacto o un rango", () => {
    expect(matchesExpect(204, 204)).toBe(true);
    expect(matchesExpect(204, 200)).toBe(false);
    expect(matchesExpect([500, 599], 503)).toBe(true);
    expect(matchesExpect([500, 599], 200)).toBe(false);
  });
});

describe("applyOutcome", () => {
  const now = "2026-10-24T00:00:00.000Z";

  it("un acierto marca up", () => {
    const track = applyOutcome(undefined, { ok: true, code: 200, ms: 42 }, now);
    expect(track.status).toBe("up");
    expect(track.entry.checkedAt).toBe(now);
  });

  it("un fallo aislado tras estar up no marca down", () => {
    const up = applyOutcome(undefined, { ok: true, code: 200 }, now);
    const one = applyOutcome(up, { ok: false }, now);
    expect(one.status).toBe("up");
  });

  it("dos fallos seguidos marcan down", () => {
    const one = applyOutcome(undefined, { ok: false }, now);
    expect(one.status).toBe("unknown");
    const two = applyOutcome(one, { ok: false }, now);
    expect(two.status).toBe("down");
  });

  it("un acierto reinicia la cuenta de fallos", () => {
    const one = applyOutcome(undefined, { ok: false }, now);
    const up = applyOutcome(one, { ok: true, code: 200 }, now);
    const again = applyOutcome(up, { ok: false }, now);
    expect(again.status).toBe("up");
  });
});

describe("HealthService", () => {
  it("chequea las apps con health.url y expone el snapshot", async () => {
    const config = configSchema.parse({
      version: 1,
      settings: { healthIntervalSec: 10 },
      groups: [
        {
          id: "g",
          name: "G",
          color: "gold",
          apps: [
            {
              id: "up",
              name: "Up",
              url: "https://up.test",
              health: { url: "http://127.0.0.1:1/up" },
            },
            { id: "sin-salud", name: "Sin", url: "https://sin.test" },
          ],
        },
      ],
    });
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const target =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (target.endsWith("/up")) return new Response("ok", { status: 200 });
      throw new Error("inesperado");
    }) as typeof fetch;
    const service = new HealthService({ getConfig: () => config, fetchImpl });
    await service.refresh();
    const snapshot = service.snapshot();
    expect(snapshot["up"]?.status).toBe("up");
    expect(snapshot["sin-salud"]).toBeUndefined();
    service.stop();
  });
});
