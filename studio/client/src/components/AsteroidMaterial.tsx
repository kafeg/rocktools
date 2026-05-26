import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  applyAsteroidMaterialParams,
  createAsteroidShaderUniforms,
  createAsteroidTextureUrlResolver,
  getAsteroidDummyTextureSet,
  loadAsteroidTextureSet,
  patchAsteroidMaterialShader,
  type AsteroidTextureSet,
} from "../runtime/asteroid";
import { useStudioStore } from "../stores/useStudioStore";

const studioTextureResolver = createAsteroidTextureUrlResolver(`${import.meta.env.BASE_URL}textures/`);

export default function AsteroidMaterial({ wireframe }: { wireframe: boolean }) {
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const textureRef = useRef<{ id: string; set: AsteroidTextureSet }>({
    id: "none",
    set: getAsteroidDummyTextureSet(),
  });
  const uniforms = useMemo(() => createAsteroidShaderUniforms(), []);

  useFrame(() => {
    const mat = materialRef.current;
    if (!mat) return;

    const params = useStudioStore.getState().collectShaderParams();
    const texId = String(params.texture ?? "none");

    if (texId !== textureRef.current.id) {
      textureRef.current = {
        id: texId,
        set: loadAsteroidTextureSet(texId, {
          resolveUrl: studioTextureResolver,
          cacheKey: "studio-runtime",
        }),
      };
    }

    applyAsteroidMaterialParams(mat, uniforms, params, { textureSet: textureRef.current.set });
  });

  const params = useStudioStore.getState().collectShaderParams();

  return (
    <meshStandardMaterial
      ref={materialRef}
      color={params.baseColor}
      roughness={params.roughness}
      metalness={params.metalness}
      wireframe={wireframe}
      flatShading={!wireframe}
      onBeforeCompile={(shader) => {
        patchAsteroidMaterialShader(shader, uniforms);
        if (materialRef.current) {
          materialRef.current.userData.uniforms = uniforms;
        }
      }}
    />
  );
}
