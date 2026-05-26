import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import * as THREE from "three";
import { useStudioStore } from "../stores/useStudioStore";
import AsteroidMaterial from "./AsteroidMaterial";
import CanvasErrorBoundary from "./CanvasErrorBoundary";
import SceneLighting from "./SceneLighting";
import SceneBackground from "./SceneBackground";
import CaptureController from "./CaptureController";
import { parseOBJToMeshData, validateMesh } from "../utils/meshModifiers";
import { meshDataToGeometry } from "../utils/export";
import { MESH_MODIFIER_MAP } from "../utils/modifierMap";


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
  const [meshError, setMeshError] = useState<string | null>(null);
  const isGenerating = useStudioStore((s) => s.isGenerating);
  const generationProgress = useStudioStore((s) => s.generationProgress);
  const abortGeneration = useStudioStore((s) => s.abortGeneration);
  const bgMode = useStudioStore((s) => s.background.mode);

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

          <AsteroidMesh onModifying={setIsModifying} onMeshError={setMeshError} />
          <SpaceGrid />

          <OrbitControls
            enableDamping
            dampingFactor={0.1}
            minDistance={0.5}
            maxDistance={20}
          />
        </Canvas>
      </CanvasErrorBoundary>

      {isModifying && !isGenerating && (
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
