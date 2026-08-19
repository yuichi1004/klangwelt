import Link from "next/link";

import { ComposerThumb } from "@/components/composer-thumb";
import { getMessages, type Locale } from "@/i18n/config";
import { formatLifespan, getComposer } from "@/lib/catalog";
import { getRelatedComposers, relationLabelKey, type RelationLabelKey } from "@/lib/relations";

/**
 * "関連する作曲家" — issue #89. Six relation kinds have to read apart at a
 * glance, but this palette only has three colour families that can carry
 * text (`accent-soft`/`accent`, `terra-surface`/`ink`, `paper`/`ink-soft` —
 * see `globals.css` and `theme.test.ts`), and two of them are already
 * spoken for right above this section: the 代表曲 grid's ★ chip
 * (`star-rating.tsx`) sits on `bg-accent-soft text-accent`, and its genre
 * chip (`work-card.tsx`) sits on `bg-terra-surface text-ink`. Issue #84's
 * complaint was exactly this: a third similar-looking round chip next to
 * those two reads as "another one of those", not as a new signal.
 *
 * So the badge here carries the distinction on the one channel that never
 * runs out: the label word itself, which is also the accessible name
 * (師/弟子/影響を受けた/影響を与えた/友人/対立/親族/共作・共演 — see
 * `messages.composer.relation`). Colour is reduced to grouping by
 * *character* rather than by kind — genealogical (teacher/student,
 * influence) on the accent family, oppositional (rival) on the terra
 * family, everything else neutral — which fits inside the existing palette
 * with no new token and no `theme.test.ts` change. Every badge keeps its
 * own border regardless of family, unlike the ★ and genre chips: the card
 * itself hovers to `bg-accent-soft`, and a border-less accent badge would
 * disappear into that hover fill.
 */
const BADGE: Record<RelationLabelKey, string> = {
  teacher: "border-accent/50 bg-paper text-accent",
  student: "border-accent/50 bg-paper text-accent",
  influencedBy: "border-accent/50 bg-paper text-accent",
  influenced: "border-accent/50 bg-paper text-accent",
  rival: "border-terra/60 bg-terra-surface text-ink",
  friend: "border-line bg-paper text-ink-soft",
  family: "border-line bg-paper text-ink-soft",
  collaborator: "border-line bg-paper text-ink-soft",
};

export function RelatedComposers({ locale, composerId }: { locale: Locale; composerId: string }) {
  const related = getRelatedComposers(composerId);
  if (related.length === 0) return null;

  const messages = getMessages(locale);

  return (
    <section className="mt-12">
      <h2 className="mb-3 font-serif text-lg font-medium text-ink">
        {messages.composer.relationsHeading}
      </h2>
      <ul className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        {related.map((relation) => {
          const other = getComposer(relation.composerId);
          // Every id here was validated against the real composer list at
          // module load (`relations.ts`'s `loadRelations`) — this can only
          // fail if `data/catalog/composers.json` itself changes without a
          // matching update to `data/relations.json`, which `npm run build`
          // would already have failed on. Skip defensively rather than
          // throw from a render path.
          if (!other) return null;

          const labelKey = relationLabelKey(relation.type, relation.direction);
          const otherName = locale === "ja" ? other.nameJa : other.completeName;

          return (
            <li key={relation.composerId}>
              <Link
                href={`/${locale}/composers/${relation.composerId}`}
                className="flex h-full items-start gap-3 rounded-lg border border-line bg-paper-raised p-3 transition-colors hover:border-accent/50 hover:bg-accent-soft"
              >
                <ComposerThumb portrait={other.portrait} composerName={otherName} />
                <div className="min-w-0 flex-1">
                  <span
                    className={`inline-block rounded-full border px-2 py-0.5 text-xs ${BADGE[labelKey]}`}
                  >
                    {messages.composer.relation[labelKey]}
                  </span>
                  <p className="mt-1.5 truncate font-serif text-[1.0625rem] font-medium leading-snug text-ink">
                    {otherName}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-faint">{formatLifespan(messages, other)}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                    {relation.note[locale]}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
