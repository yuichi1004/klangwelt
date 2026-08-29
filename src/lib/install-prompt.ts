/**
 * State for the "install this as an app" bottom sheet (`install-prompt.tsx`),
 * persisted in localStorage so a visitor who dismisses it — or who has
 * already installed — never sees it again. Same shape of module as
 * `favorites.ts`: pure parsing/decision functions here, all `window` access
 * guarded and defensive, so most of this can be unit tested without a DOM.
 */

export const INSTALL_PROMPT_STORAGE_KEY = "klangwelt.install-prompt.v1";

/** How long the sheet waits after mount before it can appear, so it never
 *  interrupts the very first paint. */
export const INSTALL_PROMPT_DELAY_MS = 8000;

export interface InstallPromptState {
  version: 1;
  dismissedAt: number | null;
  installed: boolean;
}

export const INITIAL_INSTALL_PROMPT_STATE: InstallPromptState = {
  version: 1,
  dismissedAt: null,
  installed: false,
};

export function parseInstallPromptState(
  rawValue: string | null,
): InstallPromptState {
  if (!rawValue) return INITIAL_INSTALL_PROMPT_STATE;

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (typeof parsed !== "object" || parsed === null) {
      return INITIAL_INSTALL_PROMPT_STATE;
    }
    const candidate = parsed as Record<string, unknown>;
    const dismissedAt =
      typeof candidate.dismissedAt === "number" ? candidate.dismissedAt : null;
    const installed = candidate.installed === true;
    return { version: 1, dismissedAt, installed };
  } catch {
    return INITIAL_INSTALL_PROMPT_STATE;
  }
}

export function readInstallPromptState(): InstallPromptState {
  if (typeof window === "undefined") return INITIAL_INSTALL_PROMPT_STATE;
  try {
    return parseInstallPromptState(
      window.localStorage.getItem(INSTALL_PROMPT_STORAGE_KEY),
    );
  } catch {
    // Safari in private mode throws on localStorage access — behave as if
    // nothing has been dismissed yet, for this visit only.
    return INITIAL_INSTALL_PROMPT_STATE;
  }
}

export function writeInstallPromptState(state: InstallPromptState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      INSTALL_PROMPT_STORAGE_KEY,
      JSON.stringify(state),
    );
  } catch {
    // Storage full or blocked: the sheet may reappear next visit, which is
    // an acceptable degradation — it is never shown more than once per visit.
  }
}

/** Once dismissed or installed, never show it again. */
export function shouldShowInstallPrompt(state: InstallPromptState): boolean {
  return state.dismissedAt === null && !state.installed;
}

/**
 * iOS Safari is the only browser that both (a) has no `beforeinstallprompt`
 * and (b) can still install as a standalone app, via the manual share-sheet
 * flow — so it is the one platform the sheet points at the guide page
 * (`/install`) instead of a native install button. Other iOS browsers (e.g.
 * Chrome/Firefox on iOS) are themselves Safari under the hood but do not
 * expose "Add to Home Screen" in a way worth documenting, and are excluded
 * by requiring the `Safari` token while excluding `CriOS`/`FxiOS`.
 */
export function isIosSafari(userAgent: string): boolean {
  const isIos = /iPad|iPhone|iPod/.test(userAgent);
  const isSafari = /Safari/.test(userAgent) && !/CriOS|FxiOS|EdgiOS/.test(userAgent);
  return isIos && isSafari;
}

/**
 * True once the site is actually running installed — either via the
 * standard `display-mode` media query, or `navigator.standalone`, the
 * non-standard property iOS Safari set before that query existed.
 */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const standaloneNav = (
    window.navigator as Navigator & { standalone?: boolean }
  ).standalone;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    standaloneNav === true
  );
}
