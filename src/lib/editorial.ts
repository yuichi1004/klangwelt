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
 *
 * Composer entries are authored one-per-file under `data/editorial/composers/`
 * (see `CONTRIBUTING.md`) and assembled into the single `composers.json` this
 * module imports by `npm run build:editorial` — the same split-source /
 * built-artifact shape as `data/catalog/`. Runtime code always reads the
 * built file; never add a composer directly to `composers.json` by hand.
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
  /** What the music itself sounds like: idiom, technique, recurring traits. */
  style?: LocalizedText;
  /** What changed in music history because of this composer. */
  impact?: LocalizedText;
  /** The story around the composer: anecdotes, reception, circumstances. */
  story?: LocalizedText;
  /** 3-5 short tags summarising the style, e.g. "対位法" / "Counterpoint". */
  keywords?: { ja: string[]; en: string[] };
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
  return entry?.biography || entry?.style || entry?.impact || entry?.story
    ? entry
    : undefined;
}
