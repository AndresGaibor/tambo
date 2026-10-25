import { describe, expect, it } from "vite-plus/test";
import { StatsKeeper, cpuPercentOfMachine, machineCpuPercent } from "./stats";

describe("cpuPercentOfMachine", () => {
  it("un núcleo entero durante un segundo es el 100% en una VM de un núcleo", () => {
    expect(cpuPercentOfMachine(1_000_000, 1_000, 1)).toBe(100);
  });
  it("se reparte entre todos los núcleos", () => {
    expect(cpuPercentOfMachine(1_000_000, 1_000, 4)).toBe(25);
  });
  it("sin tiempo transcurrido no divide por cero", () => {
    expect(cpuPercentOfMachine(1_000, 0, 4)).toBe(0);
  });
});

describe("machineCpuPercent", () => {
  it("calcula el uso por delta de contadores", () => {
    expect(machineCpuPercent({ total: 100, idle: 50 }, { total: 200, idle: 100 })).toBe(50);
    expect(machineCpuPercent({ total: 100, idle: 50 }, { total: 200, idle: 50 })).toBe(100);
  });
  it("sin delta devuelve null", () => {
    expect(machineCpuPercent({ total: 100, idle: 50 }, { total: 100, idle: 50 })).toBeNull();
  });
});

describe("StatsKeeper", () => {
  it("primera lectura sin CPU; la segunda calcula el delta", async () => {
    let clock = 10_000;
    let cpuUsec = 5_000_000_000;
    const keeper = new StatsKeeper({
      readCgroup: async () => ({ memoryBytes: 3_000_000_000, cpuUsec }),
      readMachine: async () => ({
        total: 1_000,
        idle: 500,
        memTotal: 24 * 1024 ** 3,
        memAvailable: 12 * 1024 ** 3,
        load1: 1.5,
      }),
      clock: () => clock,
      cores: 4,
    });

    const first = await keeper.usage(["/user.slice/x.service"]);
    expect(first.get("/user.slice/x.service")).toEqual({
      memoryBytes: 3_000_000_000,
      cpuPercent: null,
    });

    // 15 s después consumió 4 s de CPU: 4/(15*4) = 6.7%
    clock += 15_000;
    cpuUsec += 4_000_000;
    const second = await keeper.usage(["/user.slice/x.service"]);
    expect(second.get("/user.slice/x.service")?.memoryBytes).toBe(3_000_000_000);
    expect(second.get("/user.slice/x.service")?.cpuPercent).toBeCloseTo(6.7, 1);

    const machine = await keeper.machine();
    expect(machine).toMatchObject({
      cores: 4,
      memoryTotalBytes: 24 * 1024 ** 3,
      memoryUsedBytes: 12 * 1024 ** 3,
      load1: 1.5,
    });
  });

  it("olvida unidades que dejaron de venir", async () => {
    let clock = 0;
    const keeper = new StatsKeeper({
      readCgroup: async () => ({ memoryBytes: 1, cpuUsec: 1 }),
      readMachine: async () => null,
      clock: () => clock,
    });
    await keeper.usage(["/a.service", "/b.service"]);
    clock += 1_000;
    const kept = await keeper.usage(["/a.service"]);
    expect([...kept.keys()]).toEqual(["/a.service"]);
  });
});
