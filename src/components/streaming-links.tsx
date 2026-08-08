import { getMessages, type Locale } from "@/i18n/config";
import type { StreamingLinks } from "@/lib/streaming";

/**
 * Independent buttons, one per service — deliberately not a single combined
 * lockup, which Spotify's brand guidelines ask third parties to avoid. The
 * Spotify wording follows their approved call-to-action list.
 */
export function StreamingButtons({
  locale,
  links,
}: {
  locale: Locale;
  links: StreamingLinks;
}) {
  const messages = getMessages(locale);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <a
          href={links.spotify}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 items-center justify-center gap-2.5 rounded-full bg-[#1DB954] px-6 py-3.5 text-sm font-semibold text-black transition-opacity hover:opacity-90"
        >
          <SpotifyMark />
          {messages.work.spotify}
        </a>

        <a
          href={links.youtubeMusic}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 items-center justify-center gap-2.5 rounded-full bg-[#FF0033] px-6 py-3.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          <YouTubeMusicMark />
          {messages.work.youtubeMusic}
        </a>
      </div>

      <p className="text-xs leading-relaxed text-ink-faint">
        {messages.work.listenNote}
      </p>
    </div>
  );
}

/** Unmodified Spotify icon mark, rendered at 24px inside a 70px+ button. */
function SpotifyMark() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.52 17.34c-.24.36-.66.48-1.02.24-2.82-1.74-6.36-2.1-10.56-1.14-.42.12-.78-.18-.9-.54-.12-.42.18-.78.54-.9 4.56-1.02 8.52-.6 11.64 1.32.42.18.48.66.3 1.02zm1.44-3.3c-.3.42-.84.6-1.26.3-3.24-1.98-8.16-2.58-11.94-1.38-.48.12-1.02-.12-1.14-.6-.12-.48.12-1.02.6-1.14 4.38-1.32 9.78-.66 13.5 1.62.36.18.54.78.24 1.2zm.12-3.36C15.24 8.34 8.82 8.1 5.1 9.24c-.6.18-1.2-.18-1.38-.72-.18-.6.18-1.2.72-1.38 4.32-1.32 11.34-1.02 15.78 1.62.54.3.72 1.02.42 1.56-.3.42-1.02.6-1.56.36z" />
    </svg>
  );
}

function YouTubeMusicMark() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 0C5.376 0 0 5.376 0 12s5.376 12 12 12 12-5.376 12-12S18.624 0 12 0zm0 19.104c-3.924 0-7.104-3.18-7.104-7.104S8.076 4.896 12 4.896s7.104 3.18 7.104 7.104-3.18 7.104-7.104 7.104zM9.6 8.4l6 3.6-6 3.6V8.4z" />
    </svg>
  );
}
