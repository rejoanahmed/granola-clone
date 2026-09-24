import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Only pure modules are unit-tested here: tokens and the route guards. Anything that reaches
// react-native or expo-router at runtime is mocked in the test file itself, because vitest runs on
// node and cannot parse React Native's Flow sources — the UI is Maestro's job, not this suite's.
export default defineConfig({
  resolve: {
    alias: {
      "@native": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.ts"],
  },
});
