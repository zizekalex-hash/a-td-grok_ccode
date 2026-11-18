import { useEffect, useSyncExternalStore } from "react";
import { readLooks } from "@/game/court/looks";
import { looksRev, subscribeLooks } from "@/game/court/portrait";

/**
 * Whoever shows a portrait draws again when a look changes in the Atelier. The
 * looks kept on the device are read the first time a page asks.
 */
export function useLooks(): number {
  useEffect(() => {
    readLooks();
  }, []);
  return useSyncExternalStore(subscribeLooks, looksRev, () => 0);
}
