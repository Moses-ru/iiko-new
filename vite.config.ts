import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// GitHub Pages repo: https://moses-ru.github.io/iiko-new/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/iiko-new/",
  server: {
    proxy: {
      "/worker": {
        target: "https://iiko-miniapp-proxy.iiko-miniapp-proxy.workers.dev",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/worker/, ""),
        headers: { Origin: "https://moses-ru.github.io" },
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
