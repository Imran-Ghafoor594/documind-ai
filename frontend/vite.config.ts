import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// In development, /api is proxied to the Flask backend so no CORS setup is needed.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": "http://127.0.0.1:5000" } },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/__tests__/setup.ts"],
    include: ["src/__tests__/**/*.test.tsx"],
    env: { VITE_API_BASE_URL: "http://127.0.0.1:5055" },
    testTimeout: 30000,
    fileParallelism: false,
  },
});
