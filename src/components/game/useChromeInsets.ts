import { useEffect, type RefObject } from "react";
import { useGame } from "@/game/store";

/**
 * Reports how much of the canvas the HUD panels cover, so the text field is
 * fitted to the space that is actually visible.
 */
export function useChromeInsets(
  headerRef: RefObject<HTMLElement | null>,
  footerRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    const measure = () => {
      const canvas = document.querySelector<HTMLElement>('[data-testid="battlefield"]');
      const header = headerRef.current;
      const footer = footerRef.current;
      if (!canvas || !header || !footer) return;
      const c = canvas.getBoundingClientRect();
      const f = footer.getBoundingClientRect();
      // A narrow footer on the right-hand side is a sidebar: it takes width, not height.
      const side = f.width < c.width * 0.6 && f.left > c.left + c.width * 0.45;
      const top = Math.max(0, header.getBoundingClientRect().bottom - c.top);
      const bottom = side ? 0 : Math.max(0, c.bottom - f.top);
      const right = side ? Math.max(0, c.right - f.left) : 0;
      const cur = useGame.getState().chrome;
      if (
        Math.abs(cur.top - top) > 0.5 ||
        Math.abs(cur.bottom - bottom) > 0.5 ||
        Math.abs(cur.right - right) > 0.5
      ) {
        useGame.setState({ chrome: { top, bottom, right } });
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (headerRef.current) ro.observe(headerRef.current);
    if (footerRef.current) ro.observe(footerRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [headerRef, footerRef]);
}
