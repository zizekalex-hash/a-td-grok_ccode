// Builds the game into mobile/www for the Android shell. The result is a static
// folder with no server behind it, so nothing is loaded from the internet.
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, "src");
// Same number as the APK's versionName (mobile/android/app/build.gradle).
const buildNumber = process.env.GITHUB_RUN_NUMBER;

export default defineConfig({
  root: join(root, "offline"),
  publicDir: false,
  plugins: [viteReact(), tailwindcss()],
  resolve: {
    alias: [{ find: "@", replacement: src }],
  },
  // There is no server in this build, so the agents panel shows its offline state.
  define: {
    "import.meta.env.VITE_OFFLINE_BUILD": JSON.stringify("1"),
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(buildNumber ? `1.0.${buildNumber}` : "dev"),
  },
  build: {
    outDir: join(root, "mobile", "www"),
    emptyOutDir: true,
  },
});
