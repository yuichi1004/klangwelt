/**
 * Shared types and helpers for the Open Opus seed step.
 *
 * Open Opus data is dedicated to the public domain (CC0 1.0); their PHP
 * server implementation is GPLv3 but we use none of it. See docs/CREDITS.md.
 */

export const EPOCHS = [
  "Medieval",
  "Renaissance",
  "Baroque",
  "Classical",
  "Early Romantic",
  "Romantic",
  "Late Romantic",
  "20th Century",
  "Post-War",
  "21st Century",
] as const;

export type Epoch = (typeof EPOCHS)[number];

export const GENRES = [
  "Orchestral",
  "Keyboard",
  "Chamber",
  "Stage",
  "Vocal",
] as const;

export type Genre = (typeof GENRES)[number];

/** A composer exactly as Open Opus returns it from `/composer/list/...`. */
export interface RawComposer {
  id: string;
  name: string;
  complete_name: string;
  birth: string;
  death: string | null;
  epoch: string;
  /** Present on the popular/recommended list endpoints. */
  popular?: string;
  recommended?: string;
  portrait?: string;
}

/** A work exactly as Open Opus returns it from `/work/list/...`. */
export interface RawWork {
  id: string;
  title: string;
  subtitle: string;
  searchterms: string;
  popular: string;
  recommended: string;
  genre: string;
}

export interface RawDataset {
  fetchedAt: string;
  composers: RawComposer[];
  /** Keyed by composer id. */
  works: Record<string, RawWork[]>;
}

const USER_AGENT =
  "klangwelt/0.1 (https://github.com/yuichi1004/klangwelt; classical music portal)";

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Open Opus throttles aggressive clients ("You are making too many requests"),
 * so every call goes through a paced fetch with retry-and-back-off.
 */
export async function getJson<T>(url: string, attempt = 1): Promise<T> {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  const body = await response.text();

  try {
    return JSON.parse(body) as T;
  } catch {
    if (attempt >= 5) {
      throw new Error(
        `${url} did not return JSON after ${attempt} attempts: ${body.slice(0, 120)}`,
      );
    }
    const backoff = 2000 * attempt;
    console.warn(`  throttled, retrying in ${backoff}ms (${body.slice(0, 60)})`);
    await sleep(backoff);
    return getJson<T>(url, attempt + 1);
  }
}
