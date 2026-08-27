import { describe, expect, it } from "vitest";

import {
  INITIAL_INSTALL_PROMPT_STATE,
  isIosSafari,
  parseInstallPromptState,
  shouldShowInstallPrompt,
  type InstallPromptState,
} from "./install-prompt";

describe("parseInstallPromptState", () => {
  it("reads a well-formed payload", () => {
    expect(
      parseInstallPromptState('{"version":1,"dismissedAt":123,"installed":false}'),
    ).toEqual({ version: 1, dismissedAt: 123, installed: false });
  });

  it("falls back to the initial state for anything unusable", () => {
    for (const value of [null, "", "not json", "[]", "null"]) {
      expect(parseInstallPromptState(value), value ?? "null").toEqual(
        INITIAL_INSTALL_PROMPT_STATE,
      );
    }
  });

  it("drops a non-numeric dismissedAt and a non-boolean installed", () => {
    expect(
      parseInstallPromptState('{"dismissedAt":"nope","installed":"yes"}'),
    ).toEqual({ version: 1, dismissedAt: null, installed: false });
  });
});

describe("shouldShowInstallPrompt", () => {
  it("shows when never dismissed and not installed", () => {
    expect(shouldShowInstallPrompt(INITIAL_INSTALL_PROMPT_STATE)).toBe(true);
  });

  it("hides once dismissed", () => {
    const state: InstallPromptState = {
      version: 1,
      dismissedAt: 1000,
      installed: false,
    };
    expect(shouldShowInstallPrompt(state)).toBe(false);
  });

  it("hides once installed, even without an explicit dismissal", () => {
    const state: InstallPromptState = {
      version: 1,
      dismissedAt: null,
      installed: true,
    };
    expect(shouldShowInstallPrompt(state)).toBe(false);
  });
});

describe("isIosSafari", () => {
  const IOS_SAFARI =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
  const IOS_CHROME =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0.6613.113 Mobile/15E148 Safari/604.1";
  const ANDROID_CHROME =
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36";
  const DESKTOP_SAFARI =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";

  it("is true for Safari on iOS", () => {
    expect(isIosSafari(IOS_SAFARI)).toBe(true);
  });

  it("is false for Chrome on iOS, which is Safari under the hood", () => {
    expect(isIosSafari(IOS_CHROME)).toBe(false);
  });

  it("is false for Chrome on Android", () => {
    expect(isIosSafari(ANDROID_CHROME)).toBe(false);
  });

  it("is false for desktop Safari", () => {
    expect(isIosSafari(DESKTOP_SAFARI)).toBe(false);
  });
});
