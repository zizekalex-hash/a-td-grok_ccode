/**
 * The Legion matrix made off the page's thread (it can take a while): the page
 * stays live, its progress comes as messages, and stopping is ending it.
 */
import { buildMatrix, type LegionSettings } from "./legion.ts";

interface Ask {
  phrases: string[];
  rate: number;
  settings: LegionSettings;
}

const post = (msg: unknown, transfer: Transferable[] = []) =>
  (self as unknown as { postMessage(m: unknown, t: Transferable[]): void }).postMessage(
    msg,
    transfer,
  );

self.onmessage = async (e: MessageEvent<Ask>) => {
  const { phrases, rate, settings } = e.data;
  try {
    const m = await buildMatrix(phrases, rate, settings, (note, part) =>
      post({ type: "step", note, part }),
    );
    post({ type: "done", loop: m.loop, burst: m.burst, rate: m.rate, layers: m.layers }, [
      m.loop.buffer,
      m.burst.buffer,
    ]);
  } catch (err) {
    post({ type: "error", message: String((err as Error)?.message ?? err) });
  }
};
