import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import * as THREE from "three";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { useStudioStore, HDRI_LIST, hdriFile } from "../stores/useStudioStore";

export default function SceneBackground() {
  const bg = useStudioStore((s) => s.background);

  const hdriUrl = useMemo(() => {
    if (bg.mode !== "hdri") return null;
    if (bg.hdriCustomUrl) return bg.hdriCustomUrl;
    if (!bg.hdriId) return null;
    const entry = HDRI_LIST.find((h) => h.id === bg.hdriId);
    if (!entry) return null;
    return `${import.meta.env.BASE_URL}hdri/${hdriFile(entry, bg.hdriResolution)}`;
  }, [bg.mode, bg.hdriId, bg.hdriResolution, bg.hdriCustomUrl]);

  const isCustom = !!bg.hdriCustomUrl;
  const customFormat = isCustom && bg.hdriCustomName
    ? (bg.hdriCustomName.toLowerCase().endsWith(".hdr") ? "hdr" : "exr")
    : "exr";

  return (
    <>
      {bg.mode === "solid" && <color attach="background" args={[bg.solidColor]} />}
      {bg.mode === "starfield" && (
        <>
          <color attach="background" args={[bg.solidColor]} />
          <Starfield count={bg.starfieldDensity} />
        </>
      )}
      {bg.mode === "transparent" && <TransparentBg />}

      {bg.mode === "hdri" && hdriUrl ? (
        <>
          <color attach="background" args={["#000000"]} />
          <HdriSkybox
            url={hdriUrl}
            format={customFormat}
            radius={bg.hdriScale}
            intensity={bg.hdriIntensity}
            rotation={bg.hdriRotation}
          />
          {!isCustom && (
            <Environment
              files={hdriUrl}
              background={false}
            />
          )}
        </>
      ) : bg.mode !== "transparent" ? (
        <Environment preset="night" background={false} />
      ) : null}

      {bg.showDust && bg.mode !== "transparent" && <AmbientDust />}
    </>
  );
}

function TransparentBg() {
  const { gl } = useThree();
  gl.setClearColor(0x000000, 0);
  return null;
}

function HdriSkybox({ url, format, radius, intensity, rotation }: {
  url: string; format: "exr" | "hdr"; radius: number; intensity: number; rotation: number;
}) {
  const [texture, setTexture] = useState<THREE.DataTexture | null>(null);
  const prevUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (url === prevUrlRef.current) return;
    prevUrlRef.current = url;

    const loader = format === "hdr" ? new RGBELoader() : new EXRLoader();
    loader.load(url, (tex) => {
      tex.mapping = THREE.EquirectangularReflectionMapping;
      setTexture((prev) => { prev?.dispose(); return tex; });
    });

    return () => { setTexture((prev) => { prev?.dispose(); return null; }); };
  }, [url, format]);

  if (!texture) return null;

  const rotRad = rotation * Math.PI / 180;

  return (
    <mesh rotation={[0, rotRad, 0]} frustumCulled={false}>
      <sphereGeometry args={[radius, 64, 32]} />
      <meshBasicMaterial
        map={texture}
        side={THREE.BackSide}
        toneMapped={false}
        depthWrite={false}
        opacity={intensity}
        transparent={intensity < 1}
      />
    </mesh>
  );
}

function Starfield({ count }: { count: number }) {
  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 40 + Math.random() * 20;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [count]);

  return (
    <points geometry={geometry} frustumCulled={false}>
      <pointsMaterial
        color="#c8d0e8"
        size={0.08}
        sizeAttenuation
        transparent
        opacity={0.7}
        depthWrite={false}
      />
    </points>
  );
}

function AmbientDust() {
  const ref = useRef<THREE.Points>(null);

  const geometry = useMemo(() => {
    const count = 300;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 12;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 12;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 12;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geo;
  }, []);

  useFrame((_, delta) => {
    if (!ref.current) return;
    ref.current.rotation.y += delta * 0.02;
    ref.current.rotation.x += delta * 0.008;
  });

  return (
    <points ref={ref} geometry={geometry} frustumCulled={false}>
      <pointsMaterial
        color="#8090b0"
        size={0.015}
        sizeAttenuation
        transparent
        opacity={0.35}
        depthWrite={false}
      />
    </points>
  );
}
