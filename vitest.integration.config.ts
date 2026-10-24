import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@sentinel/contracts": path.resolve(__dirname, "./packages/contracts/src/index.ts"),
      "@sentinel/domain": path.resolve(__dirname, "./packages/domain/src/index.ts"),
      "@sentinel/application": path.resolve(__dirname, "./packages/application/src/index.ts"),
      "@sentinel/infra": path.resolve(__dirname, "./packages/infra/src/index.ts"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
