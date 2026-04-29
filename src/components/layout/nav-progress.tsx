"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import NProgress from "nprogress";

NProgress.configure({ showSpinner: false, trickleSpeed: 120, minimum: 0.15 });

export function NavProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    NProgress.done();
  }, [pathname, searchParams]);

  useEffect(() => {
    // Patch link clicks: start the bar immediately on click, before the navigation kicks off
    function onClick(e: MouseEvent) {
      const target = (e.target as HTMLElement).closest("a") as HTMLAnchorElement | null;
      if (!target) return;
      if (target.target === "_blank" || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      try {
        const url = new URL(target.href);
        if (url.origin !== window.location.origin) return;
        if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      } catch {
        return;
      }
      NProgress.start();
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return (
    <style>{`
      #nprogress { pointer-events: none; }
      #nprogress .bar {
        background: hsl(var(--primary));
        position: fixed;
        z-index: 1031;
        top: 0; left: 0;
        width: 100%; height: 3px;
      }
      #nprogress .peg {
        display: block; position: absolute; right: 0;
        width: 100px; height: 100%;
        box-shadow: 0 0 10px hsl(var(--primary)), 0 0 5px hsl(var(--primary));
        opacity: 1;
        transform: rotate(3deg) translate(0px, -4px);
      }
    `}</style>
  );
}
