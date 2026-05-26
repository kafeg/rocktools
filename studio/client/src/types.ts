export interface ToolParam {
  name: string;
  flag: string;
  type: "number" | "integer" | "boolean" | "string" | "select";
  description: string;
  default?: number | string | boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  binary: string;
  params: ToolParam[];
  acceptsInput: boolean;
  producesOutput: boolean;
}

export interface PipelineStep {
  id: string;
  tool: string;
  params: Record<string, number | string | boolean>;
  enabled?: boolean;
}

export interface MeshInfo {
  nodes: number;
  tris: number;
  bounds: {
    x: [number, number];
    y: [number, number];
    z: [number, number];
  };
}

export interface JournalEntry {
  id: string;
  name: string;
  meshId: string;
  info: MeshInfo;
  steps: PipelineStep[];
  baseMesh: string;
  timestamp: number;
  durationMs: number;
}
