import { defineConfig } from "tsup";
export default defineConfig({
  entry: ["src/index.ts", "src/core.ts"],
  format: ["esm"],
  dts: true,
  bundle: true,
  external: ["react", "react-dom", "@xyflow/react"],
  target: "es2020",
  clean: true,
});
