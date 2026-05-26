import type { MeshInfo, PipelineStep } from "../types";

export type WorkerInMessage = {
  type: "generate";
  steps: PipelineStep[];
  baseMesh?: string;
  baseUrl: string;
};

export type WorkerOutMessage =
  | { type: "progress"; step: number; total: number; tool: string }
  | { type: "result"; meshObj: string; info: MeshInfo; durationMs: number; stderr: string; cliArgs: Record<string, string[]> }
  | { type: "error"; message: string };
