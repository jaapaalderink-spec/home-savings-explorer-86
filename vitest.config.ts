import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Integratietests schrijven naar de gedeelde database; alleen met RUN_DB_INTEGRATION_TESTS=true.
    exclude: process.env["RUN_DB_INTEGRATION_TESTS"] === "true" ? ["node_modules/**"] : ["node_modules/**", "**/*.integration.test.ts"],
  },
});
