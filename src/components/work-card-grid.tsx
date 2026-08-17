import type { ReactNode } from "react";

/**
 * Shared wrapper for every `WorkCard` list, so the column layout can't drift
 * out of sync between pages the way the surrounding container width did
 * (issue #112).
 */
export function WorkCardGrid({ children }: { children: ReactNode }) {
  return <ul className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">{children}</ul>;
}
