import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The publisher's other app's order, which is not taste: `cloudflare()` installs the Workers
// environment before `tanstackStart()` decides what a server entry is, and `viteReact()` comes last
// to transform the JSX `tanstackStart()` generates for the route tree. `viteEnvironment: ssr` runs
// the Start server inside the Worker, so dev and deploy are one runtime.
export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
  resolve: { tsconfigPaths: true },
  server: { port: 3043 },
});
