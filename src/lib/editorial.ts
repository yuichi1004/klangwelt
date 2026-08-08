/**
 * Hand-written programme notes, loaded from `data/editorial/`.
 *
 * Open Opus supplies no prose, so everything here is authored for this site.
 * The structured "work data" panel is generated for all 1,286 core works from
 * the title parser; these notes are the layer on top, added over time. Pages
 * degrade gracefully when an entry is missing.
 *
 * Do not paste text from Wikipedia: it is CC BY-SA, which would impose
 * attribution and share-alike obligations on the whole page. Facts (dates,
 * premieres, dedicatees) are not copyrightable — the wording must be ours.
 */
import composerEntries from "@/data/editorial/composers.json";
import workEntries from "@/data/editorial/works.json";

export interface LocalizedText {
  ja: string;
  en: string;
}

export interface WorkEditorial {
  /** How the piece is put together: movements, form, what to listen for. */
  structure?: LocalizedText;
  /** The story around the work: circumstances, reception, anecdotes. */
  story?: LocalizedText;
}

export interface ComposerEditorial {
  biography?: LocalizedText;
  story?: LocalizedText;
}

const works = workEntries as Record<string, WorkEditorial>;
const composers = composerEntries as Record<string, ComposerEditorial>;

export function getWorkEditorial(workId: string): WorkEditorial | undefined {
  const entry = works[workId];
  return entry?.structure || entry?.story ? entry : undefined;
}

export function getComposerEditorial(
  composerId: string,
): ComposerEditorial | undefined {
  const entry = composers[composerId];
  return entry?.biography || entry?.story ? entry : undefined;
}
