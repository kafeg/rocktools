import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "child_process";

function getVersion() {
  try {
    const count = execSync("git rev-list --count HEAD", { encoding: "utf-8" }).trim();
    return `0.1.${count}`;
  } catch {
    return "0.1.0";
  }
}

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: process.env.ROCKTOOLS_BASE ?? (command === "build" ? "/rocktools/" : "/"),
  define: {
    __APP_VERSION__: JSON.stringify(getVersion()),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().split("T")[0]),
  },
  server: {
    port: 3801,
  },
}));
