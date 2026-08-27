"use client";

import { useEffect } from "react";

/**
 * Registers `public/sw.js` — see that file for what it actually does (very
 * little: it exists so Chrome's installability check finds a fetch handler).
 *
 * Production only: `next dev` rebuilds constantly, and a service worker left
 * registered from a previous dev session would keep intercepting navigations
 * with stale logic. Verifying the worker therefore needs a production build
 * served statically (`npm run build && npx serve out`), not `next dev` — see
 * the plan's verification steps.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Registration failing (unsupported browser, blocked storage, ...)
        // should never affect the rest of the site — it only means this
        // visit does not count toward Chrome's install criteria.
      });
    };

    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
