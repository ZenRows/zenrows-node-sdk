// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/_setup.ts"],
    // Type-level assertions (expectTypeOf) only run under typecheck.
    typecheck: { enabled: true, tsconfig: "./tsconfig.test.json", include: ["tests/**/*.test.ts"] },
    coverage: {
      include: ["src/**"],
      exclude: ["examples/**"],
    },
  },
});
