/**
 * File I/O for `data/media.json`, shared by `build-catalog.ts` and tests so
 * both see exactly the same bytes. Mirrors `nationality-files.ts`: the
 * validation itself lives in `src/lib/media.ts` as a pure function, this
 * module only reads the file.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

export const MEDIA_FILE = path.join(process.cwd(), "data", "media.json");

export async function readMediaSource(): Promise<unknown> {
  return JSON.parse(await readFile(MEDIA_FILE, "utf8")) as unknown;
}
