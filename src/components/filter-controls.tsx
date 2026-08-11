"use client";

import { getMessages } from "@/i18n/config";

/**
 * The controls the two filter panels are built from — the catalogue's
 * (`CatalogBrowser`) and the composer list's (`ComposerBrowser`).
 *
 * They live here rather than in either browser so the two panels cannot drift
 * apart: same chip shape, same active colours, same group heading. That
 * sameness is the point — the composer filters are meant to feel like the
 * work filters.
 */

/** Toggles one value in a multi-select filter array (epochs, genres, …). */
export function toggleIn<T>(list: T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}

/**
 * "★4以上" reads to a screen reader as "black star 4 以上", so the visible
 * chip label and its accessible name diverge on purpose — pass `aria: true`
 * for the "星4つ以上" form.
 *
 * Two values mean "no threshold", because the two lists count from different
 * floors: a work filter is off at `0`, while every composer carries at least
 * ★1, so the composer filter is off at `1`.
 */
export function starChipLabel(
  filterMessages: ReturnType<typeof getMessages>["filters"],
  value: 0 | 1 | 3 | 4 | 5,
  aria: boolean,
): string {
  if (value === 0 || value === 1) return filterMessages.all;
  if (value === 5) return filterMessages[aria ? "starsOnlyAria" : "starsOnly"];
  return filterMessages[aria ? "starsMinAria" : "starsMin"].replace(
    "{n}",
    String(value),
  );
}

/**
 * A labelled block of filter controls. The heading is tied to the group with
 * `aria-labelledby` so screen readers announce, say, "Period, group" before
 * the chips inside — the chips alone give no clue what they filter.
 */
export function FilterGroup({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  const headingId = `filter-${id}-label`;
  return (
    <div role="group" aria-labelledby={headingId}>
      <h3
        id={headingId}
        className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint"
      >
        {label}
      </h3>
      {children}
    </div>
  );
}

export function Chip({
  active,
  onClick,
  title,
  ariaLabel,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  /** Overrides the accessible name when the visible label is a glyph like ★4. */
  ariaLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
      title={title}
      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
        active
          ? "border-accent bg-accent-soft text-accent"
          : "border-line text-ink-soft hover:border-accent/40"
      }`}
    >
      {children}
    </button>
  );
}

/** A chip for the active-filters row: its own label plus a `×` to remove it. */
export function RemovableChip({
  onRemove,
  ariaLabel,
  children,
}: {
  onRemove: () => void;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={ariaLabel}
      className="flex max-w-full items-center gap-1.5 rounded-full border border-accent bg-accent-soft px-3 py-1.5 text-sm text-accent"
    >
      <span className="min-w-0 truncate break-words">{children}</span>
      <span aria-hidden="true">×</span>
    </button>
  );
}
