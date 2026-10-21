"use client";

import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from "react";
import { cn } from "../../lib/cn";

/** True once the element has scrolled into view. Stays true. */
export function useInView<T extends Element>(margin = "0px 0px -12% 0px") {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setInView(true); observer.disconnect(); }
    }, { rootMargin: margin });
    observer.observe(node);
    return () => observer.disconnect();
  }, [margin]);
  return [ref, inView] as const;
}

/** Scroll progress of an element through the viewport: 0 as its top enters the bottom edge, 1 as it reaches `end` of the viewport height. */
export function useScrollProgress<T extends HTMLElement>(end = 0.35) {
  const ref = useRef<T>(null);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const node = ref.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const height = window.innerHeight;
      const value = (height - rect.top) / (height * (1 - end) + rect.height * 0.5);
      setProgress(Math.min(1, Math.max(0, value)));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); cancelAnimationFrame(frame); };
  }, [end]);
  return [ref, progress] as const;
}

/** Fades, lifts and un-blurs its children into place when scrolled into view. Children with --i stagger. */
export function Reveal({ as: Tag = "div", className, style, children, delay = 0 }: { as?: ElementType; className?: string; style?: CSSProperties; children: ReactNode; delay?: number }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  return (
    <Tag ref={ref} className={cn("reveal", className)} data-in={inView || undefined} style={{ ...style, "--delay": `${delay}ms` } as CSSProperties}>
      {children}
    </Tag>
  );
}
