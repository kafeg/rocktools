#!/usr/bin/env npx tsx
/**
 * Headless GLB export via Puppeteer + rocktools studio.
 *
 * Launches studio in headless Chromium with hardware GPU acceleration,
 * injects pipeline config, generates mesh via WASM, bakes materials
 * to texture on GPU, exports fully-textured GLB.
 *
 * Usage (local):
 *   npx tsx export-glb.ts --config '{"sourceType":"create",...}' --output asteroid.glb
 *   npx tsx export-glb.ts --config @pipeline.json --output out.glb --resolution 2048
 *   npx tsx export-glb.ts --runtime --config @pipeline.json --output out.glb --material-output out.json
 *   npx tsx export-glb.ts --config '...' --output out.glb --server http://localhost:3801
 *
 * Usage (Docker):
 *   docker run --rm -v $(pwd)/out:/output rocktools-export \
 *     --config '...' --output /output/asteroid.glb
 *
 * Without --server, the script either:
 *   - Uses --static-dir to serve pre-built files (Docker mode)
 *   - Builds the client and starts vite preview (local mode)
 */
import puppeteer from "puppeteer";
import http from "http";
import fs from "fs";
import path from "path";
import { execSync, spawn, type ChildProcess } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = path.resolve(__dirname, "../client");

// ── Args ─────────────────────────────────────────────────────────────

interface Opts {
  config: string;
  output: string;
  resolution: number;
  serverUrl: string | null;
  staticDir: string | null;
  timeout: number;
  chromiumPath: string | null;
  headful: boolean;
  runtime: boolean;
  materialOutput: string | null;
  captureOutput: string | null;
}

function parseArgs(): Opts {
  const argv = process.argv.slice(2);
  const opts: Opts = {
    config: "", output: "", resolution: 2048,
    serverUrl: null, staticDir: null, timeout: 720_000,
    chromiumPath: null, headful: false, runtime: false, materialOutput: null,
    captureOutput: null,
  };

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--config": opts.config = argv[++i]!; break;
      case "--output": opts.output = argv[++i]!; break;
      case "--resolution": opts.resolution = parseInt(argv[++i]!); break;
      case "--server": opts.serverUrl = argv[++i]!; break;
      case "--static-dir": opts.staticDir = argv[++i]!; break;
      case "--timeout": opts.timeout = parseInt(argv[++i]!); break;
      case "--chromium": opts.chromiumPath = argv[++i]!; break;
      case "--headful": opts.headful = true; break;
      case "--runtime": opts.runtime = true; break;
      case "--material-output": opts.materialOutput = argv[++i]!; break;
      case "--capture-output": opts.captureOutput = argv[++i]!; break;
      case "--help": case "-h":
        console.error([
          "Usage: npx tsx export-glb.ts --config <json|@file> --output <path>",
          "",
          "Options:",
          "  --config <json|@file>   Pipeline config JSON (or @path to read file)",
          "  --output <path>         Output GLB file path",
          "  --resolution <n>        Texture bake resolution (default: 1024)",
          "  --server <url>          Use running studio server",
          "  --static-dir <dir>      Serve pre-built dist dir (Docker mode)",
          "  --chromium <path>       Chromium executable path",
          "  --headful               Show browser window (for debugging GPU issues)",
          "  --runtime               Export runtime GLB with feature attributes instead of baked albedo",
          "  --material-output <p>   Write asteroid-material JSON sidecar",
          "  --capture-output <p>    Capture rendered JPG image of the asteroid to path",
          "  --timeout <ms>          Max wait time (default: 720000)",
        ].join("\n"));
        process.exit(0);
    }
  }

  if (!opts.config || !opts.output) {
    console.error("Error: --config and --output are required");
    process.exit(1);
  }

  if (opts.config.startsWith("@")) {
    opts.config = fs.readFileSync(opts.config.slice(1), "utf-8");
  }

  return opts;
}

// ── Minimal static file server ───────────────────────────────────────

const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "application/javascript", ".mjs": "application/javascript",
  ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm",
  ".obj": "text/plain", ".glb": "model/gltf-binary", ".png": "image/png",
  ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon",
};

function startStaticServer(dir: string, port: number): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent(req.url?.split("?")[0] ?? "/");
      if (urlPath.endsWith("/")) urlPath += "index.html";

      const filePath = path.join(dir, urlPath);

      // Security: prevent directory traversal
      if (!filePath.startsWith(dir)) { res.writeHead(403); res.end(); return; }

      fs.readFile(filePath, (err, data) => {
        if (err) {
          // SPA fallback: serve index.html for non-file routes
          if (err.code === "ENOENT" && !path.extname(urlPath)) {
            fs.readFile(path.join(dir, "index.html"), (e2, html) => {
              if (e2) { res.writeHead(404); res.end("Not found"); return; }
              res.writeHead(200, { "Content-Type": "text/html" });
              res.end(html);
            });
            return;
          }
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
          "Content-Type": MIME[ext] ?? "application/octet-stream",
          "Cross-Origin-Opener-Policy": "same-origin",
          "Cross-Origin-Embedder-Policy": "require-corp",
        });
        res.end(data);
      });
    });

    server.listen(port, "127.0.0.1", () => resolve(server));
    server.on("error", reject);
  });
}

// ── Vite preview (local dev fallback) ────────────────────────────────

function ensureBuild(): void {
  const distIndex = path.join(CLIENT_DIR, "dist", "index.html");
  if (!fs.existsSync(distIndex)) {
    console.error("  Building studio client...");
    execSync("npm install && npm run build", { cwd: CLIENT_DIR, stdio: "inherit" });
  }
}

async function startVitePreview(): Promise<{ proc: ChildProcess; url: string }> {
  return new Promise((resolve, reject) => {
    const viteCli = path.resolve(CLIENT_DIR, "node_modules/vite/bin/vite.js");
    const proc = spawn("node", [viteCli, "preview", "--port", "4399", "--strictPort"], {
      cwd: CLIENT_DIR, stdio: ["ignore", "pipe", "pipe"],
    });
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) { reject(new Error("Vite preview timeout")); proc.kill(); }
    }, 80_000);

    let accumulated = "";
    const onData = (chunk: Buffer) => {
      const str = chunk.toString();
      accumulated += str;
      console.error("  VITE:", str.trim());
      const clean = accumulated.replace(/\u001b\[[0-9;]*m/g, "");
      const m = clean.match(/https?:\/\/(?:localhost|127\.0\.0\.1):\d+/);
      if (m && !resolved) { resolved = true; clearTimeout(timer); resolve({ proc, url: m[0] }); }
    };
    proc.stdout!.on("data", onData);
    proc.stderr!.on("data", onData);
    proc.on("error", (err) => { console.error("  VITE ERROR:", err); if (!resolved) { resolved = true; clearTimeout(timer); reject(err); } });
  });
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();
  const config = JSON.parse(opts.config);
  const outputPath = path.resolve(opts.output);
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  console.error(`  export-glb: resolution=${opts.resolution}`);

  // Resolve server
  let serverUrl = opts.serverUrl;
  let httpServer: http.Server | null = null;
  let viteProc: ChildProcess | null = null;

  if (!serverUrl && opts.staticDir) {
    // Docker mode: serve pre-built dist via built-in static server
    const port = 4399;
    httpServer = await startStaticServer(opts.staticDir, port);
    serverUrl = `http://127.0.0.1:${port}`;
    console.error(`  Static server: ${serverUrl} (${opts.staticDir})`);
  } else if (!serverUrl) {
    // Local mode: build + vite preview
    ensureBuild();
    console.error("  Starting vite preview...");
    const vite = await startVitePreview();
    viteProc = vite.proc;
    serverUrl = vite.url;
    console.error(`  Server: ${serverUrl}`);
  }

  // Launch headless browser with mandatory hardware GPU acceleration.
  // Software rasterization (SwiftShader) is strictly disabled because it fails to preserve
  // procedural texture details (simplex noise, Voronoi, FBM precision).
  //
  // IMPORTANT: We use headless: true (aka "new" unified headless) — NOT headless: "shell".
  // The "shell" mode uses chrome-headless-shell, a lightweight binary that does NOT support
  // hardware GPU acceleration at all. The "new" mode uses the full Chrome browser in headless
  // mode, which shares the same rendering pipeline as headful Chrome and supports ANGLE/D3D11.
  const launchOpts: any = {
    headless: false, // Set to false to use the "new" headless mode with GPU support
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--enable-webgl",
      "--enable-gpu",                 // Explicitly enable GPU in headless mode (off by default)
      "--ignore-gpu-blocklist",       // Bypass driver blocklists to ensure hardware GPU usage
      "--use-gl=angle",               // Use ANGLE graphics backend (translates GL → native API)
      "--use-angle=d3d11",            // Use Direct3D 11 on Windows for real hardware rendering
      "--disable-software-rasterizer",// Prevent fallback to SwiftShader CPU-based renderer
      "--disable-dev-shm-usage",
      //"--use-gl=desktop", // Use the desktop OpenGL driver
      "--window-size=920,780" // Optional: set a visible window size

      // ── THESE FLAGS MUST NOT BE ENABLED ──
      // They force SwiftShader (CPU software renderer) which destroys procedural texture quality:
      // "--use-angle=swiftshader-webgl",  // ❌ Forces SwiftShader instead of hardware GPU
      // "--enable-unsafe-swiftshader",    // ❌ Enables SwiftShader as fallback
      // "--disable-gpu-sandbox",          // ❌ Not needed, can cause instability
    ],
    protocolTimeout: opts.timeout,
  };
  if (opts.chromiumPath) {
    launchOpts.executablePath = opts.chromiumPath;
  } else if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchOpts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  const browser = await puppeteer.launch(launchOpts);

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(opts.timeout);
    page.on("pageerror", (err) => console.error("  page error:", err.message));

    console.error("  Loading studio...");
    await page.goto(serverUrl!, { waitUntil: "domcontentloaded", timeout: 120_000 });

    // Wait for studio headless API to be installed
    await page.waitForFunction(() => !!(window as any).__rocktools, { timeout: 60_000 });
    console.error("  Headless/Headful API ready");

    // CRITICAL: Mandatory check to guarantee that WebGL is hardware-accelerated.
    // If WebGL is running in software mode (e.g. SwiftShader, LLVMpipe, Software Rasterizer),
    // we abort immediately since procedural texture details will be lost.
    console.error("  Verifying WebGL hardware acceleration...");
    const webglStatus = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      if (!gl) {
        return { ok: false, renderer: "None (WebGL is not supported by this browser)" };
      }
      const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
      if (!debugInfo) {
        return { ok: true, renderer: "Unknown (WEBGL_debug_renderer_info is missing)" };
      }
      const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || "";
      // NOTE: Do NOT match generic "driver" — it appears in legitimate GPU strings like
      // "ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 Direct3D11, OpenGL driver)"
      const isSoftware = /swiftshader|software rasterizer|llvmpipe|basic render/i.test(renderer);
      return { ok: !isSoftware, renderer };
    });

    console.error(`  WebGL Unmasked Renderer: ${webglStatus.renderer}`);
    if (!webglStatus.ok) {
      throw new Error(
        `GPU hardware acceleration is REQUIRED, but WebGL fell back to software rendering mode: "${webglStatus.renderer}".\n` +
        `Software rendering ruins procedural texture details and precision. Execution aborted.`
      );
    }

    // Import pipeline config
    await page.evaluate((cfg: string) => {
      (window as any).__rocktools.importConfig(JSON.parse(cfg));
    }, JSON.stringify(config));
    console.error("  Config imported");

    // Generate mesh via WASM
    console.error("  Generating mesh...");
    await page.evaluate(() => (window as any).__rocktools.generate());

    await page.waitForFunction(
      () => !(window as any).__rocktools.isGenerating() && (window as any).__rocktools.hasMesh(),
      { timeout: opts.timeout, polling: 500 },
    );
    console.error("  Mesh ready");

    if (opts.runtime) {
      console.error("  Exporting runtime GLB...");
    } else {
      console.error(`  Baking textures (${opts.resolution}px)...`);
    }
    const glbBase64: string = opts.runtime
      ? await page.evaluate(() => (window as any).__rocktools.exportRuntimeGLB())
      : await page.evaluate((res: number) => (window as any).__rocktools.exportGLB(res), opts.resolution);

    // Write to disk
    const glbBuffer = Buffer.from(glbBase64, "base64");
    fs.writeFileSync(outputPath, glbBuffer);
    console.error(`  Output: ${outputPath} (${(glbBuffer.length / 1024).toFixed(0)} KB)`);

    if (opts.materialOutput) {
      const materialAsset = await page.evaluate(() => (window as any).__rocktools.exportMaterialAsset());
      const materialPath = path.resolve(opts.materialOutput);
      const materialDir = path.dirname(materialPath);
      if (!fs.existsSync(materialDir)) fs.mkdirSync(materialDir, { recursive: true });
      fs.writeFileSync(materialPath, JSON.stringify(materialAsset, null, 2) + "\n");
      console.error(`  Material: ${materialPath}`);
    }

    if (opts.captureOutput) {
      console.error("  Capturing image (1080x1080)...");
      const imageBase64: string = await page.evaluate(() =>
        (window as any).__rocktools.exportImage(1080, 1080, "jpg", 0.92, false)
      );
      const imageBuffer = Buffer.from(imageBase64, "base64");
      const imgPath = path.resolve(opts.captureOutput);
      const imgDir = path.dirname(imgPath);
      if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });
      fs.writeFileSync(imgPath, imageBuffer);
      console.error(`  Image output: ${imgPath} (${(imageBuffer.length / 1024).toFixed(0)} KB)`);
    }

  } finally {
    await browser.close();
    if (httpServer) httpServer.close();
    if (viteProc) viteProc.kill();
  }
}

main().catch((e) => {
  console.error("export-glb error:", e.message || e);
  process.exit(1);
});
