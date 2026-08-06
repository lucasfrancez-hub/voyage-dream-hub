// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import fs from "node:fs";
import path from "node:path";

// Identidade única desta build. Vai embutida no bundle (__APP_BUILD_ID__) e
// publicada em /version.json — é a base do handshake de versão que detecta
// aplicativos antigos abertos no celular depois de um novo deploy.
const BUILD_ID = new Date().toISOString();

function escreverVersionJson() {
  try {
    const dir = path.resolve(process.cwd(), "public");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "version.json"),
      `${JSON.stringify({ version: BUILD_ID }, null, 2)}\n`,
    );
  } catch {
    /* build segue mesmo sem conseguir escrever */
  }
}

escreverVersionJson();

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    define: {
      __APP_BUILD_ID__: JSON.stringify(BUILD_ID),
    },
    plugins: [
      {
        name: "viaair-build-version",
        buildStart() {
          escreverVersionJson();
        },
      },
    ],
  },
});
