import { defineConfig } from "vitest/config";

// Standalone test config (does not use the singlefile build plugin / root:'src').
export default defineConfig({
  root: ".",
  plugins: [],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
});
