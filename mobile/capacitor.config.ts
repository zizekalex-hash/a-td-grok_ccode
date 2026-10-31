import type { CapacitorConfig } from "@capacitor/cli";

// The game runs entirely on the phone. www/ is built from the offline game
// (vite.offline.config.ts) and nothing is loaded from the internet.
const config: CapacitorConfig = {
  appId: "app.azshara.signaldefense",
  appName: "Azshara's Signal Defense",
  webDir: "www",
};

export default config;
