import { getMessages, type Locale } from "@/i18n/config";
import type { StreamingLinks } from "@/lib/streaming";

/**
 * Independent buttons, one per service — deliberately not a single combined
 * lockup, so the two links never read as an official co-branded partnership.
 * The Spotify wording follows their approved call-to-action list.
 *
 * Neither button carries Spotify's or YouTube's actual logo. A generic play
 * glyph stands in instead, tinted with the service's brand colour on the
 * border and the icon. This isn't a compliance workaround for one rule —
 * it sidesteps the entire surface of logo-usage guidelines (minimum size,
 * clear space, which backgrounds a given colour variant may sit on, "do not
 * recreate the mark") because there is no mark being reproduced, and it
 * lowers the risk of a visitor reading either link as an official
 * partnership rather than a "search this elsewhere" shortcut. Color alone
 * is not how the two are told apart: each button also carries its own text
 * label, so a colour-blind reader loses nothing.
 *
 * `bg-paper-raised` and `text-ink` match every other card on this page
 * (`WorkDataPanel`, `MediaSection`, `WorkCard`), so the buttons read as
 * belonging to the site rather than floating above it — same move as
 * `MediaKindChip`'s `border-terra/60 bg-terra-surface text-ink`.
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
          className="flex flex-1 items-center justify-center gap-2.5 rounded-full border border-[#1DB954]/70 bg-paper-raised px-6 py-3.5 text-sm font-medium text-ink transition-colors hover:border-[#1DB954] hover:bg-[#1DB954]/10"
        >
          <PlayIcon className="shrink-0 text-[#1DB954]" />
          {messages.work.spotify}
        </a>

        <a
          href={links.youtubeMusic}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 items-center justify-center gap-2.5 rounded-full border border-[#FF0033]/70 bg-paper-raised px-6 py-3.5 text-sm font-medium text-ink transition-colors hover:border-[#FF0033] hover:bg-[#FF0033]/10"
        >
          <PlayIcon className="shrink-0 text-[#FF0033]" />
          {messages.work.youtubeMusic}
        </a>
      </div>

      <p className="text-xs leading-relaxed text-ink-faint">
        {messages.work.listenNote}
      </p>
    </div>
  );
}

/**
 * A generic play-button glyph, not either service's logo — see this file's
 * top comment for why. Same outline weight as `SearchIcon`
 * (`catalog-browser.tsx`) for a consistent icon vocabulary across the site;
 * the triangle is solid so the glyph still reads at 22px.
 */
function PlayIcon({ className }: { className?: string }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M10 8.3v7.4l6.5-3.7-6.5-3.7z" fill="currentColor" stroke="none" />
    </svg>
  );
}
