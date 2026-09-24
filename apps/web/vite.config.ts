import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Plugin order is not taste: `cloudflare()` installs the Workers environment before
// `tanstackStart()` decides what a server entry is, and `viteReact()` must come last to transform
// the JSX `tanstackStart()` generates for the route tree. `viteEnvironment: { name: "ssr" }` runs
// the Start server inside the Worker — without it, dev and deploy are two different runtimes.
// `tanstackStart()` also generates `src/routeTree.gen.ts`, which is why `router.tsx` can import a
// route tree nobody wrote.
const config = defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
  resolve: {
    // Picks up `paths: { "@web/*": ... }` from tsconfig.json instead of restating it here.
    tsconfigPaths: true,
  },
  server: {
    // The API is reached by absolute URL (VITE_API_URL), not a dev proxy: cookies and CORS then
    // behave in development as they do in production, the only way `credentials: "include"` is
    // exercised before deploy.
    port: 3003,
  },
});

export default config;
