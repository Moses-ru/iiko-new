import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// GitHub Pages repo: https://moses-ru.github.io/iiko-new/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/iiko-new/",
  build: {
    outDir: "dist",
  },
});
