import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  root: path.resolve(__dirname, ".."),
  plugins: [react()],
  resolve: {
    alias: {
      "@core":       path.resolve(__dirname, "../src/core"),
      "@services":   path.resolve(__dirname, "../src/services"),
      "@store":      path.resolve(__dirname, "../src/store"),
      "@components": path.resolve(__dirname, "../src/components"),
      "@hooks":      path.resolve(__dirname, "../src/hooks"),
      "@pages":      path.resolve(__dirname, "../src/pages"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "dist/renderer",
    sourcemap: true,
    target: "es2022",
  },
  css: {
    postcss: path.resolve(__dirname, "../postcss.config.cjs"),
  },
});
