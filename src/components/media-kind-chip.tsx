import type { Locale } from "@/i18n/config";
import { MEDIA_KIND_LABELS, type MediaKind } from "@/lib/media";

/**
 * The kind pill, shared by the `/media` cards and the production detail
 * page so the two cannot drift.
 *
 * Grounds rather than text colours: the palette's only legible foregrounds
 * are ink/ink-soft/ink-faint/accent (terracotta is decorative-only — see
 * `globals.css`), and every pairing here is already guarded by
 * `theme.test.ts`. Film is the quietest of the three on purpose: 156 of the
 * 183 productions are films, so a loud film chip would just be noise, while
 * the 14 anime and 13 TV entries are what a colour is worth reading for
 * (issue #115). Each chip keeps its own border so it stays delineated on a
 * hovered card, whose ground is also `accent-soft`.
 */
const CHIP: Record<MediaKind, string> = {
  film: "border-line bg-paper text-ink-soft",
  anime: "border-accent/40 bg-accent-soft text-accent",
  tv: "border-terra/60 bg-terra-surface text-ink",
};

export function MediaKindChip({
  locale,
  kind,
}: {
  locale: Locale;
  kind: MediaKind;
}) {
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${CHIP[kind]}`}
    >
      {MEDIA_KIND_LABELS[kind][locale]}
    </span>
  );
}
