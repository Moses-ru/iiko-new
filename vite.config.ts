import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Репозиторий — https://moses-ru.github.io/iiko-miniapp-proxy/, это проектная
// (не пользовательская) GitHub Pages страница, поэтому все ассеты должны
// резолвиться от подпути /iiko-miniapp-proxy/, а не от корня домена.
// Если переименуете репозиторий — поменяйте base здесь же.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/iiko-miniapp-proxy/",
  build: {
    outDir: "dist",
  },
});
