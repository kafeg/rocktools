import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { useStudioStore } from "../stores/useStudioStore";

export default function CaptureController() {
  const { gl, scene, camera } = useThree();

  useEffect(() => {
    useStudioStore.getState().setRendererRefs(gl, scene, camera);
    return () => useStudioStore.getState().setRendererRefs(null, null, null);
  }, [gl, scene, camera]);

  return null;
}
