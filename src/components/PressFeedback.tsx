"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

/**
 * Instant feedback for every tap, with no per-button code:
 * - A button that starts a server request (fetch) within a moment of being clicked
 *   shows a spinner and can't be pressed again until every request it started has answered.
 * - Clicking a link to another page shows a thin bar at the top until the new page arrives.
 */
function Feedback() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [navigating, setNavigating] = useState(false);

  // New page arrived: hide the bar.
  useEffect(() => { setNavigating(false); }, [pathname, search]);

  useEffect(() => {
    let lastBtn: HTMLElement | null = null;
    let lastAt = 0;

    const onClick = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      const btn = el?.closest<HTMLElement>("button, a.btn, [role='menuitemradio']");
      if (btn && !(btn as HTMLButtonElement).disabled) { lastBtn = btn; lastAt = Date.now(); }
      const a = el?.closest<HTMLAnchorElement>("a[href]");
      if (a && !e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !a.target && !a.hasAttribute("download")) {
        const url = new URL(a.href, location.href);
        if (url.origin === location.origin && (url.pathname !== location.pathname || url.search !== location.search)) setNavigating(true);
      }
    };
    document.addEventListener("click", onClick, true);

    const original = window.fetch;
    window.fetch = (...args: Parameters<typeof fetch>) => {
      // Buttons that draw their own loading state (aria-busy) are left alone.
      const btn = lastBtn && Date.now() - lastAt < 400 && document.contains(lastBtn) && !lastBtn.hasAttribute("aria-busy") ? lastBtn : null;
      if (btn) btn.setAttribute("data-busy", String(Number(btn.getAttribute("data-busy") || 0) + 1));
      const done = () => {
        if (!btn) return;
        const n = Number(btn.getAttribute("data-busy") || 1) - 1;
        if (n <= 0) btn.removeAttribute("data-busy"); else btn.setAttribute("data-busy", String(n));
      };
      return original(...args).then((r) => { done(); return r; }, (err) => { done(); throw err; });
    };
    return () => { document.removeEventListener("click", onClick, true); window.fetch = original; };
  }, []);

  return navigating ? <div className="navbar" role="progressbar" aria-label="Loading the page" /> : null;
}

export function PressFeedback() {
  return <Suspense fallback={null}><Feedback /></Suspense>;
}
