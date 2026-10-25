import { describe, expect, it } from "vite-plus/test";
import { fmtBytes, fmtCpu } from "./format";

describe("fmtBytes", () => {
  it("usa GB con un decimal a partir del GiB", () => {
    expect(fmtBytes(3_313_725_440)).toBe("3.1 GB");
    expect(fmtBytes(1024 ** 3)).toBe("1.0 GB");
  });
  it("usa MB y KB redondeados por debajo", () => {
    expect(fmtBytes(314_572_800)).toBe("300 MB");
    expect(fmtBytes(500_000)).toBe("488 KB");
    expect(fmtBytes(512)).toBe("512 B");
  });
});

describe("fmtCpu", () => {
  it("con un decimal por debajo de 10 y redondeado por encima", () => {
    expect(fmtCpu(6.66)).toBe("6.7");
    expect(fmtCpu(42.4)).toBe("42");
  });
  it("guion cuando aún no hay muestra", () => {
    expect(fmtCpu(null)).toBe("—");
    expect(fmtCpu(undefined)).toBe("—");
  });
});
