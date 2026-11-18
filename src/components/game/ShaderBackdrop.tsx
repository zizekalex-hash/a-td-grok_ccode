import { useEffect, useRef, useState } from "react";
import { useGame } from "@/game/store";
import {
  drawSize,
  fragmentSource,
  qualityOf,
  UNIFORMS,
  VERTEX_SOURCE,
  type ShaderKind,
  type ShaderLook,
} from "@/game/shaderart";

/** A running picture on a canvas: draw it at a time, change its size, let it go. */
interface Run {
  draw(look: ShaderLook, seconds: number): void;
  resize(w: number, h: number): void;
  dispose(): void;
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, source);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.debug("Shader art: could not compile:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

/** The shader of a kind, ready to draw on the canvas; null where there is no WebGL (or it will not compile). */
function start(canvas: HTMLCanvasElement, kind: ShaderKind): Run | null {
  let gl: WebGLRenderingContext | null = null;
  try {
    gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "low-power",
    });
  } catch {
    gl = null;
  }
  if (!gl || gl.isContextLost()) return null;
  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SOURCE);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragmentSource(kind));
  const program = gl.createProgram();
  if (!vs || !fs || !program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.debug("Shader art: could not link:", gl.getProgramInfoLog(program));
    return null;
  }
  gl.useProgram(program);
  // One triangle that covers the whole screen.
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const at = gl.getAttribLocation(program, "aPos");
  gl.enableVertexAttribArray(at);
  gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
  const u = Object.fromEntries(UNIFORMS.map((n) => [n, gl!.getUniformLocation(program, n)])) as Record<
    (typeof UNIFORMS)[number],
    WebGLUniformLocation | null
  >;
  let width = canvas.width;
  let height = canvas.height;
  let first = true;
  return {
    resize(w, h) {
      if (w === width && h === height) return;
      width = w;
      height = h;
      canvas.width = w;
      canvas.height = h;
    },
    draw(look, seconds) {
      const g = gl!;
      g.viewport(0, 0, width, height);
      g.uniform2f(u.uRes, width, height);
      g.uniform1f(u.uTime, seconds);
      g.uniform3fv(u.uC0, look.palette[0]);
      g.uniform3fv(u.uC1, look.palette[1]);
      g.uniform3fv(u.uC2, look.palette[2]);
      g.uniform3fv(u.uC3, look.palette[3]);
      g.uniform1f(u.uScale, look.scale);
      g.uniform1f(u.uWarp, look.warp);
      g.drawArrays(g.TRIANGLES, 0, 3);
      if (first) {
        // The first picture is looked at once (a check that it is not black), kept on the canvas.
        first = false;
        const px = new Uint8Array(4);
        g.readPixels(Math.floor(width / 2), Math.floor(height / 2), 1, 1, g.RGBA, g.UNSIGNED_BYTE, px);
        canvas.dataset.px = `${px[0]},${px[1]},${px[2]}`;
      }
    },
    // Its own objects go; the context itself is left to the page (a canvas that gave its
    // context up could never take another, which a screen shown again would need).
    dispose() {
      const g = gl!;
      if (g.isContextLost()) return;
      g.deleteProgram(program);
      g.deleteShader(vs);
      g.deleteShader(fs);
      g.deleteBuffer(buffer);
    },
  };
}

/**
 * Flowing colour behind a screen, drawn by the graphics chip (see shaderart.ts):
 * small and soft, 30 frames a second at most, still for anyone who asks for less
 * motion, not drawn while the page is hidden, and not at all when the Shader art
 * setting is 0 or there is no WebGL. Put it first in a screen that is a stacking
 * context (an absolutely placed box with a z-index), with -z-10, so it sits under
 * the screen's content and over its own background.
 */
export function ShaderBackdrop({
  look,
  className = "",
  maxOpacity = 0.95,
}: {
  look: ShaderLook;
  className?: string;
  /** The opacity at full Shader art. */
  maxOpacity?: number;
}) {
  const art = useGame((s) => s.settings.shaderArt);
  const renderScale = useGame((s) => s.settings.renderScale);
  const fpsCap = useGame((s) => s.settings.fpsCap);
  const q = qualityOf(art, renderScale, fpsCap);
  const ref = useRef<HTMLCanvasElement>(null);
  const lookRef = useRef(look);
  const qRef = useRef(q);
  lookRef.current = look;
  qRef.current = q;
  const [failed, setFailed] = useState(false);
  // A lost graphics context (the phone took it back) starts the picture again.
  const [nonce, setNonce] = useState(0);
  const on = q.strength > 0 && !failed;
  const kind = look.kind;

  useEffect(() => {
    const cv = ref.current;
    if (!cv || !on) return;
    const run = start(cv, kind);
    if (!run) {
      setFailed(true);
      return;
    }
    const still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const began = performance.now();
    const seconds = (now: number) => (still ? 41 : (now - began) / 1000) * lookRef.current.speed + 7;
    const fit = () => {
      const r = cv.getBoundingClientRect();
      const d = drawSize(r.width, r.height, qRef.current.scale);
      run.resize(d.w, d.h);
    };
    let raf = 0;
    let last = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden || now - last < 1000 / qRef.current.fps) return;
      last = now;
      run.draw(lookRef.current, seconds(now));
      cv.dataset.frames = String(Number(cv.dataset.frames ?? 0) + 1);
    };
    fit();
    const ro = new ResizeObserver(() => {
      fit();
      if (still) run.draw(lookRef.current, seconds(performance.now()));
    });
    ro.observe(cv);
    if (still) run.draw(lookRef.current, seconds(performance.now()));
    else raf = requestAnimationFrame(frame);
    const lost = (e: Event) => {
      e.preventDefault();
      setNonce((n) => n + 1);
    };
    cv.addEventListener("webglcontextlost", lost);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      cv.removeEventListener("webglcontextlost", lost);
      run.dispose();
    };
  }, [on, kind, nonce]);

  if (!on) return null;
  return (
    <canvas
      // A new canvas for a new context: a canvas that gave its context up cannot take another.
      key={`${kind}${nonce}`}
      ref={ref}
      aria-hidden
      data-shader={kind}
      className={`pointer-events-none absolute inset-0 size-full ${className}`}
      style={{ opacity: Math.min(1, q.strength * maxOpacity), mixBlendMode: "screen" }}
    />
  );
}
