import { describe, expect, it } from "vitest";

import {
  BORDER_BRIGHTNESS_THRESHOLD,
  classifyTrimResult,
  isMarginCandidate,
} from "./portrait-trim";

describe("isMarginCandidate", () => {
  it("flags the measured range of issue #122's 18 composers", () => {
    for (const brightness of [183.9, 194.6, 207.4, 236.6, 254.8, 255.0]) {
      expect(isMarginCandidate(brightness), String(brightness)).toBe(true);
    }
  });

  it("does not flag a full-bleed dark portrait (the Corelli control, 57.2)", () => {
    expect(isMarginCandidate(57.2)).toBe(false);
  });

  it("is exclusive of the threshold itself", () => {
    expect(isMarginCandidate(BORDER_BRIGHTNESS_THRESHOLD)).toBe(false);
    expect(isMarginCandidate(BORDER_BRIGHTNESS_THRESHOLD + 0.1)).toBe(true);
  });
});

describe("classifyTrimResult", () => {
  const square = (originalWidth: number, trimmedWidth: number) => ({
    originalWidth,
    originalHeight: originalWidth,
    trimmedWidth,
    trimmedHeight: trimmedWidth,
  });

  it("skips a negligible reduction — no real margin found", () => {
    expect(classifyTrimResult(square(400, 396))).toBe("skip"); // 1%
    expect(classifyTrimResult(square(400, 389))).toBe("skip"); // 2.75%
  });

  it("adopts a moderate, plausible margin trim", () => {
    expect(classifyTrimResult(square(400, 320))).toBe("adopt"); // 20%
    expect(classifyTrimResult(square(400, 250))).toBe("adopt"); // 37.5%
  });

  it("flags an overly aggressive trim for manual review", () => {
    expect(classifyTrimResult(square(400, 100))).toBe("needs-review"); // 75%
  });

  it("flags a trim that drops below the absolute pixel floor", () => {
    // Only 12% reduction (within the "adopt" ratio band), but the low-res
    // Des Prez source (199x200) means even a modest trim can cross 80px.
    expect(classifyTrimResult(square(199, 70))).toBe("needs-review");
  });

  it("judges each axis independently", () => {
    // Width barely moves, height trims plausibly — a portrait with margin
    // on only the top/bottom, e.g. a tall frame around a square face.
    const result = classifyTrimResult({
      originalWidth: 400,
      originalHeight: 500,
      trimmedWidth: 396,
      trimmedHeight: 380,
    });
    expect(result).toBe("adopt");
  });
});
