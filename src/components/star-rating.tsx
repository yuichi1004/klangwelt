import { getMessages, type Locale } from "@/i18n/config";
import type { Stars } from "@/lib/popularity";

export interface StarRatingProps {
  locale: Locale;
  stars: Stars;
  /**
   * `compact` renders a `★4`-style chip, for use on `WorkCard`, where a
   * five-glyph meter would be too wide next to the card's other controls.
   * `full` renders the five-glyph meter and is for places with more room:
   * the work detail page and composer pages.
   */
  variant?: "compact" | "full";
}

/**
 * A screen reader should announce this once — "定番度 5段階中4" — not read
 * four star characters aloud. The glyphs are decorative and hidden from the
 * accessibility tree; `aria-label` on the wrapping element carries the value.
 */
export function StarRating({ locale, stars, variant = "compact" }: StarRatingProps) {
  const messages = getMessages(locale);
  const label = messages.rating.aria.replace("{n}", String(stars));

  if (variant === "compact") {
    return (
      <span
        role="img"
        aria-label={label}
        title={`${messages.rating.label}: ${messages.rating[`tier${stars}` as const]}`}
        className={`rounded-full px-2 py-0.5 ${
          stars >= 4
            ? "bg-accent-soft text-accent"
            : "border border-line text-ink-faint"
        }`}
      >
        <span aria-hidden="true">★{stars}</span>
      </span>
    );
  }

  return (
    <span
      role="img"
      aria-label={label}
      title={messages.rating[`tier${stars}` as const]}
      className="tracking-[0.1em]"
    >
      <span aria-hidden="true" className="text-accent">
        {"★".repeat(stars)}
      </span>
      <span aria-hidden="true" className="text-ink-faint">
        {"☆".repeat(5 - stars)}
      </span>
    </span>
  );
}
