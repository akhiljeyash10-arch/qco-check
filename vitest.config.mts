import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Native tsconfig path resolution (Vite 8) replaces the
  // vite-tsconfig-paths plugin so tests import app modules the same way the
  // app does via the `@/*` alias.
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    // Loads .env into process.env before tests (Next.js does this for the app;
    // vitest does not). See vitest.setup.ts.
    setupFiles: ["vitest.setup.ts"],
    include: [
      "tests/**/*.{test,spec}.{ts,tsx}",
      "lib/**/*.{test,spec}.{ts,tsx}",
      "app/**/*.{test,spec}.{ts,tsx}",
    ],
    exclude: ["node_modules/**", ".next/**", "out/**", "build/**"],
  },
});
