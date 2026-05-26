import { describe, it, expect } from "vitest";
import { parseMeshInfo, normalizeObj } from "../client/src/utils/meshParsing";

describe("parseMeshInfo", () => {
  it("parses standard rockinfo output", () => {
    const output = "nodes 163842 tris 327680 x -0.612345 0.587654 y -0.601234 0.598765 z -0.623456 0.576543";
    const info = parseMeshInfo(output);

    expect(info.nodes).toBe(163842);
    expect(info.tris).toBe(327680);
    expect(info.bounds.x[0]).toBeCloseTo(-0.612345);
    expect(info.bounds.x[1]).toBeCloseTo(0.587654);
    expect(info.bounds.y[0]).toBeCloseTo(-0.601234);
    expect(info.bounds.y[1]).toBeCloseTo(0.598765);
    expect(info.bounds.z[0]).toBeCloseTo(-0.623456);
    expect(info.bounds.z[1]).toBeCloseTo(0.576543);
  });

  it("handles scientific notation in bounds", () => {
    const output = "nodes 20 tris 36 x -1.5e+00 1.5e+00 y -1.5e+00 1.5e+00 z -1.5e+00 1.5e+00";
    const info = parseMeshInfo(output);

    expect(info.nodes).toBe(20);
    expect(info.tris).toBe(36);
    expect(info.bounds.x[0]).toBe(-1.5);
    expect(info.bounds.x[1]).toBe(1.5);
  });

  it("returns zeros for malformed output", () => {
    const info = parseMeshInfo("some garbage");
    expect(info.nodes).toBe(0);
    expect(info.tris).toBe(0);
  });
});

describe("normalizeObj", () => {
  it("reorders interleaved vertices and faces", () => {
    const input = [
      "# comment",
      "o mesh",
      "v 1.0 2.0 3.0",
      "v 4.0 5.0 6.0",
      "vn 0.0 1.0 0.0",
      "f 1//1 2 3",
      "v 7.0 8.0 9.0",
      "f 2 3 1",
    ].join("\n");

    const result = normalizeObj(input);
    const lines = result.split("\n").filter((l) => l.trim());

    const vLines = lines.filter((l) => l.startsWith("v "));
    const fLines = lines.filter((l) => l.startsWith("f "));
    expect(vLines).toHaveLength(3);
    expect(fLines).toHaveLength(2);

    const vnLines = lines.filter((l) => l.startsWith("vn"));
    expect(vnLines).toHaveLength(0);

    expect(fLines[0]).toBe("f 1 2 3");
    expect(fLines[1]).toBe("f 2 3 1");

    const lastV = lines.lastIndexOf(vLines[vLines.length - 1]!);
    const firstF = lines.indexOf(fLines[0]!);
    expect(lastV).toBeLessThan(firstF);
  });

  it("handles OBJ with no normals", () => {
    const input = "v 1 2 3\nv 4 5 6\nv 7 8 9\nf 1 2 3\n";
    const result = normalizeObj(input);
    const lines = result.split("\n").filter((l) => l.trim());
    expect(lines.filter((l) => l.startsWith("v "))).toHaveLength(3);
    expect(lines.filter((l) => l.startsWith("f "))).toHaveLength(1);
  });
});
