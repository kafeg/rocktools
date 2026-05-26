import { useStudioStore, polarToCartesian } from "../stores/useStudioStore";

export default function SceneLighting() {
  const lights = useStudioStore((s) => s.lights);

  return (
    <>
      {lights.map((light) => {
        if (!light.enabled) return null;
        const pos = light.type !== "ambient" ? polarToCartesian(light.azimuth, light.elevation, light.distance) : undefined;
        switch (light.type) {
          case "ambient":
            return <ambientLight key={light.id} intensity={light.intensity} color={light.color} />;
          case "directional":
            return <directionalLight key={light.id} position={pos} intensity={light.intensity} color={light.color} />;
          case "point":
            return <pointLight key={light.id} position={pos} intensity={light.intensity} distance={light.distance * 3} color={light.color} />;
          default:
            return null;
        }
      })}
    </>
  );
}
