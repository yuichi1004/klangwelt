import type { Epoch, Genre } from "./epochs";

/** A work as served to the app: Open Opus metadata plus derived Japanese. */
export interface Work {
  id: string;
  composerId: string;
  /** Original English title, whitespace-normalised. */
  title: string;
  /** Japanese title; equals `title` when the form could not be translated. */
  titleJa: string;
  genre: Genre;
  popular: boolean;
  recommended: boolean;
  /** Extra search phrases Open Opus supplies (alternative/original names). */
  searchTerms: string;
  /** Structured facts derived from the title, shown as the "work data" panel. */
  facts: WorkFacts;
}

export interface WorkFacts {
  /** English form phrase, e.g. `Piano Sonata`. */
  form?: string;
  formJa?: string;
  number?: number;
  /** e.g. `C sharp minor`. */
  key?: string;
  keyJa?: string;
  catalogue: string[];
  catalogueJa: string[];
  nickname?: string;
  nicknameJa?: string;
  instrumentation?: string;
  /** Open Opus subtitle, e.g. `Opera`. */
  subtitle?: string;
}

export interface Composer {
  id: string;
  /** Open Opus short name, e.g. `Beethoven`. */
  name: string;
  /** Open Opus full name, e.g. `Ludwig van Beethoven`. */
  completeName: string;
  /** Hand-written Japanese name; falls back to `completeName`. */
  nameJa: string;
  epoch: Epoch;
  birthYear: number;
  /** Null for living composers. */
  deathYear: number | null;
  popular: boolean;
  /** Total works in Open Opus. */
  workCount: number;
  /** Works in the curated core index. */
  coreWorkCount: number;
  /** Path under /public, absent when no freely licensed portrait exists. */
  portrait?: string;
}

/**
 * The subset of a work needed to render a list row and to filter on.
 *
 * Kept separate from `Work` because the catalogue page hands the whole core
 * index to a client component: shipping the `facts` of 1,286 works would
 * roughly triple the payload for data the list never displays.
 */
export interface WorkIndexRow {
  id: string;
  composerId: string;
  title: string;
  titleJa: string;
  genre: Genre;
  popular: boolean;
  recommended: boolean;
}

export interface CatalogMeta {
  builtAt: string;
  composerCount: number;
  coreWorkCount: number;
  totalWorkCount: number;
  /** Share of core works with a rule-translated Japanese title. */
  translatedRatio: number;
}
