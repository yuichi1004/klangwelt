import { Fragment } from "react";

import { GlossaryTerm } from "@/components/glossary-term";
import type { Locale } from "@/i18n/config";
import type { GlossaryEntry, GlossarySegment } from "@/lib/glossary";

/**
 * Renders one prose block's already-annotated segments (see
 * `createAnnotator` in `src/lib/glossary.ts`) — plain text stays plain text,
 * and a segment with a `termId` becomes a `GlossaryTerm` trigger.
 *
 * Plain segments render through a keyed `Fragment` rather than a `<span>` so
 * splitting the string into pieces adds no extra DOM nodes: the surrounding
 * `whitespace-pre-line` paragraph sees one continuous run of text either
 * way, and any line breaks in it render exactly as before.
 */
export function GlossaryText({
  locale,
  segments,
  glossary,
}: {
  locale: Locale;
  segments: GlossarySegment[];
  glossary: Map<string, GlossaryEntry>;
}) {
  return segments.map((segment, index) => {
    const entry = segment.termId ? glossary.get(segment.termId) : undefined;
    return entry ? (
      <GlossaryTerm key={index} locale={locale} text={segment.text} entry={entry} />
    ) : (
      <Fragment key={index}>{segment.text}</Fragment>
    );
  });
}
