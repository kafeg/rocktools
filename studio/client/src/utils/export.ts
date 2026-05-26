import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import type { CollectedShaderParams } from "../stores/useStudioStore";
import type { MeshData } from "./meshModifiers";

// ── MeshData → BufferGeometry (shared with Viewer3D) ────────────────

export function meshDataToGeometry(mesh: MeshData): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const posArr = new Float32Array(mesh.vertexCount * 3);
  const normArr = new Float32Array(mesh.vertexCount * 3);
  for (let i = 0; i < mesh.vertexCount * 3; i++) {
    posArr[i] = mesh.positions[i]!;
    normArr[i] = mesh.normals[i]!;
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normArr, 3));
  geometry.setIndex(Array.from(mesh.indices));

  const fd = mesh.featureData ?? new Float32Array(mesh.vertexCount * 4);
  geometry.setAttribute("featureData", new THREE.BufferAttribute(fd, 4));
  const fd2 = mesh.featureData2 ?? new Float32Array(mesh.vertexCount * 4);
  geometry.setAttribute("featureData2", new THREE.BufferAttribute(fd2, 4));

  geometry.center();
  geometry.computeBoundingSphere();
  return geometry;
}

// ── Spherical UV generation with seam fix ───────────────────────────

function generateSphericalUVs(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const indexed = !!geo.index;
  const g = indexed ? geo.toNonIndexed() : geo;
  if (indexed) geo.dispose();
  const pos = g.getAttribute("position");
  const uvs = new Float32Array(pos.count * 2);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.sqrt(x * x + y * y + z * z) || 1;
    uvs[i * 2] = Math.atan2(z, x) / (2 * Math.PI) + 0.5;
    uvs[i * 2 + 1] = Math.asin(Math.max(-1, Math.min(1, y / r))) / Math.PI + 0.5;
  }

  g.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));

  const uv = g.getAttribute("uv") as THREE.BufferAttribute;
  const triCount = pos.count / 3;

  for (let t = 0; t < triCount; t++) {
    const i0 = t * 3;
    const i1 = t * 3 + 1;
    const i2 = t * 3 + 2;
    const u0 = uv.getX(i0), u1 = uv.getX(i1), u2 = uv.getX(i2);
    if (Math.max(u0, u1, u2) - Math.min(u0, u1, u2) > 0.5) {
      if (u0 < 0.5) uv.setX(i0, u0 + 1.0);
      if (u1 < 0.5) uv.setX(i1, u1 + 1.0);
      if (u2 < 0.5) uv.setX(i2, u2 + 1.0);
    }
  }
  uv.needsUpdate = true;
  return g;
}

// ── GLSL noise (same as AsteroidMaterial) ───────────────────────────

const NOISE_GLSL = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

float fbm(vec3 p, int octaves) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    value += amplitude * snoise(p * frequency);
    frequency *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

vec2 voronoi(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  float d1 = 10.0;
  float d2 = 10.0;
  for (int x = -1; x <= 1; x++)
  for (int y = -1; y <= 1; y++)
  for (int z = -1; z <= 1; z++) {
    vec3 neighbor = vec3(float(x), float(y), float(z));
    vec3 point = vec3(
      fract(sin(dot(i + neighbor, vec3(127.1, 311.7, 74.7))) * 43758.5453),
      fract(sin(dot(i + neighbor, vec3(269.5, 183.3, 246.1))) * 43758.5453),
      fract(sin(dot(i + neighbor, vec3(113.5, 271.9, 124.6))) * 43758.5453)
    );
    vec3 diff = neighbor + point - f;
    float dist = length(diff);
    if (dist < d1) { d2 = d1; d1 = dist; }
    else if (dist < d2) { d2 = dist; }
  }
  return vec2(d1, d2);
}
`;

// ── Baking shaders ──────────────────────────────────────────────────

const BAKE_VERT = /* glsl */ `
attribute vec4 featureData;
attribute vec4 featureData2;

varying vec3 vObjPosition;
varying vec3 vObjNormal;
varying float vCavity;
varying float vSlope;
varying vec4 vFeature;
varying vec4 vFeature2;

void main() {
  gl_Position = vec4(uv * 2.0 - 1.0, 0.5, 1.0);
  vObjPosition = position;
  vObjNormal = normalize(normal);
  vec3 outward = normalize(position);
  vSlope = dot(normalize(normal), outward);
  vec3 toCenter = -outward;
  vCavity = 1.0 - clamp(dot(normalize(normal), toCenter) * 0.5 + 0.5, 0.0, 1.0);
  vFeature = featureData;
  vFeature2 = featureData2;
}
`;

const BAKE_FRAG = /* glsl */ `
precision highp float;

${NOISE_GLSL}

uniform vec3 uBaseColor;
uniform float uColorVariation;
uniform float uColorVariationScale;
uniform float uDustAmount;
uniform vec3 uDustColor;
uniform float uVeinIntensity;
uniform float uVeinScale;
uniform vec3 uVeinColor;
uniform float uSubsurface;

uniform float uFeatureIntensity;
uniform float uCraterShading;
uniform vec3 uCraterTint;
uniform float uBoulderShading;
uniform vec3 uBoulderTint;
uniform float uRidgeShading;
uniform vec3 uRidgeTint;
uniform float uFissureShading;
uniform vec3 uFissureTint;
uniform float uLayerShading;
uniform vec3 uLayerTint;

uniform sampler2D uDiffuseMap;
uniform float uHasTexture;
uniform float uApplyTint;
uniform float uTriplanarSharpness;

uniform float uAoStrength;
uniform float uAoRadius;
uniform float uFrostAmount;
uniform vec3 uFrostColor;
uniform float uFrostBias;
uniform float uWeatherAmount;
uniform vec3 uWeatherTint;
uniform float uDirectionBias;

varying vec3 vObjPosition;
varying vec3 vObjNormal;
varying float vCavity;
varying float vSlope;
varying vec4 vFeature;
varying vec4 vFeature2;

vec3 triplanarSample(sampler2D tex, vec3 pos, vec3 norm, float sharpness) {
  vec3 blend = pow(abs(norm), vec3(sharpness));
  blend /= (blend.x + blend.y + blend.z);
  vec3 xProj = texture2D(tex, pos.yz * 0.5 + 0.5).rgb;
  vec3 yProj = texture2D(tex, pos.xz * 0.5 + 0.5).rgb;
  vec3 zProj = texture2D(tex, pos.xy * 0.5 + 0.5).rgb;
  return xProj * blend.x + yProj * blend.y + zProj * blend.z;
}

void main() {
  vec3 pp = vObjPosition * uColorVariationScale;
  float colorNoise = fbm(pp, 4) * uColorVariation;
  vec3 baseAlbedo = uBaseColor;
  if (uHasTexture > 0.5) {
    vec3 texColor = triplanarSample(uDiffuseMap, vObjPosition, vObjNormal, uTriplanarSharpness);
    if (uApplyTint > 0.5) {
      baseAlbedo = texColor * uBaseColor * 2.0;
    } else {
      baseAlbedo = texColor;
    }
  }
  vec3 finalColor = baseAlbedo * (1.0 + colorNoise);

  if (uVeinIntensity > 0.01) {
    float veinNoise = snoise(vObjPosition * uVeinScale);
    float vein = smoothstep(0.3, 0.5, abs(veinNoise));
    vein = pow(1.0 - vein, 3.0) * uVeinIntensity;
    finalColor = mix(finalColor, uVeinColor, vein);
  }

  if (uDustAmount > 0.01) {
    float dustMask = vCavity * uDustAmount;
    dustMask += snoise(vObjPosition * 8.0) * 0.1 * uDustAmount;
    dustMask = clamp(dustMask, 0.0, 1.0);
    finalColor = mix(finalColor, uDustColor, dustMask);
  }

  if (uSubsurface > 0.01) {
    float sss = pow(clamp(1.0 - dot(vObjNormal, vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 2.0);
    finalColor += finalColor * sss * uSubsurface * 0.5;
  }

  // Feature tinting (matches real-time AsteroidMaterial)
  float fi = uFeatureIntensity;

  float craterFloor = max(vFeature.r, 0.0);
  if (craterFloor > 0.01 && uCraterShading > 0.01) {
    float cs = uCraterShading * fi;
    float depthFactor = smoothstep(0.0, 1.0, craterFloor);
    finalColor *= mix(1.0, mix(1.0, 0.55, depthFactor), cs);
    finalColor = mix(finalColor, uCraterTint, depthFactor * 0.4 * cs);
  }

  float boulder = vFeature.g;
  if (boulder > 0.01 && uBoulderShading > 0.01) {
    float bs = uBoulderShading * fi;
    float pFactor = smoothstep(0.0, 1.0, boulder);
    finalColor = mix(finalColor, uBoulderTint, pFactor * 0.2 * bs);
  }

  float ridge = vFeature2.r;
  if (ridge > 0.01 && uRidgeShading > 0.01) {
    float rs = uRidgeShading * fi;
    float rFactor = smoothstep(0.0, 1.0, ridge);
    finalColor = mix(finalColor, uRidgeTint, rFactor * 0.15 * rs);
  }

  float fissureDepth = vFeature.b;
  if (fissureDepth > 0.01 && uFissureShading > 0.01) {
    float fs = uFissureShading * fi;
    float depthCurve = smoothstep(0.0, 0.8, fissureDepth);
    float darkness = mix(1.0, 0.35, depthCurve);
    finalColor *= mix(1.0, darkness, fs);
    finalColor = mix(finalColor, uFissureTint, depthCurve * 0.5 * fs);
  }

  float layerEdge = vFeature.a;
  if (layerEdge > 0.01 && uLayerShading > 0.01) {
    float ls = uLayerShading * fi;
    float bandNoise = snoise(vObjPosition * 8.0);
    float bandPattern = sin(dot(vObjPosition, normalize(vec3(0.3, 1.0, 0.2))) * 15.0 + bandNoise * 2.0);
    float band = smoothstep(-0.2, 0.2, bandPattern) * layerEdge;
    finalColor = mix(finalColor, uLayerTint, band * 0.3 * ls);
    finalColor *= mix(1.0, 0.9, layerEdge * 0.4 * ls);
  }

  // Frost
  if (uFrostAmount > 0.01) {
    float fConcavity = smoothstep(0.2, 0.7, vSlope);
    float fExposure = 1.0 - clamp(dot(vObjNormal, normalize(vec3(1.0, 0.5, 0.3))), 0.0, 1.0);
    float frostMask = mix(fExposure, fConcavity, uFrostBias) * uFrostAmount;
    if (fi > 0.01) {
      frostMask += max(vFeature.r, 0.0) * uFrostAmount * 0.5 * fi;
      frostMask += vFeature.b * uFrostAmount * 0.3 * fi;
    }
    float frostN = snoise(vObjPosition * 8.0) * 0.2 + snoise(vObjPosition * 20.0) * 0.1;
    frostMask = clamp(frostMask + frostN * uFrostAmount, 0.0, 1.0);
    finalColor = mix(finalColor, uFrostColor, frostMask);
  }

  // Weathering
  if (uWeatherAmount > 0.01) {
    float wConvexity = 1.0 - smoothstep(0.3, 0.8, vSlope);
    float wSolarExp = clamp(dot(vObjNormal, normalize(vec3(1.0, 0.3, 0.2))), 0.0, 1.0);
    float weatherMask = mix(wConvexity, wSolarExp, uDirectionBias) * uWeatherAmount;
    if (fi > 0.01) {
      weatherMask += vFeature.g * uWeatherAmount * 0.3 * fi;
      weatherMask += vFeature2.r * uWeatherAmount * 0.2 * fi;
      weatherMask *= mix(1.0, 0.2, vFeature.b * fi);
    }
    float weatherN = snoise(vObjPosition * 5.0) * 0.12;
    weatherMask = clamp(weatherMask + weatherN * uWeatherAmount, 0.0, 1.0);
    finalColor = mix(finalColor, finalColor * uWeatherTint * 2.0, weatherMask);
  }

  // AO
  if (uAoStrength > 0.01) {
    float aoCavity = 1.0 - smoothstep(0.2, 0.8, vSlope);
    float aoNoise = snoise(vObjPosition * (3.0 + uAoRadius * 10.0)) * 0.15;
    float ao = 1.0 - (aoCavity + aoNoise) * uAoStrength;
    if (fi > 0.01) {
      ao -= max(vFeature.r, 0.0) * 0.3 * uAoStrength * fi;
      ao -= vFeature.b * 0.4 * uAoStrength * fi;
    }
    ao = clamp(ao, 0.0, 1.0);
    finalColor *= ao;
  }

  gl_FragColor = vec4(clamp(finalColor, 0.0, 1.0), 1.0);
}
`;

// ── Texture loading for bake ────────────────────────────────────────

const bakeTextureLoader = new THREE.TextureLoader();

function loadDiffuseForBake(texId: string): Promise<THREE.Texture> {
  if (texId === "none") {
    const dummy = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1, THREE.RGBAFormat);
    dummy.needsUpdate = true;
    return Promise.resolve(dummy);
  }
  const basePath = `${import.meta.env.BASE_URL}textures/${texId}`;
  // ambientCG textures use .jpg, procedural textures use .png
  const ext = texId.startsWith("acg_") ? "jpg" : "png";
  return new Promise((resolve, reject) => {
    bakeTextureLoader.load(
      `${basePath}_diffuse.${ext}`,
      (tex) => {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.colorSpace = THREE.SRGBColorSpace;
        resolve(tex);
      },
      undefined,
      reject,
    );
  });
}

// ── Texture baking via offscreen GPU render ─────────────────────────

export async function bakeAlbedoTexture(
  geo: THREE.BufferGeometry,
  params: CollectedShaderParams,
  resolution: number,
): Promise<THREE.CanvasTexture> {
  const hasTexture = params.texture && params.texture !== "none";
  const diffuseMap = await loadDiffuseForBake(params.texture ?? "none");

  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
  renderer.setSize(resolution, resolution);

  const rt = new THREE.WebGLRenderTarget(resolution, resolution, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  });

  const material = new THREE.ShaderMaterial({
    vertexShader: BAKE_VERT,
    fragmentShader: BAKE_FRAG,
    uniforms: {
      uBaseColor: { value: new THREE.Color(params.baseColor) },
      uColorVariation: { value: params.colorVariation },
      uColorVariationScale: { value: params.colorVariationScale },
      uDustAmount: { value: params.dustAmount },
      uDustColor: { value: new THREE.Color(params.dustColor) },
      uVeinIntensity: { value: params.veinIntensity },
      uVeinScale: { value: params.veinScale },
      uVeinColor: { value: new THREE.Color(params.veinColor) },
      uSubsurface: { value: params.subsurface },
      uFeatureIntensity: { value: params.featureIntensity },
      uCraterShading: { value: params.craterShading },
      uCraterTint: { value: new THREE.Color(params.craterTint) },
      uBoulderShading: { value: params.boulderShading },
      uBoulderTint: { value: new THREE.Color(params.boulderTint) },
      uRidgeShading: { value: params.ridgeShading },
      uRidgeTint: { value: new THREE.Color(params.ridgeTint) },
      uFissureShading: { value: params.fissureShading },
      uFissureTint: { value: new THREE.Color(params.fissureTint) },
      uLayerShading: { value: params.layerShading },
      uLayerTint: { value: new THREE.Color(params.layerTint) },
      uDiffuseMap: { value: diffuseMap },
      uHasTexture: { value: hasTexture ? 1.0 : 0.0 },
      uApplyTint: { value: params.applyTint ? 1.0 : 0.0 },
      uTriplanarSharpness: { value: 4.0 },
      uAoStrength: { value: params.aoStrength },
      uAoRadius: { value: params.aoRadius },
      uFrostAmount: { value: params.frostAmount },
      uFrostColor: { value: new THREE.Color(params.frostColor) },
      uFrostBias: { value: params.frostBias },
      uWeatherAmount: { value: params.weatherAmount },
      uWeatherTint: { value: new THREE.Color(params.weatherTint) },
      uDirectionBias: { value: params.directionBias },
    },
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geo, material);
  const scene = new THREE.Scene();
  scene.add(mesh);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  camera.position.z = 1;

  renderer.setRenderTarget(rt);
  renderer.render(scene, camera);

  const pixels = new Uint8Array(resolution * resolution * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, resolution, resolution, pixels);

  const canvas = document.createElement("canvas");
  canvas.width = resolution;
  canvas.height = resolution;
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.createImageData(resolution, resolution);
  for (let y = 0; y < resolution; y++) {
    for (let x = 0; x < resolution; x++) {
      const src = ((resolution - 1 - y) * resolution + x) * 4;
      const dst = (y * resolution + x) * 4;
      imageData.data[dst] = pixels[src]!;
      imageData.data[dst + 1] = pixels[src + 1]!;
      imageData.data[dst + 2] = pixels[src + 2]!;
      imageData.data[dst + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);

  renderer.setRenderTarget(null);
  rt.dispose();
  material.dispose();
  diffuseMap.dispose();
  renderer.dispose();

  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// ── Auto texture resolution ─────────────────────────────────────────

export function recommendTextureResolution(triCount: number): number {
  if (triCount < 500) return 256;
  if (triCount < 2000) return 512;
  if (triCount < 10000) return 1024;
  if (triCount < 50000) return 2048;
  return 4096;
}

// ── Download helper ─────────────────────────────────────────────────

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Public API ──────────────────────────────────────────────────────

export async function exportGLBToBuffer(
  meshData: MeshData,
  shaderParams: CollectedShaderParams,
  resolution: number = 1024,
): Promise<ArrayBuffer> {
  let geo = meshDataToGeometry(meshData);
  geo = generateSphericalUVs(geo);

  const albedo = await bakeAlbedoTexture(geo, shaderParams, resolution);

  geo.deleteAttribute("featureData");
  geo.deleteAttribute("featureData2");

  const mat = new THREE.MeshStandardMaterial({
    map: albedo,
    roughness: shaderParams.roughness,
    metalness: shaderParams.metalness,
    flatShading: true,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "asteroid";

  const exporter = new GLTFExporter();
  const glb = await exporter.parseAsync(mesh, { binary: true }) as ArrayBuffer;

  albedo.dispose();
  mat.dispose();
  geo.dispose();

  return glb;
}

export async function exportRuntimeGLBToBuffer(
  meshData: MeshData,
  shaderParams: CollectedShaderParams,
): Promise<ArrayBuffer> {
  const geo = meshDataToGeometry(meshData);

  const mat = new THREE.MeshStandardMaterial({
    color: shaderParams.baseColor,
    roughness: shaderParams.roughness,
    metalness: shaderParams.metalness,
    flatShading: true,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "asteroid";

  const exporter = new GLTFExporter();
  const glb = await exporter.parseAsync(mesh, { binary: true }) as ArrayBuffer;

  mat.dispose();
  geo.dispose();

  return glb;
}

export async function exportGLB(
  meshData: MeshData,
  shaderParams: CollectedShaderParams,
  resolution: number = 1024,
): Promise<void> {
  const glb = await exportGLBToBuffer(meshData, shaderParams, resolution);

  downloadBlob(
    new Blob([glb], { type: "model/gltf-binary" }),
    `asteroid_${Date.now()}.glb`,
  );
}

export interface PipelineConfig {
  version: 1;
  sourceType: string;
  baseMesh: string;
  createParams: Record<string, number | string | boolean>;
  steps: Array<{ tool: string; params: Record<string, number | string | boolean>; enabled?: boolean }>;
  scene?: {
    lights: Array<Record<string, unknown>>;
    background: Record<string, unknown>;
  };
}

export function exportPipelineParams(config: PipelineConfig): void {
  const json = JSON.stringify(config, null, 2);
  downloadBlob(
    new Blob([json], { type: "application/json" }),
    `asteroid_pipeline_${Date.now()}.json`,
  );
}

export function parsePipelineConfig(json: string): PipelineConfig | null {
  try {
    const data = JSON.parse(json);
    if (!data.sourceType || !data.steps || !Array.isArray(data.steps)) return null;
    return {
      version: 1,
      sourceType: data.sourceType,
      baseMesh: data.baseMesh || "icosahedron0.obj",
      createParams: data.createParams || {},
      steps: data.steps.map((s: { tool: string; params: Record<string, number | string | boolean>; enabled?: boolean }) => ({
        tool: s.tool,
        params: s.params || {},
        ...(s.enabled === false ? { enabled: false } : {}),
      })),
      ...(data.scene ? { scene: data.scene } : {}),
    };
  } catch {
    return null;
  }
}

export function encodeShareUrl(config: PipelineConfig): string {
  const json = JSON.stringify(config);
  const encoded = btoa(unescape(encodeURIComponent(json)));
  const base = window.location.origin + window.location.pathname;
  return `${base}#pipeline=${encoded}`;
}

export function decodeShareUrl(): PipelineConfig | null {
  const hash = window.location.hash;
  if (!hash.startsWith("#pipeline=")) return null;
  try {
    const encoded = hash.slice("#pipeline=".length);
    const json = decodeURIComponent(escape(atob(encoded)));
    return parsePipelineConfig(json);
  } catch {
    return null;
  }
}
