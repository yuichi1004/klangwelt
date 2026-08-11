/**
 * File I/O for `data/nationalities.json`, shared by `build-catalog.ts` and
 * tests so both see exactly the same bytes. Mirrors `curation-files.ts`:
 * the validation itself lives in `src/lib/nationality.ts` as a pure
 * function, this module only reads the file.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

export const NATIONALITIES_FILE = path.join(
  process.cwd(),
  "data",
  "nationalities.json",
);

export async function readNationalitySource(): Promise<unknown> {
  return JSON.parse(await readFile(NATIONALITIES_FILE, "utf8")) as unknown;
}
