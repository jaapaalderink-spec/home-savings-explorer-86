// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Load all env vars into process.env for server routes only (client code keeps
// using the VITE_-prefixed injection from the shared config). Never expose
// these keys through `define` — that would leak secrets into the client bundle.
const serverEnv = loadEnv(process.env["NODE_ENV"] ?? "development", process.cwd(), "");
Object.assign(process.env, serverEnv);

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    // Pre-bundle on startup so a late dependency discovery can't load a second React copy.
    optimizeDeps: { include: ["@radix-ui/react-alert-dialog", "@tanstack/react-router"] },
    resolve: {
      alias: [
        // Pin only the legacy v4 deep imports to the hoisted entities@4.5.0 copy.
        // Exact-match regexes so newer imports like "entities/decode" (htmlparser2)
        // still resolve to their own nested entities version.
        { find: /^entities\/lib\/decode\.js$/, replacement: `${rootDir}node_modules/entities/lib/esm/decode.js` },
        { find: /^entities\/lib\/encode\.js$/, replacement: `${rootDir}node_modules/entities/lib/esm/encode.js` },
      ],
    },
  },
});
