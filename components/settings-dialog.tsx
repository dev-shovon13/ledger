"use client";

import { DownloadIcon, UploadIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LanguageSwitch } from "@/components/language-switch";
import { ThemeSegmented } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { BackupError, createBackup, parseBackup, type BackupPrefs } from "@/lib/backup";
import { todayISO } from "@/lib/dates";
import { useI18n } from "@/lib/i18n";
import { getRepositories } from "@/lib/repositories";
import { DEFAULT_CURRENCY, useDataStore, usePrefsStore } from "@/lib/store";
import type { AppData } from "@/lib/types";
import { cn } from "@/lib/utils";

const PRESETS = [
  { symbol: "৳", label: "BDT" },
  { symbol: "$", label: "USD" },
  { symbol: "€", label: "EUR" },
  { symbol: "£", label: "GBP" },
  { symbol: "₹", label: "INR" },
];

type Props = { open: boolean; onOpenChange(open: boolean): void };

export function SettingsDialog({ open, onOpenChange }: Props) {
  const { t, f } = useI18n();
  const s = t.settings;
  const currency = usePrefsStore((st) => st.currency);
  const setCurrency = usePrefsStore((st) => st.setCurrency);
  const replaceAll = useDataStore((st) => st.replaceAll);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ data: AppData; prefs?: BackupPrefs } | null>(null);

  async function handleExport() {
    try {
      const data = await getRepositories().backup.exportAll();
      const { extraDates, locale } = usePrefsStore.getState();
      const blob = new Blob(
        [JSON.stringify(createBackup(data, { currency, extraDates, locale }), null, 2)],
        { type: "application/json" },
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `expense-tracker-backup-${todayISO()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(s.backupDownloaded);
    } catch (e) {
      toast.error(s.exportFailed, { description: e instanceof Error ? e.message : undefined });
    }
  }

  async function handleFile(file: File) {
    try {
      setPending(parseBackup(await file.text()));
    } catch (e) {
      const description =
        e instanceof BackupError ? s.errors[e.code] : e instanceof Error ? e.message : undefined;
      toast.error(s.importFailed, { description });
    }
  }

  async function confirmImport() {
    if (!pending) return;
    try {
      await replaceAll(pending.data);
      const prefs = usePrefsStore.getState();
      if (pending.prefs?.currency) prefs.setCurrency(pending.prefs.currency);
      if (pending.prefs?.locale) prefs.setLocale(pending.prefs.locale);
      if (pending.prefs?.extraDates) usePrefsStore.setState({ extraDates: pending.prefs.extraDates });
      toast.success(s.imported);
      setPending(null);
      onOpenChange(false);
    } catch (e) {
      toast.error(s.importFailed, { description: e instanceof Error ? e.message : undefined });
    }
  }

  const isPreset = PRESETS.some((p) => p.symbol === currency);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent sheet className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{s.title}</DialogTitle>
            <DialogDescription>{s.description}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-5">
            <Field>
              <FieldLabel>{s.language}</FieldLabel>
              <LanguageSwitch size="lg" />
            </Field>

            <Field>
              <FieldLabel>{s.theme}</FieldLabel>
              <ThemeSegmented />
            </Field>

            <Field>
              <FieldLabel>{s.currency}</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <Button
                    key={p.symbol}
                    type="button"
                    size="sm"
                    variant={currency === p.symbol ? "default" : "outline"}
                    aria-pressed={currency === p.symbol}
                    onClick={() => setCurrency(p.symbol)}
                  >
                    <span className="text-base leading-none">{p.symbol}</span>
                    <span className="text-xs opacity-75">{p.label}</span>
                  </Button>
                ))}
                <Input
                  aria-label={s.customLabel}
                  placeholder={s.custom}
                  maxLength={5}
                  className={cn("h-7 w-24", !isPreset && "border-primary")}
                  defaultValue={isPreset ? "" : currency}
                  onChange={(e) => setCurrency(e.target.value.trim() || DEFAULT_CURRENCY)}
                />
              </div>
            </Field>

            <Separator />

            <Field>
              <FieldLabel>{s.backup}</FieldLabel>
              <FieldDescription>{s.backupHelp}</FieldDescription>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={handleExport}>
                  <DownloadIcon /> {s.export}
                </Button>
                <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
                  <UploadIcon /> {s.import}
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void handleFile(file);
                  }}
                />
              </div>
            </Field>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        title={s.replaceTitle}
        description={pending && s.replaceBody(f.number(pending.data.expenses.length), f.number(pending.data.loans.length))}
        confirmLabel={s.replaceConfirm}
        onConfirm={confirmImport}
      />
    </>
  );
}
