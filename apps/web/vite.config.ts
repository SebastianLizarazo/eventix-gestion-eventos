import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Configuración de la interfaz web de Eventix.
 *
 * Dos decisiones que no son negociables:
 *
 * - **El proxy de `/api`**: el navegador solo habla con este mismo origen. El
 *   servidor de Vite reenvía `/api` a la API que corre en `localhost:3000`, así
 *   que la interfaz no necesita CORS y la API no necesita un solo cambio de
 *   configuración.
 * - **El alias `@`**: los imports internos apuntan a `src`, no a rutas relativas
 *   que cambian cuando un archivo se mueve.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    css: false,
    restoreMocks: true,
  },
});
