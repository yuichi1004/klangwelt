"use client";

import { useMemo, useState } from "react";

import { useFavorites } from "@/components/favorites-provider";
import { getMessages, LOCALE_LABELS, type Locale } from "@/i18n/config";
import {
  buildBackup,
  mergeFavorites,
  parseBackup,
  serializeBackup,
  writeStoredLocale,
  type BackupData,
} from "@/lib/backup";
import { persistFavorites, type FavoritesState } from "@/lib/favorites";

const TEXT_INPUT_CLASS =
  "w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-faint";

interface Preview {
  data: BackupData;
  merged: FavoritesState;
  added: number;
  alreadyPresent: number;
}

/**
 * Export/import panel for the `/favorites` page. The site has no account and
 * no server, so this is a manual local backup: a JSON payload the visitor
 * carries themselves, via file download or clipboard copy, to another
 * browser or device.
 */
export function BackupPanel({ locale }: { locale: Locale }) {
  const messages = getMessages(locale);
  const { workIds, ready } = useFavorites();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pastedText, setPastedText] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [parseFailed, setParseFailed] = useState(false);

  const exportedText = useMemo(() => {
    const favorites: FavoritesState = { version: 1, workIds };
    const backup = buildBackup(favorites, locale, new Date().toISOString());
    return { text: serializeBackup(backup), exportedAt: backup.exportedAt };
  }, [workIds, locale]);

  function handleDownload() {
    const blob = new Blob([exportedText.text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `klangwelt-backup-${exportedText.exportedAt.slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(exportedText.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable or permission denied — the textarea below
      // is always visible and selectable by hand, so copying still works.
    }
  }

  function handleParse(raw: string) {
    const result = parseBackup(raw);
    if ("error" in result) {
      setPreview(null);
      setParseFailed(true);
      return;
    }
    setParseFailed(false);
    const { merged, added, alreadyPresent } = mergeFavorites(
      { version: 1, workIds },
      result.data.favorites,
    );
    setPreview({ data: result.data, merged, added, alreadyPresent });
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") handleParse(reader.result);
    };
    reader.readAsText(file);
  }

  function handleApply() {
    if (!preview) return;
    persistFavorites(preview.merged);
    if (preview.data.locale) writeStoredLocale(preview.data.locale);
    setPreview(null);
    setPastedText("");
  }

  return (
    <section className="mt-6">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-lg border border-line bg-paper-raised px-5 py-4 text-sm text-ink-soft transition-colors hover:border-accent/50 hover:bg-accent-soft"
      >
        <span className="font-serif text-lg font-medium text-ink">
          {messages.backup.heading}
        </span>
        <span className="text-ink-faint">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-6">
          <p className="text-sm text-ink-faint">{messages.backup.description}</p>

          {!ready && (
            <p className="text-sm text-ink-faint">{messages.common.loading}</p>
          )}

          {ready && (
            <>
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-ink">
                  {messages.backup.export}
                </h3>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="rounded-md border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-accent/40 hover:text-accent"
                  >
                    {messages.backup.download}
                  </button>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="rounded-md border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-accent/40 hover:text-accent"
                  >
                    {copied ? messages.backup.copied : messages.backup.copy}
                  </button>
                </div>
                <textarea
                  readOnly
                  rows={6}
                  value={exportedText.text}
                  className={`${TEXT_INPUT_CLASS} font-mono`}
                />
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-ink">
                  {messages.backup.import}
                </h3>

                <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-soft">
                  <span className="rounded-md border border-line px-3 py-1.5 hover:border-accent/40 hover:text-accent">
                    {messages.backup.importFile}
                  </span>
                  <input
                    type="file"
                    accept="application/json"
                    onChange={handleFileChange}
                    className="sr-only"
                  />
                </label>

                <textarea
                  rows={6}
                  value={pastedText}
                  onChange={(event) => {
                    setPastedText(event.target.value);
                    setPreview(null);
                    setParseFailed(false);
                  }}
                  placeholder={messages.backup.importPaste}
                  className={`${TEXT_INPUT_CLASS} font-mono`}
                />
                <button
                  type="button"
                  onClick={() => handleParse(pastedText)}
                  disabled={pastedText.trim() === ""}
                  className="rounded-md border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {messages.backup.import}
                </button>

                {parseFailed && (
                  <p className="rounded-lg border border-dashed border-line p-5 text-sm text-ink-faint">
                    {messages.backup.importError}
                  </p>
                )}

                {preview && (
                  <div className="rounded-lg border border-line bg-paper-raised p-5">
                    <p className="text-sm text-ink-soft">
                      {(preview.data.locale
                        ? messages.backup.importPreviewLocale
                        : messages.backup.importPreview
                      )
                        .replace(
                          "{favorites}",
                          String(preview.data.favorites.workIds.length),
                        )
                        .replace("{added}", String(preview.added))
                        .replace("{skipped}", String(preview.alreadyPresent))
                        .replace(
                          "{locale}",
                          preview.data.locale
                            ? LOCALE_LABELS[preview.data.locale]
                            : "",
                        )}
                    </p>
                    <button
                      type="button"
                      onClick={handleApply}
                      className="mt-3 rounded-full bg-accent-fill px-4 py-2 text-sm font-semibold text-accent-ink"
                    >
                      {messages.backup.importApply}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
