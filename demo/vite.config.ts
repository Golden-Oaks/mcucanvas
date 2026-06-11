import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

export default defineConfig({
  base: "/mcucanvas/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      mcucanvas: resolve(__dirname, "../src/index.ts"),
    },
    dedupe: ["react", "react-dom", "@xyflow/react"],
  },
});
