"use client";

import { useEffect, useRef, useState } from "react";

import { getMessages, type Locale } from "@/i18n/config";
import type { ShareLinks } from "@/lib/share";

/**
 * A single "共有" trigger plus its popup — issue #133. Modelled directly on
 * `glossary-term.tsx`'s popup: a card anchored under the trigger on desktop
 * (`lg` and up), a bottom sheet below it, both always in the DOM when open
 * and switched with the `lg:` breakpoint rather than a JS media query (same
 * reasoning as `glossary-term.tsx` — no client-only viewport check, cannot
 * mismatch between server and client render). Closes on Escape or any
 * pointerdown outside the trigger's own container, also lifted verbatim from
 * `glossary-term.tsx`.
 *
 * Deliberately one generic "share" icon on the trigger, not three
 * platform-specific ones. `streaming-links.tsx` avoids Spotify's and
 * YouTube's actual logos by tinting a generic glyph with the brand colour —
 * that recipe doesn't transfer here: X, LinkedIn and Facebook share no
 * common concept the way "play" covers both streaming services, so three
 * identical glyphs differing only by colour would make colour the *sole*
 * differentiator, which is exactly what that file's own reasoning warns
 * against. The simplest way to carry no logo at all is to carry no
 * per-platform icon at all: one neutral "share" glyph opens a menu whose
 * four rows are plain text labels (`messages.share.copyLink`/`x`/`linkedin`/
 * `facebook`) — nothing in this file draws or tints anything brand-specific.
 */
export function ShareMenu({
  locale,
  links,
  className,
}: {
  locale: Locale;
  links: ShareLinks;
  className?: string;
}) {
  const messages = getMessages(locale);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeIfOutside = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeIfOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeIfOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  async function handleCopy() {
    // Lifted from `backup-panel.tsx`, the repo's only other
    // `navigator.clipboard` use: flash the confirmation for 2s, swallow a
    // denied/unavailable clipboard silently. That file's non-JS fallback (a
    // visible, selectable textarea) has no equivalent here — this button IS
    // the only way to get the link, so a failure here is simply a no-op,
    // same as it would be for a visitor with JavaScript disabled entirely.
    try {
      await navigator.clipboard.writeText(links.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignored — see comment above.
    }
  }

  return (
    <span ref={containerRef} className={`relative inline-block ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={messages.share.heading}
        title={messages.share.heading}
        // Shape lifted from `favorite-button.tsx`: the outer box is the
        // 44px touch target (issue #113), the inner span is the visible
        // disc — kept separate because Playwright's `boundingBox()` ignores
        // pseudo-element overflow, so the hit area has to be real geometry.
        className="group grid h-11 w-11 shrink-0 place-items-center rounded-full"
      >
        <span className="rounded-full p-1.5 text-ink-faint transition-colors group-hover:bg-accent-soft group-hover:text-accent">
          <ShareIcon className="h-4 w-4" />
        </span>
      </button>

      {open && (
        <>
          {/* Desktop: a card anchored to the trigger. */}
          <span
            role="dialog"
            aria-label={messages.share.heading}
            className="absolute left-0 top-full z-30 mt-2 hidden w-52 rounded-lg border border-line bg-paper p-2 shadow-lg lg:block"
          >
            <ShareMenuItems
              locale={locale}
              links={links}
              copied={copied}
              onCopy={handleCopy}
              onNavigate={() => setOpen(false)}
            />
          </span>

          {/* Mobile: bottom sheet, same shape as `glossary-term.tsx`'s. */}
          <span className="lg:hidden">
            <span
              aria-hidden="true"
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 block bg-black/40"
            />
            <span
              role="dialog"
              aria-label={messages.share.heading}
              className="fixed inset-x-0 bottom-0 z-40 block rounded-t-2xl border-t border-line bg-paper p-5"
            >
              <span className="mb-3 flex items-center">
                <span className="mr-auto font-serif text-base font-medium text-ink">
                  {messages.share.heading}
                </span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md border border-line px-3 py-1.5 text-sm text-ink-soft"
                >
                  {messages.nav.close}
                </button>
              </span>
              <ShareMenuItems
                locale={locale}
                links={links}
                copied={copied}
                onCopy={handleCopy}
                onNavigate={() => setOpen(false)}
              />
            </span>
          </span>
        </>
      )}
    </span>
  );
}

/** The four rows, shared between the desktop card and the mobile sheet. Text
 *  labels only — no per-platform icon, see this file's top comment. */
function ShareMenuItems({
  locale,
  links,
  copied,
  onCopy,
  onNavigate,
}: {
  locale: Locale;
  links: ShareLinks;
  copied: boolean;
  onCopy: () => void;
  onNavigate: () => void;
}) {
  const messages = getMessages(locale);
  const itemClass =
    "flex w-full items-center rounded-md px-3 py-2.5 text-sm text-ink-soft transition-colors hover:bg-accent-soft hover:text-accent";

  return (
    <span className="block">
      <button type="button" onClick={onCopy} className={`${itemClass} text-left`}>
        {copied ? messages.share.copied : messages.share.copyLink}
      </button>
      <a
        href={links.x}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onNavigate}
        className={itemClass}
      >
        {messages.share.x}
      </a>
      <a
        href={links.linkedin}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onNavigate}
        className={itemClass}
      >
        {messages.share.linkedin}
      </a>
      <a
        href={links.facebook}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onNavigate}
        className={itemClass}
      >
        {messages.share.facebook}
      </a>
    </span>
  );
}

/**
 * A generic "share" glyph — three nodes joined by two lines, the same shape
 * this concept takes across most platforms' own share icons. It names no
 * particular service, so none of `streaming-links.tsx`'s logo-avoidance
 * reasoning even applies to it. Same stroke vocabulary as `PlayIcon`
 * (`streaming-links.tsx`) and `HeartIcon` (`favorite-button.tsx`).
 */
function ShareIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="18" cy="5" r="2.5" fill="currentColor" />
      <circle cx="6" cy="12" r="2.5" fill="currentColor" />
      <circle cx="18" cy="19" r="2.5" fill="currentColor" />
      <path
        d="M8.3 10.7l7.4-4.4M8.3 13.3l7.4 4.4"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </svg>
  );
}
