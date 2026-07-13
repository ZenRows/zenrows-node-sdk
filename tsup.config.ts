import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "batch/index": "src/batch/index.ts",
  },
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
});
