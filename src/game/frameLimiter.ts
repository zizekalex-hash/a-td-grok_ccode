/**
 * Frame-rate cap and render resolution, shared by every game loop and the flash
 * panel. No path aliases, so the tests can load it directly.
 */

/** A cap at or above this means no cap: draw every frame the display offers. */
export const UNCAPPED_FPS = 120;

/** Frames the running game has drawn, read by the frame-rate counter. */
export const frameStats = { draws: 0 };

/**
 * Decides, frame by frame, whether to draw. It keeps a running budget, so a cap
 * that does not divide the display rate evenly (45 on a 60 Hz screen) still
 * averages out to the cap rather than dropping to the next lower divisor.
 */
export class FrameLimiter {
  private budget = 0;
  private prev = 0;

  /** True when a frame should be drawn at time t (ms), for a cap in frames per second. */
  ready(t: number, cap: number): boolean {
    const first = this.prev === 0;
    const since = first ? 0 : t - this.prev;
    this.prev = t;
    if (first || !(cap > 0) || cap >= UNCAPPED_FPS) {
      this.budget = 0;
      return true;
    }
    const gap = 1000 / cap;
    this.budget += since;
    // Half a millisecond of slack absorbs the jitter in display timestamps.
    if (this.budget + 0.5 < gap) return false;
    this.budget = Math.min(gap, Math.max(0, this.budget - gap));
    return true;
  }
}

/**
 * Pixel ratio to draw at: the device's own (at most 2, beyond which phones gain
 * nothing visible), scaled by the render-resolution setting in percent, never below 0.5.
 */
export function renderDpr(deviceRatio: number, scalePercent: number): number {
  const device = Math.min(2, deviceRatio > 0 ? deviceRatio : 1);
  return Math.max(0.5, (device * Math.max(10, Math.min(100, scalePercent))) / 100);
}
