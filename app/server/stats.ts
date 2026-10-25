import { readFile } from "node:fs/promises";
import { cpus } from "node:os";

/**
 * Recursos por unidad systemd leyendo su cgroup v2: memoria anon (RAM real)
 * y CPU como porcentaje del total de la VM, por delta entre muestreos.
 */

export type MachineStats = {
  cores: number;
  cpuPercent: number | null;
  memoryTotalBytes: number;
  memoryUsedBytes: number;
  load1: number;
};

export type CgroupSample = { memoryBytes: number | null; cpuUsec: number | null };
export type CgroupUsage = { memoryBytes: number | null; cpuPercent: number | null };
export type MachineCounters = {
  total: number;
  idle: number;
  memTotal: number;
  memAvailable: number;
  load1: number;
};

/** CPU consumida como % de la capacidad total de la máquina. */
export function cpuPercentOfMachine(deltaUsec: number, elapsedMs: number, cores: number): number {
  if (elapsedMs <= 0 || cores <= 0) return 0;
  const cpuSeconds = deltaUsec / 1e6;
  const wallSeconds = elapsedMs / 1000;
  return Math.max(0, (cpuSeconds / (wallSeconds * cores)) * 100);
}

/** CPU global por delta de contadores de /proc/stat. */
export function machineCpuPercent(
  prev: { total: number; idle: number },
  current: { total: number; idle: number },
): number | null {
  const totalDelta = current.total - prev.total;
  if (totalDelta <= 0) return null;
  const idleDelta = current.idle - prev.idle;
  return Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100));
}

async function readNumbers(path: string): Promise<Map<string, number>> {
  const values = new Map<string, number>();
  try {
    const raw = await readFile(path, "utf8");
    for (const line of raw.split("\n")) {
      const [key, value] = line.split(/\s+/);
      const parsed = Number(value);
      if (key && Number.isFinite(parsed)) values.set(key, parsed);
    }
  } catch {
    // cgroup inexistente o sin permiso: sin datos
  }
  return values;
}

async function readCgroup(cgroup: string): Promise<CgroupSample | null> {
  const base = `/sys/fs/cgroup${cgroup}`;
  const [memoryStat, memoryCurrent, cpuStat] = await Promise.all([
    readNumbers(`${base}/memory.stat`),
    readNumbers(`${base}/memory.current`),
    readNumbers(`${base}/cpu.stat`),
  ]);
  if (memoryStat.size + memoryCurrent.size + cpuStat.size === 0) return null;
  // anon es la RAM real del árbol de procesos; cae a memory.current (incluye caché).
  const memoryBytes = memoryStat.get("anon") ?? memoryCurrent.get("current") ?? null;
  return { memoryBytes, cpuUsec: cpuStat.get("usage_usec") ?? null };
}

async function readMachineCounters(): Promise<MachineCounters | null> {
  try {
    const [stat, meminfo, loadavg] = await Promise.all([
      readFile("/proc/stat", "utf8"),
      readFile("/proc/meminfo", "utf8"),
      readFile("/proc/loadavg", "utf8"),
    ]);
    const fields = stat.split("\n")[0].split(/\s+/).slice(1).map(Number);
    const total = fields
      .slice(0, 8)
      .reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
    const idle = (fields[3] ?? 0) + (fields[4] ?? 0);
    const memTotal = Number(/MemTotal:\s+(\d+)/.exec(meminfo)?.[1] ?? 0) * 1024;
    const memAvailable = Number(/MemAvailable:\s+(\d+)/.exec(meminfo)?.[1] ?? 0) * 1024;
    const load1 = Number(loadavg.split(/\s+/)[0]);
    if (!memTotal) return null;
    return { total, idle, memTotal, memAvailable, load1 };
  } catch {
    return null;
  }
}

export class StatsKeeper {
  private readonly readCgroupImpl: (cgroup: string) => Promise<CgroupSample | null>;
  private readonly readMachineImpl: () => Promise<MachineCounters | null>;
  private readonly clock: () => number;
  private readonly cores: number;
  private unitPrev = new Map<string, { cpuUsec: number; at: number }>();
  private machinePrev: { total: number; idle: number } | null = null;

  constructor(deps?: {
    readCgroup?: (cgroup: string) => Promise<CgroupSample | null>;
    readMachine?: () => Promise<MachineCounters | null>;
    clock?: () => number;
    cores?: number;
  }) {
    this.readCgroupImpl = deps?.readCgroup ?? readCgroup;
    this.readMachineImpl = deps?.readMachine ?? readMachineCounters;
    this.clock = deps?.clock ?? Date.now;
    this.cores = deps?.cores ?? cpus().length;
  }

  async usage(cgroups: string[]): Promise<Map<string, CgroupUsage>> {
    const now = this.clock();
    const result = new Map<string, CgroupUsage>();
    for (const cgroup of cgroups) {
      const sample = await this.readCgroupImpl(cgroup);
      const prev = this.unitPrev.get(cgroup);
      let cpuPercent: number | null = null;
      if (sample?.cpuUsec != null && prev && now > prev.at) {
        cpuPercent = cpuPercentOfMachine(sample.cpuUsec - prev.cpuUsec, now - prev.at, this.cores);
      }
      if (sample) {
        result.set(cgroup, { memoryBytes: sample.memoryBytes, cpuPercent });
        this.unitPrev.set(cgroup, { cpuUsec: sample.cpuUsec ?? 0, at: now });
      }
    }
    const muertos = [...this.unitPrev.keys()].filter((cgroup) => !cgroups.includes(cgroup));
    for (const cgroup of muertos) this.unitPrev.delete(cgroup);
    return result;
  }

  async machine(): Promise<MachineStats | null> {
    const counters = await this.readMachineImpl();
    if (!counters) return null;
    const prev = this.machinePrev;
    this.machinePrev = { total: counters.total, idle: counters.idle };
    return {
      cores: this.cores,
      cpuPercent: prev ? machineCpuPercent(prev, counters) : null,
      memoryTotalBytes: counters.memTotal,
      memoryUsedBytes: counters.memTotal - counters.memAvailable,
      load1: counters.load1,
    };
  }
}
