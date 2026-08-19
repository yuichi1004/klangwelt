"use client";

import { useEffect, type RefObject } from "react";

/**
 * Escape-to-dismiss, for anything dismissible — the catalogue's inline
 * filter disclosure (`catalog-browser.tsx`), and, via `useModalOverlay`
 * below, the composer filter sheet and the header menu.
 *
 * The `isComposing` guard is why this is a hook and not an inline listener.
 * On a Japanese-first site Escape is also how an IME abandons a half-typed
 * word, and the search fields inside these panels are the most likely place
 * to press it (see the composition handling in `catalog-browser.tsx` and
 * `composer-browser.tsx`). Closing the panel out from under a cancelled
 * composition would lose the panel *and* the text.
 *
 * `onEscape` is in the dependency list, so pass a `useCallback`-stable
 * function unless you want the listener re-subscribed every render.
 */
export function useEscapeKey(active: boolean, onEscape: () => void): void {
  useEffect(() => {
    if (!active) return;
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.isComposing) onEscape();
    };
    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  }, [active, onEscape]);
}

/** Everything we would ever put in an overlay. `[tabindex="-1"]` is excluded
 *  on purpose: that is how the dialog element itself accepts initial focus
 *  without becoming a Tab stop of its own. */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * `getClientRects()` rather than a visibility flag: both consumers keep the
 * other breakpoint's markup in the DOM behind `hidden sm:flex` / `lg:hidden`
 * (the site's standing alternative to a JS media query — see the reasoning
 * in `glossary-term.tsx`), and a `display: none` link must not be a tab
 * stop.
 */
function focusableWithin(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    (element) => element.getClientRects().length > 0,
  );
}

/**
 * Turns an open overlay into a modal one: Escape closes it, the page behind
 * it stops scrolling, Tab cycles inside `containerRef` instead of walking
 * off into the cards behind the scrim, and focus goes back where it came
 * from on close (#109).
 *
 * `containerRef` is the element that owns the trap — the sheet's
 * `role="dialog"` box in `composer-browser.tsx`, the whole `<header>` in
 * `site-header.tsx` (everything the scrim leaves interactive lives inside
 * it, so that is exactly the set the user can still see).
 *
 * The container must carry `tabIndex={-1}` if focus is expected to move
 * into it — see the initial-focus effect below.
 *
 * Deliberately *not* handled here: `inert` on the rest of the page, and
 * outside-pointerdown. The scrim is already a labelled close button in both
 * consumers, and `aria-modal="true"` on the dialog is what the platform
 * offers short of a `<dialog>` element (which a shared, sticky-header-aware
 * hook can't adopt without duplicating this logic anyway).
 */
export function useModalOverlay(
  open: boolean,
  onClose: () => void,
  containerRef: RefObject<HTMLElement | null>,
): void {
  useEscapeKey(open, onClose);

  /*
   * Background scroll lock, moved here from site-header.tsx (#108).
   *
   * `overflow: hidden` on <body> rather than the `position: fixed;
   * top: -scrollY` technique: that one restores the scroll position by
   * re-scrolling on close, which fights the sticky header and flashes the
   * page. What `overflow: hidden` does *not* stop on iOS Safari is
   * chaining — a flick that runs past the end of the sheet's own scroll
   * region keeps going into the page behind it. That half is CSS, on the
   * scrolling region itself (`overscroll-contain`), not something this hook
   * can do for you.
   */
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // Initial focus in, and focus back out again on close.
  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    /*
     * The header menu opens with focus already on its own ☰ button, which is
     * inside the container — moving focus there would be a step backwards.
     * The filter sheet opens from a button outside itself, so focus has to
     * be pulled in; the dialog box takes it (rather than 閉じる or the first
     * field) so a screen reader announces the dialog's name first.
     * `preventScroll` keeps the browser from scrolling the now-locked page.
     */
    if (container && !container.contains(previouslyFocused)) {
      container.focus({ preventScroll: true });
    }
    return () => {
      // `isConnected`: the trigger can be gone by the time we close —
      // tapping a link in the header menu replaces the page under it.
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [open, containerRef]);

  // The trap itself.
  useEffect(() => {
    if (!open) return;
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const container = containerRef.current;
      /*
       * Nothing to trap in: the overlay is CSS-hidden at the current
       * breakpoint (both consumers are `sm:hidden`/`lg:hidden`), which is
       * reachable by rotating a phone or resizing with the sheet open.
       * Swallowing Tab there would strand the keyboard with nowhere to go.
       */
      if (!container || container.getClientRects().length === 0) return;
      const items = focusableWithin(container);
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const outside = !container.contains(active);

      if (event.shiftKey) {
        // The container itself counts as "at the start": Shift+Tab from it
        // would otherwise walk backwards out into the page behind the scrim.
        if (active === first || active === container || outside) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || outside) {
        event.preventDefault();
        first.focus();
      }
    };
    // On `document`, not the container: focus can be outside it (body,
    // after a tap on iOS Safari, which does not focus buttons) and we still
    // have to catch that Tab and pull it back in.
    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  }, [open, containerRef]);
}
