import { z } from "zod";
import { DATA_VERSION, migrate } from "./migrations";
import type { AppData, ISODate, Locale } from "./types";

export const BACKUP_APP_ID = "expense-tracker";

export type BackupPrefs = { currency?: string; extraDates?: ISODate[]; locale?: Locale };

export type BackupFile = {
  app: typeof BACKUP_APP_ID;
  version: number;
  exportedAt: string;
  data: AppData;
  prefs?: BackupPrefs;
};

export function createBackup(data: AppData, prefs: BackupPrefs): BackupFile {
  return {
    app: BACKUP_APP_ID,
    version: DATA_VERSION,
    exportedAt: new Date().toISOString(),
    data,
    prefs,
  };
}

const prefsSchema = z
  .object({
    currency: z.string().min(1).max(5).optional(),
    extraDates: z.array(z.string()).optional(),
    locale: z.enum(["en", "bn"]).optional(),
  })
  .optional();

export type BackupErrorCode = "invalidJson" | "unrecognised" | "invalidData";

/** Carries a code the UI translates; `message` keeps the technical detail. */
export class BackupError extends Error {
  constructor(
    readonly code: BackupErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "BackupError";
  }
}

/**
 * Accepts a backup file produced by `createBackup`, or a bare
 * `{ expenses, loans, loanTransactions }` object. Throws a `BackupError`
 * when the file is not usable.
 */
export function parseBackup(text: string): { data: AppData; prefs?: BackupPrefs } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (cause) {
    throw new BackupError("invalidJson", "This file is not valid JSON.", { cause });
  }
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    throw new BackupError("unrecognised", "Unrecognised backup file.");
  }

  const obj = json as Record<string, unknown>;
  const wrapped = "data" in obj && typeof obj.data === "object";
  const payload = wrapped ? { version: obj.version, ...(obj.data as object) } : obj;
  let migrated;
  try {
    migrated = migrate(payload);
  } catch (cause) {
    throw new BackupError("invalidData", cause instanceof Error ? cause.message : "Invalid data", { cause });
  }
  const { expenses, loans, loanTransactions } = migrated;

  const prefs = wrapped ? prefsSchema.safeParse(obj.prefs) : undefined;
  return {
    data: { expenses, loans, loanTransactions },
    prefs: prefs?.success ? prefs.data : undefined,
  };
}
