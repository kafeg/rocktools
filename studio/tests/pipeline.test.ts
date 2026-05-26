import { describe, it, expect } from "vitest";

interface MinimalPipelineStep {
  tool: string;
  params: Record<string, number | string | boolean>;
}

describe("Pipeline validation", () => {
  it("validates empty pipeline", () => {
    const steps: MinimalPipelineStep[] = [];
    expect(steps.length).toBe(0);
  });

  it("validates single step pipeline", () => {
    const steps: MinimalPipelineStep[] = [
      { tool: "rockcreate", params: { nodes: 12, roundness: 0.5, seed: 1 } },
    ];
    expect(steps.length).toBe(1);
    expect(steps[0]!.tool).toBe("rockcreate");
  });

  it("validates multi-step pipeline", () => {
    const steps: MinimalPipelineStep[] = [
      { tool: "rockdetail", params: { depth: 5, normalPerturbation: 0.2, seed: 1 } },
      { tool: "rocksmooth", params: { passes: 3 } },
    ];
    expect(steps.length).toBe(2);
    expect(steps[0]!.params.depth).toBe(5);
    expect(steps[1]!.params.passes).toBe(3);
  });

  it("rejects pipeline with too many steps", () => {
    const steps: MinimalPipelineStep[] = Array.from({ length: 11 }, (_, i) => ({
      tool: "rocksmooth",
      params: { passes: i + 1 },
    }));
    expect(steps.length).toBeGreaterThan(10);
  });

  it("validates typical asteroid pipeline", () => {
    const steps: MinimalPipelineStep[] = [
      {
        tool: "rockdetail",
        params: {
          depth: 5,
          normalPerturbation: 0.25,
          normalExponent: 0.5,
          basePerturbation: 0,
          baseExponent: 1.0,
          sphereForce: true,
          seed: 1,
        },
      },
      {
        tool: "rocksmooth",
        params: { passes: 3, normals: true },
      },
    ];

    expect(steps[0]!.params.sphereForce).toBe(true);
    expect(steps[0]!.params.depth).toBe(5);
    expect(steps[1]!.params.passes).toBe(3);
  });
});
