/**
 * Deep links into Spotify and YouTube Music.
 *
 * Both are plain search URLs: no API keys, no server, no per-work curation,
 * and every work therefore gets a working link. On mobile the universal link
 * opens the installed app.
 *
 * Spotify's design guidelines allow third-party sites to link in, provided
 * the call to action uses approved wording ("Listen on Spotify"), the logo is
 * used unmodified at 70px or larger, and the two services are not presented
 * as a single co-branded lockup. The UI follows all three.
 */
import type { Work } from "./catalog-types";

export interface StreamingLinks {
  spotify: string;
  youtubeMusic: string;
  /** The text both services are searched for; shown to the user. */
  query: string;
}

/**
 * Builds the search phrase. `searchTerms` is preferred over the title where
 * Open Opus provides it, because it carries the original-language name of
 * stage works (`El sombrero de tres picos, The three-cornered hat`), which
 * matches recordings far better than the English rendering.
 */
export function buildSearchQuery(work: Work, composerName: string): string {
  const primaryTerm = work.searchTerms
    ? work.searchTerms.split(",")[0].trim()
    : "";
  return [composerName, primaryTerm || work.title]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildStreamingLinks(
  work: Work,
  composerName: string,
): StreamingLinks {
  const query = buildSearchQuery(work, composerName);
  return {
    query,
    spotify: `https://open.spotify.com/search/${encodeURIComponent(query)}`,
    youtubeMusic: `https://music.youtube.com/search?q=${encodeURIComponent(query)}`,
  };
}
