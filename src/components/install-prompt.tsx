"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { useEscapeKey } from "@/components/use-modal-overlay";
import { getMessages, type Locale } from "@/i18n/config";
import {
  INSTALL_PROMPT_DELAY_MS,
  isIosSafari,
  isStandalone,
  readInstallPromptState,
  shouldShowInstallPrompt,
  writeInstallPromptState,
} from "@/lib/install-prompt";

/** Not in the DOM lib yet — Chromium-only, and the shape this site actually
 *  uses (`prompt()` and `preventDefault()`) has been stable for years. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * A non-modal "install this as an app" sheet for first-time mobile visitors
 * — issue: the site had no install path worth advertising until the
 * manifest/service worker landed alongside this. Mounted once in
 * `[locale]/layout.tsx`, so the show-after-delay timer below only ever runs
 * once per browser tab even as the visitor navigates between pages.
 *
 * Two branches, matching the two platforms that can actually install a site
 * as an app from the browser itself:
 * - Android/Chrome fires `beforeinstallprompt`; this component holds onto
 *   that event and replays it from its own CTA.
 * - iOS Safari never fires it — installing is a manual share-sheet flow —
 *   so its CTA instead points at the step-by-step guide (`/install`).
 * Anything else (desktop, non-Safari iOS browsers, already-installed) shows
 * nothing.
 */
export function InstallPrompt({ locale }: { locale: Locale }) {
  const messages = getMessages(locale);
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState<"android" | "ios" | null>(null);
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);

  const dismiss = useCallback(() => {
    writeInstallPromptState({
      version: 1,
      dismissedAt: Date.now(),
      installed: false,
    });
    setVisible(false);
  }, []);

  useEscapeKey(visible, dismiss);

  useEffect(() => {
    const state = readInstallPromptState();
    if (!shouldShowInstallPrompt(state) || isStandalone()) return;

    // CSS (`sm:hidden` on the sheet below) keeps this off a resized desktop
    // window; this check keeps it from ever appearing on one in the first
    // place — see the equivalent reasoning on the sheets in `share-menu.tsx`.
    if (!window.matchMedia("(pointer: coarse)").matches) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const showAfterDelay = (detected: "android" | "ios") => {
      timer = setTimeout(() => {
        // A tab backgrounded during the delay (e.g. the visitor switched
        // apps) should not have the sheet pop up when they return to a
        // different one.
        if (document.visibilityState !== "visible") return;
        setPlatform(detected);
        setVisible(true);
      }, INSTALL_PROMPT_DELAY_MS);
    };

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      deferredPromptRef.current = event as BeforeInstallPromptEvent;
      showAfterDelay("android");
    };
    const handleAppInstalled = () => {
      writeInstallPromptState({
        version: 1,
        dismissedAt: null,
        installed: true,
      });
      setVisible(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    if (isIosSafari(window.navigator.userAgent)) {
      showAfterDelay("ios");
    }

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
      if (timer) clearTimeout(timer);
    };
  }, []);

  async function handleInstall() {
    const deferred = deferredPromptRef.current;
    if (!deferred) return;
    // `prompt()` can only be called once per captured event.
    deferred.prompt();
    try {
      await deferred.userChoice;
    } catch {
      // Ignored — either outcome below is the same: the native prompt has
      // now been shown, so this sheet's own job is done.
    }
    deferredPromptRef.current = null;
    dismiss();
  }

  if (!visible || !platform) return null;

  return (
    <div
      role="region"
      aria-label={messages.installPrompt.heading}
      className="fixed inset-x-0 bottom-0 z-[35] block rounded-t-2xl border-t border-line bg-paper p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:hidden"
    >
      <div className="flex items-start gap-3">
        <Image
          src="/logo-mark.png"
          alt=""
          width={40}
          height={40}
          className="h-10 w-10 shrink-0 rounded-md"
        />
        <div className="min-w-0 flex-1">
          <p className="font-serif text-base font-medium text-ink">
            {messages.installPrompt.heading}
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            {platform === "android"
              ? messages.installPrompt.androidBody
              : messages.installPrompt.iosBody}
          </p>
        </div>
        {/* Shape lifted from `share-menu.tsx`'s trigger: the outer box is
            the 44px touch target, the inner span the visible glyph —
            Playwright's `boundingBox()` ignores pseudo-element overflow, so
            the hit area has to be real geometry. */}
        <button
          type="button"
          onClick={dismiss}
          aria-label={messages.installPrompt.later}
          title={messages.installPrompt.later}
          className="group -m-2.5 grid h-11 w-11 shrink-0 place-items-center rounded-full"
        >
          <span className="rounded-full p-1.5 text-ink-faint transition-colors group-hover:bg-accent-soft group-hover:text-accent">
            <CloseIcon className="h-4 w-4" />
          </span>
        </button>
      </div>

      <div className="mt-4">
        {platform === "android" ? (
          <button
            type="button"
            onClick={handleInstall}
            className="w-full rounded-full bg-accent-fill px-4 py-2 text-sm font-semibold text-accent-ink"
          >
            {messages.installPrompt.install}
          </button>
        ) : (
          <Link
            href={`/${locale}/install`}
            onClick={dismiss}
            className="block w-full rounded-full bg-accent-fill px-4 py-2 text-center text-sm font-semibold text-accent-ink"
          >
            {messages.installPrompt.guide}
          </Link>
        )}
      </div>
    </div>
  );
}

/** Same stroke vocabulary as the header's own ✕ toggle and the icons in
 *  `share-menu.tsx`/`favorite-button.tsx`. */
function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
