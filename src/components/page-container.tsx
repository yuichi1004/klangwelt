import type { ReactNode } from "react";

/**
 * The single source of truth for page-level max-width. Every page/component
 * used to hand-roll `mx-auto max-w-{3xl|6xl} px-4 ... sm:px-6 ...`, and half
 * of them drifted to `max-w-3xl` while the header/footer stayed `max-w-6xl`
 * — the left-edge mismatch from issue #112. Vertical padding and any extra
 * layout classes still come from the caller via `className`, since those
 * genuinely vary page to page.
 */
export function PageContainer({
  as: Tag = "div",
  className = "",
  testId,
  children,
}: {
  as?: "div" | "article" | "section";
  className?: string;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <Tag
      className={`mx-auto max-w-6xl px-4 sm:px-6 ${className}`}
      data-testid={testId}
    >
      {children}
    </Tag>
  );
}
