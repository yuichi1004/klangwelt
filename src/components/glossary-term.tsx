"use client";

import { useEffect, useId, useRef, useState } from "react";

import { getMessages, type Locale } from "@/i18n/config";
import type { GlossaryEntry } from "@/lib/glossary";

/**
 * A single 専門用語 Tips trigger: the underlined word in running prose plus
 * its popup. Desktop (`lg` and up) gets a small card positioned under the
 * word; narrower viewports get a bottom sheet, matching the look and the
 * close affordances of the catalogue/composer filter panels' mobile sheet
 * (`catalog-browser.tsx` / `composer-browser.tsx`) so the site's "sheet"
 * pattern stays singular. Both variants are always in the DOM when open and
 * switched with the `lg:` breakpoint, the same technique those filter
 * panels use, rather than a JS media query — it needs no client-only
 * viewport check and cannot mismatch between server and client render.
 *
 * `<span>`, never `<div>`, for every wrapper here: the trigger sits inside
 * running prose (`whitespace-pre-line` paragraphs in `editorial.ts`
 * content), which is a `<p>` — block children there would be invalid HTML.
 * `position: fixed`/`absolute` elements are out of normal flow regardless of
 * the tag that generates them, so `<span>` costs nothing visually.
 *
 * Opens and closes independently per trigger — clicking a second term closes
 * whichever one is open first (its own outside-pointerdown listener sees the
 * click land outside its container) and then opens the new one, so at most
 * one is ever visible without a shared "which one is open" store.
 */
export function GlossaryTerm({
  locale,
  text,
  entry,
}: {
  locale: Locale;
  text: string;
  entry: GlossaryEntry;
}) {
  const messages = getMessages(locale);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const dialogId = useId();

  useEffect(() => {
    if (!open) return;
    // Closes on any interaction outside this trigger's own span — including
    // another term's trigger, which is what keeps only one popup open at a
    // time without a shared provider.
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

  return (
    <span ref={containerRef} className="relative inline">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`underline decoration-dotted underline-offset-2 ${
          open ? "text-accent decoration-accent" : "decoration-accent/60 hover:decoration-accent"
        }`}
      >
        {text}
      </button>

      {open && (
        <>
          {/* Desktop: a card anchored to the trigger. */}
          <span
            id={dialogId}
            role="dialog"
            aria-label={entry.term[locale]}
            className="absolute left-0 top-full z-30 mt-2 hidden w-72 rounded-lg border border-line bg-paper p-4 text-sm leading-relaxed text-ink-soft shadow-lg lg:block"
          >
            <GlossaryCardBody locale={locale} entry={entry} />
          </span>

          {/* Mobile: bottom sheet, same shape as the filter panels'. */}
          <span className="lg:hidden">
            <span
              aria-hidden="true"
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 block bg-black/40"
            />
            <span
              role="dialog"
              aria-label={entry.term[locale]}
              className="fixed inset-x-0 bottom-0 z-40 block max-h-[70vh] overflow-y-auto rounded-t-2xl border-t border-line bg-paper p-5"
            >
              <span className="mb-3 flex items-center">
                <span className="mr-auto font-serif text-base font-medium text-ink">
                  {entry.term[locale]}
                </span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md border border-line px-3 py-1.5 text-sm text-ink-soft"
                >
                  {messages.nav.close}
                </button>
              </span>
              <span className="block text-sm leading-relaxed text-ink-soft">
                {entry.short[locale]}
              </span>
            </span>
          </span>
        </>
      )}
    </span>
  );
}

function GlossaryCardBody({ locale, entry }: { locale: Locale; entry: GlossaryEntry }) {
  return (
    <>
      <span className="mb-1.5 block font-serif text-base font-medium text-ink">
        {entry.term[locale]}
      </span>
      <span className="block">{entry.short[locale]}</span>
    </>
  );
}
