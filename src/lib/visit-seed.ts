/**
 * The seed the おすすめ順 ordering is drawn against, fixed for one page load.
 *
 * Module scope, not component state: set once by the first mount during this
 * load and reused by every later navigation within the SPA, so the taste
 * ordering stays put while browsing — following a work link and coming back
 * remounts `CatalogBrowser` (a different route) but does not re-import this
 * module. A full reload re-imports the module and draws a fresh one.
 */
let visitSeed: number | null = null;

export function getVisitSeed(): number {
  if (visitSeed === null) visitSeed = Math.floor(Math.random() * 0xffffffff);
  return visitSeed;
}
