/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        space: {
          bg: "#0c1220",
          panel: "rgba(14, 22, 40, 0.94)",
          border: "rgba(70, 100, 150, 0.45)",
          text: "rgba(230, 238, 250, 0.95)",
          dim: "rgba(170, 190, 215, 0.7)",
          accent: "#4da8ff",
          warm: "#ffa033",
          success: "#34d670",
          danger: "#f55",
        },
      },
    },
  },
  plugins: [],
};
