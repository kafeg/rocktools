import type { WorkerInMessage, WorkerOutMessage } from "./pipelineTypes";

interface EmscriptenModule {
  callMain(args: string[]): number;
  FS: {
    readFile(path: string, opts?: { encoding?: string }): string | Uint8Array;
    writeFile(path: string, data: string | Uint8Array): void;
    unlink(path: string): void;
  };
}

type ModuleFactory = (opts: Record<string, unknown>) => Promise<EmscriptenModule>;

const factoryCache = new Map<string, Promise<ModuleFactory>>();
const INPUT_FILE = "/input.obj";

let baseUrl = "/";

function loadFactory(tool: string): Promise<ModuleFactory> {
  let promise = factoryCache.get(tool);
  if (!promise) {
    promise = (new Function(
      `return import("${baseUrl}wasm/${tool}.mjs")`,
    )() as Promise<{ default: ModuleFactory }>).then((m) => m.default);
    factoryCache.set(tool, promise);
  }
  return promise;
}

async function callWasm(
  tool: string,
  args: string[],
  inputObj?: string,
): Promise<{ stdout: string; stderr: string }> {
  const factory = await loadFactory(tool);

  let stdout = "";
  const stderr: string[] = [];

  const module = await factory({
    print: (text: string) => { stdout += text + "\n"; },
    printErr: (text: string) => { stderr.push(text); },
    noInitialRun: true,
  });

  if (inputObj) {
    const encoder = new TextEncoder();
    module.FS.writeFile(INPUT_FILE, encoder.encode(inputObj));
  }

  try {
    module.callMain(args);
  } catch (e: unknown) {
    const err = e as { name?: string; status?: number };
    if (err.name !== "ExitStatus" || (err.status !== undefined && err.status !== 0)) {
      throw new Error(`${tool} failed: ${stderr.join("\n")}`);
    }
  }

  if (inputObj) {
    try { module.FS.unlink(INPUT_FILE); } catch { /* ok */ }
  }

  return { stdout, stderr: stderr.join("\n") };
}

// Arg builders — duplicated from rockcreateWasm to keep Worker self-contained

function buildArgs(tool: string, params: Record<string, number | string | boolean>, inputFile?: string): string[] {
  switch (tool) {
    case "rockcreate": return buildRockcreateArgs(params);
    case "rockdetail": return buildRockdetailArgs(params, inputFile!);
    case "rocksmooth": return buildRocksmoothArgs(params, inputFile!);
    case "rockerode": return buildRockerodeArgs(params, inputFile!);
    case "rockconvert": return buildRockconvertArgs(params, inputFile!);
    case "rocktrim": return buildRocktrimArgs(params, inputFile!);
    default: throw new Error(`Unknown tool: ${tool}`);
  }
}

function buildRockcreateArgs(params: Record<string, number | string | boolean>): string[] {
  const args: string[] = [];
  if (params.seed !== undefined) args.push("-s", String(params.seed));
  if (params.nodes !== undefined && Number(params.nodes) > 0) args.push("-n", String(params.nodes));
  if (params.gaussianNodes !== undefined && Number(params.gaussianNodes) > 0) args.push("-g", String(params.gaussianNodes));
  if (params.walkNodes !== undefined && Number(params.walkNodes) > 0) args.push("-w", String(params.walkNodes));
  if (params.roundness !== undefined && Number(params.roundness) > 0) args.push("-r", String(params.roundness));
  args.push("-oobj");
  return args;
}

function buildRockdetailArgs(params: Record<string, number | string | boolean>, inputFile: string): string[] {
  const args: string[] = [inputFile];
  if (params.depth !== undefined) args.push("-d", String(params.depth));
  if (params.subdivisionMode === "-3") args.push("-3");
  if (params.interpolation === "-mid") args.push("-mid");
  if (params.basePerturbation !== undefined) args.push("-b", String(params.basePerturbation));
  if (params.baseExponent !== undefined) args.push("-be", String(params.baseExponent));
  if (params.normalPerturbation !== undefined) args.push("-n", String(params.normalPerturbation));
  if (params.normalExponent !== undefined) args.push("-ne", String(params.normalExponent));
  if (params.normalBias !== undefined && Number(params.normalBias) !== 0) args.push("-nb", String(params.normalBias));
  if (params.sphereForce === true) args.push("-sph");
  if (params.gaussianRandom === true) args.push("-gr");
  if (params.clampEdges === true) args.push("-ce");
  if (params.seed !== undefined) args.push("-se", String(params.seed));
  args.push("-oobj");
  return args;
}

function buildRocksmoothArgs(params: Record<string, number | string | boolean>, inputFile: string): string[] {
  const args: string[] = [inputFile];
  if (params.passes !== undefined) args.push("-s", String(params.passes));
  if (params.tension !== undefined && Number(params.tension) > 0) args.push("-t", String(params.tension));
  if (params.normals === true) args.push("-n");
  if (params.grow !== undefined && Number(params.grow) !== 0) args.push("-grow", String(params.grow));
  args.push("-oobj");
  return args;
}

function buildRockerodeArgs(params: Record<string, number | string | boolean>, inputFile: string): string[] {
  const args: string[] = [inputFile];
  if (params.rate !== undefined) args.push("-e", String(params.rate));
  else args.push("-e");
  if (params.steps !== undefined) args.push("-s", String(params.steps));
  args.push("-oobj");
  return args;
}

function buildRockconvertArgs(params: Record<string, number | string | boolean>, inputFile: string): string[] {
  const args: string[] = [inputFile];
  const sx = params.scaleX ?? 1, sy = params.scaleY ?? 1, sz = params.scaleZ ?? 1;
  if (Number(sx) !== 1 || Number(sy) !== 1 || Number(sz) !== 1) {
    args.push("-s", String(sx), String(sy), String(sz));
  }
  const tx = params.translateX ?? 0, ty = params.translateY ?? 0, tz = params.translateZ ?? 0;
  if (Number(tx) !== 0 || Number(ty) !== 0 || Number(tz) !== 0) {
    args.push("-t", String(tx), String(ty), String(tz));
  }
  args.push("-oobj");
  return args;
}

function buildRocktrimArgs(params: Record<string, number | string | boolean>, inputFile: string): string[] {
  const args: string[] = [inputFile];
  if (params.minX !== undefined && Number(params.minX) !== 0) args.push("-x", String(params.minX));
  if (params.maxX !== undefined && Number(params.maxX) !== 0) args.push("+x", String(params.maxX));
  if (params.smooth === true) args.push("-s");
  args.push("-oobj");
  return args;
}

// OBJ normalization (duplicated to keep Worker self-contained)

function normalizeObj(objText: string): string {
  const lines: string[] = [];
  for (const line of objText.split("\n")) {
    const t = line.trim();
    if (t.startsWith("v ") || t.startsWith("vn ") || t.startsWith("f ")) {
      lines.push(t);
    }
  }
  return lines.join("\n") + "\n";
}

function parseMeshInfo(objText: string): { nodes: number; tris: number; bounds: { x: [number, number]; y: [number, number]; z: [number, number] } } {
  let nodes = 0, tris = 0;
  const bx: [number, number] = [Infinity, -Infinity];
  const by: [number, number] = [Infinity, -Infinity];
  const bz: [number, number] = [Infinity, -Infinity];

  for (const line of objText.split("\n")) {
    const t = line.trim();
    if (t.startsWith("v ")) {
      nodes++;
      const parts = t.split(/\s+/);
      const x = parseFloat(parts[1]!), y = parseFloat(parts[2]!), z = parseFloat(parts[3]!);
      if (x < bx[0]) bx[0] = x; if (x > bx[1]) bx[1] = x;
      if (y < by[0]) by[0] = y; if (y > by[1]) by[1] = y;
      if (z < bz[0]) bz[0] = z; if (z > bz[1]) bz[1] = z;
    } else if (t.startsWith("f ")) {
      tris++;
    }
  }

  return { nodes, tris, bounds: { x: bx, y: by, z: bz } };
}

// Worker message handler

self.onmessage = async (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data;
  if (msg.type !== "generate") return;

  baseUrl = msg.baseUrl;
  const steps = msg.steps;
  const startTime = performance.now();
  const cliArgs: Record<string, string[]> = {};
  const stderrParts: string[] = [];

  try {
    let currentObj = "";

    if (msg.baseMesh && steps[0]?.tool !== "rockcreate") {
      const res = await fetch(`${baseUrl}samples/${msg.baseMesh}`);
      if (!res.ok) throw new Error(`Failed to load base mesh: ${msg.baseMesh}`);
      currentObj = await res.text();
    }

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]!;

      const progress: WorkerOutMessage = {
        type: "progress",
        step: i + 1,
        total: steps.length,
        tool: step.tool,
      };
      self.postMessage(progress);

      const needsInput = step.tool !== "rockcreate";
      const inputFile = needsInput ? INPUT_FILE : undefined;
      const args = buildArgs(step.tool, step.params, inputFile);
      const inputObj = i > 0 ? normalizeObj(currentObj) : (currentObj || undefined);

      const result = await callWasm(step.tool, args, needsInput ? inputObj : undefined);
      currentObj = result.stdout;
      cliArgs[step.tool] = args;
      if (result.stderr) stderrParts.push(result.stderr);
    }

    currentObj = normalizeObj(currentObj);
    const info = parseMeshInfo(currentObj);
    const durationMs = Math.round(performance.now() - startTime);

    const result: WorkerOutMessage = {
      type: "result",
      meshObj: currentObj,
      info,
      durationMs,
      stderr: stderrParts.join("\n"),
      cliArgs,
    };
    self.postMessage(result);
  } catch (e) {
    const error: WorkerOutMessage = {
      type: "error",
      message: e instanceof Error ? e.message : "Worker generation failed",
    };
    self.postMessage(error);
  }
};
