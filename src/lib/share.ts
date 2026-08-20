/**
 * Share-intent URLs for X, LinkedIn and Facebook, plus the plain page URL a
 * "copy link" action writes to the clipboard.
 *
 * All three are unauthenticated query-string endpoints — no API keys, no
 * server. LinkedIn and Facebook read title/description/image straight off
 * the page's own Open Graph tags (`buildOpenGraph` in `og.ts`, issue #103),
 * so neither takes a text parameter here. X does, and gets it — see
 * `buildShareLinks`'s `text` argument.
 *
 * `x.com/intent/post` is the current endpoint; `twitter.com/intent/tweet`
 * still works via redirect, but this is a new integration with no legacy
 * link to preserve, so it targets the endpoint directly.
 */
export interface ShareLinks {
  /** The plain, unencoded page URL — what "copy link" writes to the
   *  clipboard, not shown anywhere else. */
  url: string;
  x: string;
  linkedin: string;
  facebook: string;
}

export function buildShareLinks(args: { url: string; text: string }): ShareLinks {
  // Hand-built with `encodeURIComponent`, not `URLSearchParams` — matches
  // `streaming.ts`'s `buildStreamingLinks`, and matters here for the same
  // reason: `URLSearchParams` encodes a space as `+`, which X's composer
  // renders as a literal plus sign rather than a space.
  const url = encodeURIComponent(args.url);
  const text = encodeURIComponent(args.text);

  return {
    url: args.url,
    x: `https://x.com/intent/post?text=${text}&url=${url}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
  };
}
