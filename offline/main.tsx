import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { StatusBar } from "@capacitor/status-bar";
import "@fontsource/orbitron/500.css";
import "@fontsource/orbitron/700.css";
import "@fontsource/share-tech-mono/400.css";
import "@/styles.css";
import { Stage } from "@/components/game/Stage";

// The phone build has no server behind it: the game runs entirely on the device.
// Keep the game below the Android status bar so the HUD is never drawn under it.
if (Capacitor.isNativePlatform()) {
  StatusBar.setOverlaysWebView({ overlay: false }).catch(() => undefined);
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");
createRoot(root).render(<Stage />);
