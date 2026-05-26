import * as THREE from "three";
import {
  ASTEROID_TEXTURE_LIST,
  DEFAULT_ASTEROID_MATERIAL_PARAMS,
  type AsteroidMaterialParams,
} from "./types";

export type AsteroidTextureKind = "diffuse" | "normal";

export interface AsteroidTextureSet {
  diffuse: THREE.Texture;
  normal: THREE.Texture;
}

export interface AsteroidShaderUniforms {
  uBaseColor: { value: THREE.Color };
  uColorVariation: { value: number };
  uColorVariationScale: { value: number };
  uDustAmount: { value: number };
  uDustColor: { value: THREE.Color };
  uVeinIntensity: { value: number };
  uVeinScale: { value: number };
  uVeinColor: { value: THREE.Color };
  uSubsurface: { value: number };
  uFeatureIntensity: { value: number };
  uCraterShading: { value: number };
  uCraterTint: { value: THREE.Color };
  uBoulderShading: { value: number };
  uBoulderTint: { value: THREE.Color };
  uRidgeShading: { value: number };
  uRidgeTint: { value: THREE.Color };
  uFissureShading: { value: number };
  uFissureTint: { value: THREE.Color };
  uLayerShading: { value: number };
  uLayerTint: { value: THREE.Color };
  uNormalStrength: { value: number };
  uDiffuseMap: { value: THREE.Texture };
  uNormalMap: { value: THREE.Texture };
  uHasTexture: { value: number };
  uApplyTint: { value: number };
  uTriplanarSharpness: { value: number };
  uAoStrength: { value: number };
  uAoRadius: { value: number };
  uFrostAmount: { value: number };
  uFrostColor: { value: THREE.Color };
  uFrostBias: { value: number };
  uWeatherAmount: { value: number };
  uWeatherTint: { value: THREE.Color };
  uDirectionBias: { value: number };
  uEmissionColor: { value: THREE.Color };
  uEmissionIntensity: { value: number };
  uEmissionPattern: { value: number };
  uSunDirectionWorld: { value: THREE.Vector3 };
  uMaterialDirectionObject: { value: THREE.Vector3 };
  uObjectToViewNormalMatrix: { value: THREE.Matrix3 };
}

export type AsteroidTextureUrlResolver = (textureId: string, kind: AsteroidTextureKind) => string;

export interface LoadAsteroidTextureSetOptions {
  loader?: THREE.TextureLoader;
  resolveUrl: AsteroidTextureUrlResolver;
  cacheKey?: string;
}

export interface PatchableAsteroidShader {
  uniforms: Record<string, unknown>;
  vertexShader: string;
  fragmentShader: string;
}

const SHADER_PREAMBLE = /* glsl */ `
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

vec3 snoiseGrad(vec3 p) {
  float eps = 0.01;
  return vec3(
    snoise(p + vec3(eps, 0, 0)) - snoise(p - vec3(eps, 0, 0)),
    snoise(p + vec3(0, eps, 0)) - snoise(p - vec3(0, eps, 0)),
    snoise(p + vec3(0, 0, eps)) - snoise(p - vec3(0, 0, eps))
  ) / (2.0 * eps);
}
`;

const VERTEX_CHUNKS = /* glsl */ `
attribute vec4 featureData;
attribute vec4 featureData2;
varying vec3 vObjPosition;
varying vec3 vObjNormal;
varying vec3 vWorldNormal;
varying float vSlope;
varying vec4 vFeature;
varying vec4 vFeature2;
`;

const VERTEX_MAIN = /* glsl */ `
vObjPosition = position;
vObjNormal = normal;
vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
vec3 outward = normalize(position);
vSlope = dot(normalize(normal), outward);
vFeature = featureData;
vFeature2 = featureData2;
`;

const FRAG_UNIFORMS = /* glsl */ `
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
uniform float uNormalStrength;
uniform sampler2D uDiffuseMap;
uniform sampler2D uNormalMap;
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
uniform vec3 uEmissionColor;
uniform float uEmissionIntensity;
uniform float uEmissionPattern;
uniform vec3 uSunDirectionWorld;
uniform vec3 uMaterialDirectionObject;
uniform mat3 uObjectToViewNormalMatrix;
varying vec3 vObjPosition;
varying vec3 vObjNormal;
varying vec3 vWorldNormal;
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

vec3 triplanarNormal(sampler2D tex, vec3 pos, vec3 norm, float sharpness) {
  vec3 blend = pow(abs(norm), vec3(sharpness));
  blend /= (blend.x + blend.y + blend.z);
  vec3 xN = texture2D(tex, pos.yz * 0.5 + 0.5).rgb * 2.0 - 1.0;
  vec3 yN = texture2D(tex, pos.xz * 0.5 + 0.5).rgb * 2.0 - 1.0;
  vec3 zN = texture2D(tex, pos.xy * 0.5 + 0.5).rgb * 2.0 - 1.0;
  vec3 xTan = normalize(vec3(0.0, xN.y, -xN.x));
  vec3 yTan = normalize(vec3(yN.x, 0.0, -yN.y));
  vec3 zTan = normalize(vec3(zN.x, -zN.y, 0.0));
  return normalize(xTan * blend.x + yTan * blend.y + zTan * blend.z);
}
`;

const NORMAL_PERTURBATION = /* glsl */ `
if (uHasTexture > 0.5) {
  vec3 texNorm = triplanarNormal(uNormalMap, vObjPosition, vObjNormal, uTriplanarSharpness);
  vec3 texNormView = normalize(uObjectToViewNormalMatrix * texNorm);
  normal = normalize(normal + texNormView * 0.3 * uNormalStrength);
}
if (uFeatureIntensity > 0.01) {
  float fi = uFeatureIntensity;
  float ns = uNormalStrength;
  float craterFloor = max(vFeature.r, 0.0);
  float craterRim = max(-vFeature.r, 0.0);
  float boulder = vFeature.g;
  float fissureDepth = vFeature.b;
  float layerEdge = vFeature.a;
  float ridge = vFeature2.r;

  vec3 perturbPos = vObjPosition;

  if (craterFloor > 0.01 && uCraterShading > 0.01) {
    vec3 grad = normalize(uObjectToViewNormalMatrix * snoiseGrad(perturbPos * 30.0));
    normal = normalize(normal + grad * craterFloor * 0.04 * fi * uCraterShading * ns);
  }
  if (craterRim > 0.01 && uCraterShading > 0.01) {
    vec3 grad = normalize(uObjectToViewNormalMatrix * snoiseGrad(perturbPos * 35.0));
    normal = normalize(normal + grad * craterRim * 0.03 * fi * uCraterShading * ns);
  }
  if (boulder > 0.01 && uBoulderShading > 0.01) {
    vec3 grad = normalize(uObjectToViewNormalMatrix * snoiseGrad(perturbPos * 18.0));
    vec3 grad2 = normalize(uObjectToViewNormalMatrix * snoiseGrad(perturbPos * 45.0));
    normal = normalize(normal + (grad * 0.5 + grad2 * 0.5) * boulder * 0.06 * fi * uBoulderShading * ns);
  }
  if (ridge > 0.01 && uRidgeShading > 0.01) {
    vec3 grad = normalize(uObjectToViewNormalMatrix * snoiseGrad(perturbPos * 22.0));
    normal = normalize(normal + grad * ridge * 0.05 * fi * uRidgeShading * ns);
  }
  if (fissureDepth > 0.01 && uFissureShading > 0.01) {
    vec3 grad = normalize(uObjectToViewNormalMatrix * snoiseGrad(perturbPos * 25.0 + vec3(0.0, perturbPos.y * 10.0, 0.0)));
    normal = normalize(normal + grad * fissureDepth * 0.1 * fi * uFissureShading * ns);
  }
  if (layerEdge > 0.01 && uLayerShading > 0.01) {
    vec3 grad = normalize(uObjectToViewNormalMatrix * snoiseGrad(perturbPos * 40.0));
    normal = normalize(normal + grad * layerEdge * 0.025 * fi * uLayerShading * ns);
  }
}
`;

const ROUGHNESS_MOD = /* glsl */ `
if (uFeatureIntensity > 0.01) {
  float fi = uFeatureIntensity;
  float craterFloor = max(vFeature.r, 0.0);
  float craterRim = max(-vFeature.r, 0.0);
  float boulder = vFeature.g;
  float fissureDepth = vFeature.b;
  float layerEdge = vFeature.a;
  float ridge = vFeature2.r;

  float rMod = 0.0;
  rMod -= craterFloor * 0.2 * uCraterShading;
  rMod -= craterRim * 0.08 * uCraterShading;
  rMod += boulder * 0.12 * uBoulderShading;
  rMod += ridge * 0.1 * uRidgeShading;
  rMod += fissureDepth * 0.18 * uFissureShading;
  rMod += layerEdge * 0.05 * uLayerShading;

  roughnessFactor = clamp(roughnessFactor + rMod * fi, 0.05, 1.0);
}
if (uFrostAmount > 0.01) {
  float fConcavity = smoothstep(0.2, 0.7, vSlope);
  float fExposure = 1.0 - clamp(dot(vObjNormal, normalize(uMaterialDirectionObject)), 0.0, 1.0);
  float frostRough = mix(fExposure, fConcavity, uFrostBias) * uFrostAmount;
  roughnessFactor = mix(roughnessFactor, 0.12, clamp(frostRough, 0.0, 1.0));
}
`;

const METALNESS_MOD = /* glsl */ `
if (uFeatureIntensity > 0.01) {
  float fi = uFeatureIntensity;
  float craterFloor = max(vFeature.r, 0.0);
  float fissureDepth = vFeature.b;

  float mMod = 0.0;
  mMod -= craterFloor * 0.03 * uCraterShading;
  mMod += fissureDepth * 0.05 * uFissureShading;

  metalnessFactor = clamp(metalnessFactor + mMod * fi, 0.0, 1.0);
}
`;

const FRAG_COLOR = /* glsl */ `
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

  float craterFloor = max(vFeature.r, 0.0);
  float craterRim = max(-vFeature.r, 0.0);
  float boulder = vFeature.g;
  float fissureDepth = vFeature.b;
  float layerEdge = vFeature.a;
  float ridge = vFeature2.r;

  if (uFeatureIntensity > 0.01) {
    float fi = uFeatureIntensity;

    if (craterFloor > 0.01 && uCraterShading > 0.01) {
      float cs = uCraterShading * fi;
      float depthFactor = smoothstep(0.0, 1.0, craterFloor);
      finalColor *= mix(1.0, mix(1.0, 0.55, depthFactor), cs);
      finalColor = mix(finalColor, uCraterTint, depthFactor * 0.4 * cs);
      float floorNoise = snoise(vObjPosition * 20.0) * 0.08;
      finalColor *= (1.0 + floorNoise * craterFloor * cs);
    }

    if (craterRim > 0.01 && uCraterShading > 0.01) {
      float cs = uCraterShading * fi;
      float rimFactor = smoothstep(0.0, 1.0, craterRim);
      finalColor *= mix(1.0, mix(1.0, 1.25, rimFactor), cs);
      float rimFresnel = pow(1.0 - abs(vSlope), 2.0);
      finalColor += finalColor * rimFresnel * craterRim * 0.15 * cs;
    }

    if (boulder > 0.01 && uBoulderShading > 0.01) {
      float bs = uBoulderShading * fi;
      float pFactor = smoothstep(0.0, 1.0, boulder);
      float grainNoise = snoise(vObjPosition * 25.0) * 0.12 + snoise(vObjPosition * 50.0) * 0.06;
      finalColor *= mix(1.0, mix(1.0, 1.1 + grainNoise, pFactor), bs);
      float edgeFresnel = pow(1.0 - abs(vSlope), 3.0);
      finalColor += finalColor * edgeFresnel * boulder * 0.2 * bs;
      finalColor = mix(finalColor, uBoulderTint, pFactor * 0.2 * bs);
    }

    if (ridge > 0.01 && uRidgeShading > 0.01) {
      float rs = uRidgeShading * fi;
      float rFactor = smoothstep(0.0, 1.0, ridge);
      float grainNoise = snoise(vObjPosition * 20.0) * 0.08;
      finalColor *= mix(1.0, mix(1.0, 1.08 + grainNoise, rFactor), rs);
      finalColor = mix(finalColor, uRidgeTint, rFactor * 0.15 * rs);
    }

    if (fissureDepth > 0.01 && uFissureShading > 0.01) {
      float fs = uFissureShading * fi;
      float depthCurve = smoothstep(0.0, 0.8, fissureDepth);
      float darkness = mix(1.0, 0.35, depthCurve);
      finalColor *= mix(1.0, darkness, fs);
      finalColor = mix(finalColor, uFissureTint, depthCurve * 0.5 * fs);
      if (uVeinIntensity > 0.01) {
        float veinPattern = snoise(vObjPosition * uVeinScale * 2.5);
        float veinPattern2 = snoise(vObjPosition * uVeinScale * 5.0 + vec3(7.0));
        float vein = smoothstep(0.15, 0.45, abs(veinPattern));
        vein = pow(1.0 - vein, 2.5);
        float veinFine = smoothstep(0.2, 0.5, abs(veinPattern2));
        veinFine = pow(1.0 - veinFine, 3.0) * 0.4;
        float veinTotal = (vein + veinFine) * fissureDepth * uVeinIntensity * 1.5 * fs;
        finalColor = mix(finalColor, uVeinColor, clamp(veinTotal, 0.0, 1.0));
      }
      float edgeGlow = smoothstep(0.3, 0.0, fissureDepth);
      finalColor *= (1.0 + edgeGlow * 0.1 * fs);
    }

    if (layerEdge > 0.01 && uLayerShading > 0.01) {
      float ls = uLayerShading * fi;
      float bandNoise = snoise(vObjPosition * 8.0);
      float bandPattern = sin(dot(vObjPosition, normalize(vec3(0.3, 1.0, 0.2))) * 15.0 + bandNoise * 2.0);
      float band = smoothstep(-0.2, 0.2, bandPattern) * layerEdge;
      finalColor = mix(finalColor, uLayerTint, band * 0.3 * ls);
      finalColor *= mix(1.0, 0.9, layerEdge * 0.4 * ls);
    }
  }

  if (uVeinIntensity > 0.01) {
    bool skipVein = uFeatureIntensity > 0.01 && uFissureShading > 0.01 && fissureDepth > 0.1;
    if (!skipVein) {
      float veinNoise = snoise(vObjPosition * uVeinScale);
      float veinNoise2 = snoise(vObjPosition * uVeinScale * 2.3 + vec3(13.0));
      float vein = smoothstep(0.3, 0.5, abs(veinNoise));
      vein = pow(1.0 - vein, 3.0) * uVeinIntensity;
      float veinFine = pow(1.0 - smoothstep(0.35, 0.55, abs(veinNoise2)), 4.0) * uVeinIntensity * 0.3;
      finalColor = mix(finalColor, uVeinColor, vein + veinFine);
    }
  }

  if (uDustAmount > 0.01) {
    float slopeFactor = smoothstep(0.3, 0.8, vSlope);
    float dustMask = slopeFactor * uDustAmount;

    if (uFeatureIntensity > 0.01) {
      dustMask += craterFloor * uDustAmount * 0.6 * uFeatureIntensity * uCraterShading;
      dustMask *= mix(1.0, 0.4, boulder * uFeatureIntensity * uBoulderShading);
      dustMask *= mix(1.0, 0.5, ridge * uFeatureIntensity * uRidgeShading);
      dustMask *= mix(1.0, 0.15, fissureDepth * uFeatureIntensity * uFissureShading);
    }

    float dustNoise = snoise(vObjPosition * 6.0) * 0.15 + snoise(vObjPosition * 15.0) * 0.08;
    dustMask += dustNoise * uDustAmount;
    dustMask = clamp(dustMask, 0.0, 1.0);
    finalColor = mix(finalColor, uDustColor, dustMask);
  }

  if (uSubsurface > 0.01) {
    float backLight = clamp(dot(-vWorldNormal, normalize(uSunDirectionWorld)), 0.0, 1.0);
    float sss = pow(backLight, 2.5);
    float sssFactor = uSubsurface;

    if (uFeatureIntensity > 0.01) {
      sssFactor *= (1.0 + fissureDepth * 3.0 * uFeatureIntensity * uFissureShading);
      sssFactor += boulder * uSubsurface * 0.5 * uFeatureIntensity * uBoulderShading;
    }

    finalColor += finalColor * sss * sssFactor * 0.5;
  }

  if (uFrostAmount > 0.01) {
    float concavity = smoothstep(0.2, 0.7, vSlope);
    float exposure = 1.0 - clamp(dot(vObjNormal, normalize(uMaterialDirectionObject)), 0.0, 1.0);
    float frostMask = mix(exposure, concavity, uFrostBias) * uFrostAmount;
    if (uFeatureIntensity > 0.01) {
      float crfF = max(vFeature.r, 0.0);
      float fisF = vFeature.b;
      frostMask += crfF * uFrostAmount * 0.5 * uFeatureIntensity;
      frostMask += fisF * uFrostAmount * 0.3 * uFeatureIntensity;
    }
    float frostN = snoise(vObjPosition * 8.0) * 0.2 + snoise(vObjPosition * 20.0) * 0.1;
    frostMask = clamp(frostMask + frostN * uFrostAmount, 0.0, 1.0);
    finalColor = mix(finalColor, uFrostColor, frostMask);
  }

  if (uWeatherAmount > 0.01) {
    float convexity = 1.0 - smoothstep(0.3, 0.8, vSlope);
    float solarExposure = clamp(dot(vObjNormal, normalize(uMaterialDirectionObject)), 0.0, 1.0);
    float weatherMask = mix(convexity, solarExposure, uDirectionBias) * uWeatherAmount;
    if (uFeatureIntensity > 0.01) {
      weatherMask += vFeature.g * uWeatherAmount * 0.3 * uFeatureIntensity;
      weatherMask += vFeature2.r * uWeatherAmount * 0.2 * uFeatureIntensity;
      weatherMask *= mix(1.0, 0.2, vFeature.b * uFeatureIntensity);
    }
    float weatherN = snoise(vObjPosition * 5.0) * 0.12;
    weatherMask = clamp(weatherMask + weatherN * uWeatherAmount, 0.0, 1.0);
    finalColor = mix(finalColor, finalColor * uWeatherTint * 2.0, weatherMask);
  }

  if (uAoStrength > 0.01) {
    float cavity = 1.0 - smoothstep(0.2, 0.8, vSlope);
    float aoNoise = snoise(vObjPosition * (3.0 + uAoRadius * 10.0)) * 0.15;
    float ao = 1.0 - (cavity + aoNoise) * uAoStrength;
    if (uFeatureIntensity > 0.01) {
      float crfAo = max(vFeature.r, 0.0);
      float fisAo = vFeature.b;
      ao -= crfAo * 0.3 * uAoStrength * uFeatureIntensity;
      ao -= fisAo * 0.4 * uAoStrength * uFeatureIntensity;
    }
    ao = clamp(ao, 0.0, 1.0);
    finalColor *= ao;
  }

  diffuseColor.rgb = finalColor;
`;

const EMISSION_BLOCK = /* glsl */ `
if (uEmissionIntensity > 0.01) {
  float emPattern;
  if (uEmissionPattern < 0.5) {
    float n = snoise(vObjPosition * 8.0);
    emPattern = smoothstep(0.4, 0.6, n);
  } else if (uEmissionPattern < 1.5) {
    float n1 = snoise(vObjPosition * 5.0);
    float n2 = snoise(vObjPosition * 12.0 + vec3(7.0));
    float vein = pow(1.0 - smoothstep(0.2, 0.45, abs(n1)), 3.0);
    float veinFine = pow(1.0 - smoothstep(0.25, 0.5, abs(n2)), 4.0) * 0.5;
    emPattern = vein + veinFine;
  } else {
    float n = fbm(vObjPosition * 3.0, 3);
    emPattern = smoothstep(0.1, 0.5, n);
  }
  if (uFeatureIntensity > 0.01) {
    emPattern += vFeature.b * 0.5 * uFeatureIntensity;
    emPattern += max(vFeature.r, 0.0) * 0.3 * uFeatureIntensity;
  }
  emPattern = clamp(emPattern, 0.0, 1.0);
  totalEmissiveRadiance += uEmissionColor * uEmissionIntensity * emPattern;
}
`;

const textureLoader = new THREE.TextureLoader();
const textureCache = new Map<string, AsteroidTextureSet>();
const dummyTexture = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1, THREE.RGBAFormat);
dummyTexture.needsUpdate = true;
const dummyNormal = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1, THREE.RGBAFormat);
dummyNormal.needsUpdate = true;

export function createAsteroidTextureUrlResolver(basePath: string): AsteroidTextureUrlResolver {
  const normalizedBase = basePath.endsWith("/") ? basePath : `${basePath}/`;
  return (textureId, kind) => {
    const ext = textureId.startsWith("acg_") ? "jpg" : "png";
    return `${normalizedBase}${textureId}_${kind}.${ext}`;
  };
}

export function getAsteroidDummyTextureSet(): AsteroidTextureSet {
  return { diffuse: dummyTexture, normal: dummyNormal };
}

export function isKnownAsteroidTextureId(value: string): value is (typeof ASTEROID_TEXTURE_LIST)[number] {
  return (ASTEROID_TEXTURE_LIST as readonly string[]).includes(value);
}

export function loadAsteroidTextureSet(textureId: string, options: LoadAsteroidTextureSetOptions): AsteroidTextureSet {
  if (textureId === "none") return getAsteroidDummyTextureSet();

  const key = `${options.cacheKey ?? "default"}:${textureId}`;
  const cached = textureCache.get(key);
  if (cached) return cached;

  const loader = options.loader ?? textureLoader;
  const diffuse = loader.load(options.resolveUrl(textureId, "diffuse"));
  diffuse.wrapS = diffuse.wrapT = THREE.RepeatWrapping;
  diffuse.colorSpace = THREE.SRGBColorSpace;

  const normal = loader.load(options.resolveUrl(textureId, "normal"));
  normal.wrapS = normal.wrapT = THREE.RepeatWrapping;

  const set = { diffuse, normal };
  textureCache.set(key, set);
  return set;
}

export function createAsteroidShaderUniforms(): AsteroidShaderUniforms {
  return {
    uBaseColor: { value: new THREE.Color() },
    uColorVariation: { value: 0 },
    uColorVariationScale: { value: 2.5 },
    uDustAmount: { value: 0 },
    uDustColor: { value: new THREE.Color() },
    uVeinIntensity: { value: 0 },
    uVeinScale: { value: 3 },
    uVeinColor: { value: new THREE.Color() },
    uSubsurface: { value: 0 },
    uFeatureIntensity: { value: 0 },
    uCraterShading: { value: 1 },
    uCraterTint: { value: new THREE.Color() },
    uBoulderShading: { value: 1 },
    uBoulderTint: { value: new THREE.Color() },
    uRidgeShading: { value: 1 },
    uRidgeTint: { value: new THREE.Color() },
    uFissureShading: { value: 1 },
    uFissureTint: { value: new THREE.Color() },
    uLayerShading: { value: 1 },
    uLayerTint: { value: new THREE.Color() },
    uNormalStrength: { value: 1 },
    uDiffuseMap: { value: dummyTexture },
    uNormalMap: { value: dummyNormal },
    uHasTexture: { value: 0 },
    uApplyTint: { value: 0 },
    uTriplanarSharpness: { value: 4.0 },
    uAoStrength: { value: 0 },
    uAoRadius: { value: 0.5 },
    uFrostAmount: { value: 0 },
    uFrostColor: { value: new THREE.Color("#c8e8ff") },
    uFrostBias: { value: 0.5 },
    uWeatherAmount: { value: 0 },
    uWeatherTint: { value: new THREE.Color("#4a3525") },
    uDirectionBias: { value: 0.5 },
    uEmissionColor: { value: new THREE.Color("#ff4400") },
    uEmissionIntensity: { value: 0 },
    uEmissionPattern: { value: 0 },
    uSunDirectionWorld: { value: new THREE.Vector3(1, 0, 0) },
    uMaterialDirectionObject: { value: new THREE.Vector3(1, 0.3, 0.2).normalize() },
    uObjectToViewNormalMatrix: { value: new THREE.Matrix3() },
  };
}

export function patchAsteroidMaterialShader(shader: PatchableAsteroidShader, uniforms: AsteroidShaderUniforms): void {
  Object.assign(shader.uniforms, uniforms);

  shader.vertexShader = shader.vertexShader.replace(
    "#include <common>",
    `#include <common>\n${VERTEX_CHUNKS}`,
  );
  shader.vertexShader = shader.vertexShader.replace(
    "#include <begin_vertex>",
    `#include <begin_vertex>\n${VERTEX_MAIN}`,
  );

  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <common>",
    `#include <common>\n${SHADER_PREAMBLE}\n${FRAG_UNIFORMS}`,
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <normal_fragment_maps>",
    `#include <normal_fragment_maps>\n${NORMAL_PERTURBATION}`,
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <roughnessmap_fragment>",
    `#include <roughnessmap_fragment>\n${ROUGHNESS_MOD}`,
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <metalnessmap_fragment>",
    `#include <metalnessmap_fragment>\n${METALNESS_MOD}`,
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <color_fragment>",
    `#include <color_fragment>\n${FRAG_COLOR}`,
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <emissivemap_fragment>",
    `#include <emissivemap_fragment>\n${EMISSION_BLOCK}`,
  );
}

export function asteroidEmissionPatternToIndex(pattern: string): number {
  return pattern === "spots" ? 0.0 : pattern === "veins" ? 1.0 : 2.0;
}

export function applyAsteroidMaterialParams(
  material: THREE.MeshStandardMaterial,
  uniforms: AsteroidShaderUniforms,
  params: AsteroidMaterialParams,
  options?: { textureSet?: AsteroidTextureSet },
): void {
  const merged = { ...DEFAULT_ASTEROID_MATERIAL_PARAMS, ...params };
  const textureSet = options?.textureSet ?? getAsteroidDummyTextureSet();

  material.color.set(merged.baseColor);
  material.roughness = merged.roughness;
  material.metalness = merged.metalness;

  uniforms.uBaseColor.value.set(merged.baseColor);
  uniforms.uColorVariation.value = merged.colorVariation;
  uniforms.uColorVariationScale.value = merged.colorVariationScale;
  uniforms.uDustAmount.value = merged.dustAmount;
  uniforms.uDustColor.value.set(merged.dustColor);
  uniforms.uVeinIntensity.value = merged.veinIntensity;
  uniforms.uVeinScale.value = merged.veinScale;
  uniforms.uVeinColor.value.set(merged.veinColor);
  uniforms.uSubsurface.value = merged.subsurface;
  uniforms.uFeatureIntensity.value = merged.featureIntensity;
  uniforms.uCraterShading.value = merged.craterShading;
  uniforms.uCraterTint.value.set(merged.craterTint);
  uniforms.uBoulderShading.value = merged.boulderShading;
  uniforms.uBoulderTint.value.set(merged.boulderTint);
  uniforms.uRidgeShading.value = merged.ridgeShading;
  uniforms.uRidgeTint.value.set(merged.ridgeTint);
  uniforms.uFissureShading.value = merged.fissureShading;
  uniforms.uFissureTint.value.set(merged.fissureTint);
  uniforms.uLayerShading.value = merged.layerShading;
  uniforms.uLayerTint.value.set(merged.layerTint);
  uniforms.uNormalStrength.value = merged.normalStrength;
  uniforms.uDiffuseMap.value = textureSet.diffuse;
  uniforms.uNormalMap.value = textureSet.normal;
  uniforms.uHasTexture.value = merged.texture !== "none" ? 1 : 0;
  uniforms.uApplyTint.value = merged.applyTint ? 1 : 0;
  uniforms.uAoStrength.value = merged.aoStrength;
  uniforms.uAoRadius.value = merged.aoRadius;
  uniforms.uFrostAmount.value = merged.frostAmount;
  uniforms.uFrostColor.value.set(merged.frostColor);
  uniforms.uFrostBias.value = merged.frostBias;
  uniforms.uWeatherAmount.value = merged.weatherAmount;
  uniforms.uWeatherTint.value.set(merged.weatherTint);
  uniforms.uDirectionBias.value = merged.directionBias;
  uniforms.uEmissionColor.value.set(merged.emissionColor);
  uniforms.uEmissionIntensity.value = merged.emissionIntensity;
  uniforms.uEmissionPattern.value = asteroidEmissionPatternToIndex(merged.emissionPattern);
}
