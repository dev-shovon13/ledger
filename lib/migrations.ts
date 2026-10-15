import { appDataSchema } from "./schema";
import type { AppData } from "./types";

/** Bump when the stored shape changes and add a step to `migrate`. */
export const DATA_VERSION = 1;

export type VersionedData = AppData & { version: number };

export class MigrationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "MigrationError";
  }
}

export const emptyData = (): VersionedData => ({
  version: DATA_VERSION,
  expenses: [],
  loans: [],
  loanTransactions: [],
});

/**
 * Upgrade any older data shape (from storage or a backup file) to the current
 * version, then validate it. Each `case` falls through to the next so data
 * from any version reaches DATA_VERSION.
 */
export function migrate(raw: unknown): VersionedData {
  if (raw == null || typeof raw !== "object") return emptyData();
  const data = { ...(raw as Record<string, unknown>) };
  const version = typeof data.version === "number" ? data.version : 0;

  switch (version) {
    case 0:
      // Pre-versioned data: same shape, ensure arrays exist.
      data.expenses ??= [];
      data.loans ??= [];
      data.loanTransactions ??= [];
    // falls through
    case DATA_VERSION:
      break;
    default:
      throw new MigrationError(
        `This data is from a newer version (${version}) of the app.`,
      );
  }

  const parsed = appDataSchema.safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new MigrationError(
      `Invalid data at ${issue?.path.join(".") || "root"}: ${issue?.message}`,
      { cause: parsed.error },
    );
  }
  return { version: DATA_VERSION, ...parsed.data };
}
