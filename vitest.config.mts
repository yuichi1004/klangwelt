import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirrors the `paths` in tsconfig.json. `@/data/*` is listed first for the
    // same reason it is there: it must win over the broader `@/*`.
    alias: [
      { find: /^@\/data\//, replacement: `${path.resolve("data")}/` },
      { find: /^@\//, replacement: `${path.resolve("src")}/` },
    ],
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
