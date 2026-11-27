import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./", // relative paths so the same build loads from file:// inside Electron
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:8000", "/media": "http://localhost:8000" },
  },
  build: { outDir: "dist", sourcemap: false, chunkSizeWarningLimit: 1200 },
});
