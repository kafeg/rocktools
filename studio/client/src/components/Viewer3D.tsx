import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import * as THREE from "three";
import { useStudioStore } from "../stores/useStudioStore";
import AsteroidMaterial from "./AsteroidMaterial";
import CanvasErrorBoundary from "./CanvasErrorBoundary";
import SceneLighting from "./SceneLighting";
import SceneBackground from "./SceneBackground";
import CaptureController from "./CaptureController";
import { parseOBJToMeshData, validateMesh, type MeshData } from "../utils/meshModifiers";
import { meshDataToGeometry } from "../utils/export";
import { MESH_MODIFIER_MAP } from "../utils/modifierMap";
import type { RockInstance } from "../utils/terrain";


function AsteroidMesh({ onModifying, onMeshError }: { onModifying: (v: boolean) => void; onMeshError: (e: string | null) => void }) {
  const meshObj = useStudioStore((s) => s.currentMeshObj);
  const wireframe = useStudioStore((s) => s.wireframe);
  const autoRotate = useStudioStore((s) => s.autoRotate);
  const hasFxSteps = useStudioStore((s) => s.steps.some((st) => st.tool.startsWith("fx:")));
  const instantGenerate = useStudioStore((s) => s.instantGenerate);
  const meshModVersion = useStudioStore((s) => s.meshModVersion);
  const meshRef = useRef<THREE.Mesh>(null);

  const meshStepsKeyRaw = useStudioStore((s) =>
    JSON.stringify(s.steps.filter((st) => st.tool.startsWith("mesh:")))
  );
  const [meshStepsKey, setMeshStepsKey] = useState(meshStepsKeyRaw);

  useEffect(() => {
    if (!instantGenerate) return;
    onModifying(true);
    const timer = setTimeout(() => {
      setMeshStepsKey(meshStepsKeyRaw);
      onModifying(false);
    }, 600);
    return () => clearTimeout(timer);
  }, [meshStepsKeyRaw, instantGenerate, onModifying]);

  useEffect(() => {
    if (instantGenerate) return;
    setMeshStepsKey(meshStepsKeyRaw);
  }, [meshModVersion, meshObj, instantGenerate, meshStepsKeyRaw]);

  const geometry = useMemo(() => {
    if (!meshObj) return null;
    onMeshError(null);

    const meshStepsRaw = JSON.parse(meshStepsKey) as { tool: string; params: Record<string, number | string | boolean>; enabled?: boolean }[];
    const meshSteps = meshStepsRaw.filter((s) => s.enabled !== false);

    if (meshSteps.length > 0) {
      let meshData = parseOBJToMeshData(meshObj);

      const preCheck = validateMesh(meshData);
      if (!preCheck.valid) {
        onMeshError(preCheck.error!);
        return null;
      }

      for (const step of meshSteps) {
        const modifier = MESH_MODIFIER_MAP[step.tool];
        if (modifier) {
          meshData = modifier.apply(meshData, step.params);
        }
      }

      const postCheck = validateMesh(meshData);
      if (!postCheck.valid) {
        onMeshError(postCheck.error!);
        return null;
      }

      return meshDataToGeometry(meshData);
    }

    const meshData = parseOBJToMeshData(meshObj);
    const check = validateMesh(meshData);
    if (!check.valid) {
      onMeshError(check.error!);
      return null;
    }

    return meshDataToGeometry(meshData);
  }, [meshObj, meshStepsKey, onMeshError]);

  // Clean up old geometries to prevent GPU memory leaks when generating or modifying asteroids
  useEffect(() => {
    return () => {
      if (geometry) {
        geometry.dispose();
      }
    };
  }, [geometry]);

  useFrame((_, delta) => {
    if (meshRef.current && autoRotate) {
      meshRef.current.rotation.y += delta * 0.3;
    }
  });

  if (!geometry) return null;

  const scale = geometry.boundingSphere
    ? 2.0 / geometry.boundingSphere.radius
    : 1;

  return (
    <mesh ref={meshRef} geometry={geometry} scale={scale}>
      {hasFxSteps ? (
        <AsteroidMaterial wireframe={wireframe} />
      ) : (
        <meshStandardMaterial
          color="#9a9a8a"
          roughness={0.85}
          metalness={0.1}
          wireframe={wireframe}
          flatShading={!wireframe}
        />
      )}
    </mesh>
  );
}

// ── Terrain (surface) rendering ──────────────────────────────────────

function RockInstances({ template, instances }: { template: MeshData; instances: RockInstance[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => meshDataToGeometry(template, { center: false }), [template]);
  useEffect(() => () => geo.dispose(), [geo]);

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const qAlign = new THREE.Quaternion();
    const qYaw = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const n = new THREE.Vector3();
    const s = new THREE.Vector3();
    const pos = new THREE.Vector3();
    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i]!;
      n.set(inst.nx, inst.ny, inst.nz);
      qAlign.setFromUnitVectors(up, n);       // lie on the slope
      qYaw.setFromAxisAngle(n, inst.rotY);    // random spin about the normal
      q.copy(qYaw).multiply(qAlign);
      s.set(inst.scale, inst.scale, inst.scale);
      pos.set(inst.x, inst.y, inst.z);
      m.compose(pos, q, s);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [instances]);

  if (instances.length === 0) return null;
  return (
    <instancedMesh ref={ref} args={[geo, undefined, instances.length]}>
      <AsteroidMaterial wireframe={false} flatMode />
    </instancedMesh>
  );
}

function TerrainView({ onMeshError }: { onMeshError: (e: string | null) => void }) {
  const terrainMesh = useStudioStore((s) => s.terrainMesh);
  const scatter = useStudioStore((s) => s.terrainScatter);
  const wireframe = useStudioStore((s) => s.wireframe);
  const footprint = useStudioStore((s) => s.terrainParams.footprint);

  const geometry = useMemo(() => {
    if (!terrainMesh) return null;
    onMeshError(null);
    const check = validateMesh(terrainMesh, { open: true });
    if (!check.valid) {
      onMeshError(check.error!);
      return null;
    }
    return meshDataToGeometry(terrainMesh, { center: false });
  }, [terrainMesh, onMeshError]);

  useEffect(() => () => { geometry?.dispose(); }, [geometry]);

  // Group rock instances per template for one InstancedMesh each.
  const grouped = useMemo(() => {
    if (!scatter) return [];
    return scatter.templates.map((t, ti) => ({
      template: t,
      instances: scatter.instances.filter((inst) => inst.templateIdx === ti),
    }));
  }, [scatter]);

  if (!geometry) return null;
  // Map the footprint to a consistent on-screen size (~5 world units wide).
  const scale = 5 / Math.max(0.001, footprint);

  return (
    <group scale={scale}>
      <mesh geometry={geometry}>
        <AsteroidMaterial wireframe={wireframe} flatMode />
      </mesh>
      {grouped.map((g, i) => (
        <RockInstances key={i} template={g.template} instances={g.instances} />
      ))}
    </group>
  );
}

/** Repositions the camera when entering/leaving surface mode (a "landed" angle). */
function CameraRig({ viewMode }: { viewMode: "globe" | "surface" }) {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    if (viewMode === "surface") camera.position.set(2.8, 2.0, 2.8);
    else camera.position.set(3, 2, 3);
    camera.lookAt(0, 0, 0);
  }, [viewMode, camera]);
  return null;
}

function SpaceGrid() {
  const showGrid = useStudioStore((s) => s.showGrid);
  if (!showGrid) return null;

  return (
    <Grid
      args={[20, 20]}
      position={[0, -2.5, 0]}
      cellSize={0.5}
      cellColor="rgba(60, 80, 120, 0.3)"
      sectionSize={2}
      sectionColor="rgba(60, 80, 120, 0.5)"
      fadeDistance={15}
      fadeStrength={1}
    />
  );
}

export default function Viewer3D() {
  const [isModifying, setIsModifying] = useState(false);
  const [asteroidError, setAsteroidError] = useState<string | null>(null);
  const [terrainError, setTerrainError] = useState<string | null>(null);
  const isGenerating = useStudioStore((s) => s.isGenerating);
  const generationProgress = useStudioStore((s) => s.generationProgress);
  const abortGeneration = useStudioStore((s) => s.abortGeneration);
  const bgMode = useStudioStore((s) => s.background.mode);
  const viewMode = useStudioStore((s) => s.viewMode);
  const isGeneratingTerrain = useStudioStore((s) => s.isGeneratingTerrain);
  const meshError = viewMode === "surface" ? terrainError : asteroidError;

  return (
    <div className="w-full h-full relative">
      <CanvasErrorBoundary>
        <Canvas
          camera={{ position: [3, 2, 3], fov: 50 }}
          gl={{ antialias: true, preserveDrawingBuffer: true, alpha: bgMode === "transparent" }}
        >
          <SceneLighting />
          <SceneBackground />
          <CaptureController />

          {/* Both stay mounted and toggle visibility — geometry/instances are
              cached in each component's useMemo, so switching tabs is instant
              and never re-runs generation or mesh rebuilds. */}
          <group visible={viewMode !== "surface"}>
            <AsteroidMesh onModifying={setIsModifying} onMeshError={setAsteroidError} />
          </group>
          <group visible={viewMode === "surface"}>
            <TerrainView onMeshError={setTerrainError} />
          </group>
          <SpaceGrid />
          <CameraRig viewMode={viewMode} />

          <OrbitControls
            enableDamping
            dampingFactor={0.1}
            minDistance={0.5}
            maxDistance={viewMode === "surface" ? 9 : 20}
            maxPolarAngle={viewMode === "surface" ? 1.5 : Math.PI}
          />
        </Canvas>
      </CanvasErrorBoundary>

      {isModifying && !isGenerating && !isGeneratingTerrain && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-space-bg/80 backdrop-blur-sm border border-space-border rounded-lg px-4 py-2">
            <span className="text-sm text-space-accent animate-pulse">
              Modifying...
            </span>
          </div>
        </div>
      )}

      {meshError && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-none">
          <div className="bg-red-900/90 backdrop-blur-sm border border-red-500/60 rounded-lg px-4 py-2 max-w-lg">
            <span className="text-sm text-red-200">{meshError}</span>
          </div>
        </div>
      )}
    </div>
  );
}
