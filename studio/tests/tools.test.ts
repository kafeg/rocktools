import { describe, it, expect } from "vitest";
import { TOOL_DEFINITIONS, getToolDefinition } from "../client/src/toolDefinitions";

describe("TOOL_DEFINITIONS", () => {
  it("contains all primary generation tools", () => {
    const names = TOOL_DEFINITIONS.map((t) => t.name);
    expect(names).toContain("rockcreate");
    expect(names).toContain("rockdetail");
    expect(names).toContain("rocksmooth");
    expect(names).toContain("rockconvert");
    expect(names).toContain("rocktrim");
  });

  it("rockcreate does not accept input", () => {
    const tool = getToolDefinition("rockcreate");
    expect(tool).toBeDefined();
    expect(tool!.acceptsInput).toBe(false);
    expect(tool!.producesOutput).toBe(true);
  });

  it("rockdetail accepts input and produces output", () => {
    const tool = getToolDefinition("rockdetail");
    expect(tool).toBeDefined();
    expect(tool!.acceptsInput).toBe(true);
    expect(tool!.producesOutput).toBe(true);
  });

  it("all tools have at least one parameter", () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.params.length).toBeGreaterThan(0);
    }
  });

  it("all number params have min and max", () => {
    for (const tool of TOOL_DEFINITIONS) {
      for (const param of tool.params) {
        if (param.type === "number" || param.type === "integer") {
          expect(param.min).toBeDefined();
          expect(param.max).toBeDefined();
          expect(param.min!).toBeLessThan(param.max!);
        }
      }
    }
  });

  it("all params have unique names within a tool", () => {
    for (const tool of TOOL_DEFINITIONS) {
      const names = tool.params.map((p) => p.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });
});

describe("getToolDefinition", () => {
  it("returns undefined for unknown tool", () => {
    expect(getToolDefinition("nonexistent")).toBeUndefined();
  });

  it("returns correct tool", () => {
    const tool = getToolDefinition("rocksmooth");
    expect(tool?.name).toBe("rocksmooth");
    expect(tool?.binary).toBe("rocksmooth");
  });
});
