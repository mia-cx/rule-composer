import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "scripts/index.ts",
    "scripts/compose/index.ts",
    "scripts/decompose/index.ts",
    "scripts/compose/variants.ts",
  ],
  format: ["esm"],
  target: "node18",
  outDir: "dist",
  clean: true,
  splitting: true,
  sourcemap: true,
  dts: false,
  shims: true,
  banner: ({ entryPoint }) => {
    if (entryPoint === "scripts/index.ts") {
      return { js: "#!/usr/bin/env node" };
    }
    return {};
  },
});
