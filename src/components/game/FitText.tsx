import { useLayoutEffect, useRef, type ElementType, type ReactNode } from "react";

/**
 * Text that always shows whole: in a box of a fixed height it starts at `max` px and
 * shrinks (down to `min`) until all of it fits, never cut off or hidden. Fits again
 * when the box or the text changes.
 */
export function FitText({
  children,
  className = "",
  max = 14,
  min = 5,
  as: Tag = "p",
  ...rest
}: {
  children: ReactNode;
  className?: string;
  max?: number;
  min?: number;
  as?: ElementType;
  role?: string;
  "aria-live"?: "polite" | "off" | "assertive";
}) {
  const ref = useRef<HTMLElement>(null);
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    let size = max;
    el.style.fontSize = `${size}px`;
    while (size > min && (el.scrollHeight > el.clientHeight + 0.5 || el.scrollWidth > el.clientWidth + 0.5)) {
      size -= 0.5;
      el.style.fontSize = `${size}px`;
    }
  };
  useLayoutEffect(() => {
    fit();
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let w = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (Math.abs(el.clientWidth - w) > 0.5) {
        w = el.clientWidth;
        fit();
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  });
  return (
    <Tag ref={ref} className={`overflow-hidden ${className}`} {...rest}>
      {children}
    </Tag>
  );
}
