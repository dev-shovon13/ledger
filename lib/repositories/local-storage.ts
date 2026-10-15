import { DATA_VERSION, emptyData, migrate, type VersionedData } from "../migrations";
import { roundMoney } from "../money";
import { appDataSchema } from "../schema";
import type {
  AppData,
  Expense,
  Loan,
  LoanTransaction,
} from "../types";
import {
  NotFoundError,
  type BackupRepository,
  type ExpenseRepository,
  type LoanRepository,
  type Repositories,
} from "./types";

export const STORAGE_KEY = "expense-tracker:data";

export class StorageError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "StorageError";
  }
}

function getStorage(): Storage | null {
  // Never touch localStorage during SSR/prerender.
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    // Access can throw when storage is disabled (e.g. some private modes).
    return null;
  }
}

function read(): VersionedData {
  const storage = getStorage();
  if (!storage) return emptyData();
  let text: string | null;
  try {
    text = storage.getItem(STORAGE_KEY);
  } catch (cause) {
    throw new StorageError("Could not read saved data.", { cause });
  }
  if (!text) return emptyData();
  try {
    return migrate(JSON.parse(text));
  } catch (error) {
    // Keep the unreadable payload aside instead of overwriting it.
    try {
      storage.setItem(`${STORAGE_KEY}:unreadable-${Date.now()}`, text);
    } catch {
      /* best effort */
    }
    console.warn("Saved data could not be loaded; starting fresh.", error);
    const fresh = emptyData();
    write(fresh);
    return fresh;
  }
}

function write(data: VersionedData): void {
  const storage = getStorage();
  if (!storage) throw new StorageError("Browser storage is unavailable.");
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (cause) {
    throw new StorageError(
      "Could not save. Browser storage may be full or disabled.",
      { cause },
    );
  }
}

/** Read-modify-write against fresh storage so multiple tabs don't clobber. */
function mutate<T>(fn: (data: VersionedData) => T): T {
  const data = read();
  const result = fn(data);
  write(data);
  return result;
}

export function newId(): string {
  const c = globalThis.crypto;
  // randomUUID is only available in secure contexts (not http://192.168…).
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const now = () => new Date().toISOString();

/** Drop keys whose value is undefined/"" so optional fields stay absent. */
function clean<T extends object>(obj: T): T {
  const out = { ...obj } as Record<string, unknown>;
  for (const k of Object.keys(out)) {
    if (out[k] === undefined || out[k] === "") delete out[k];
  }
  return out as T;
}

function findIndexOrThrow<T extends { id: string }>(
  list: T[],
  id: string,
  entity: string,
) {
  const i = list.findIndex((x) => x.id === id);
  if (i === -1) throw new NotFoundError(entity, id);
  return i;
}

class LocalStorageExpenseRepository implements ExpenseRepository {
  async list() {
    return read().expenses;
  }

  async create(input: Parameters<ExpenseRepository["create"]>[0]) {
    const ts = now();
    const expense: Expense = clean({
      ...input,
      amount: roundMoney(input.amount),
      id: newId(),
      createdAt: ts,
      updatedAt: ts,
    });
    mutate((d) => d.expenses.push(expense));
    return expense;
  }

  async update(id: string, patch: Parameters<ExpenseRepository["update"]>[1]) {
    return mutate((d) => {
      const i = findIndexOrThrow(d.expenses, id, "Expense");
      const next: Expense = clean({
        ...d.expenses[i],
        ...patch,
        ...(patch.amount !== undefined && { amount: roundMoney(patch.amount) }),
        id,
        updatedAt: now(),
      });
      d.expenses[i] = next;
      return next;
    });
  }

  async delete(id: string) {
    mutate((d) => {
      d.expenses = d.expenses.filter((e) => e.id !== id);
    });
  }
}

class LocalStorageLoanRepository implements LoanRepository {
  async list() {
    return read().loans;
  }

  async create(input: Parameters<LoanRepository["create"]>[0]) {
    const loan: Loan = clean({ ...input, id: newId(), createdAt: now() });
    mutate((d) => d.loans.push(loan));
    return loan;
  }

  async update(id: string, patch: Parameters<LoanRepository["update"]>[1]) {
    return mutate((d) => {
      const i = findIndexOrThrow(d.loans, id, "Loan");
      const next: Loan = clean({ ...d.loans[i], ...patch, id });
      d.loans[i] = next;
      return next;
    });
  }

  async delete(id: string) {
    mutate((d) => {
      d.loans = d.loans.filter((l) => l.id !== id);
      d.loanTransactions = d.loanTransactions.filter((t) => t.loanId !== id);
    });
  }

  async listTransactions() {
    return read().loanTransactions;
  }

  async createTransaction(
    input: Parameters<LoanRepository["createTransaction"]>[0],
  ) {
    return mutate((d) => {
      findIndexOrThrow(d.loans, input.loanId, "Loan");
      const txn: LoanTransaction = clean({
        ...input,
        amount: roundMoney(input.amount),
        countAsExpense: input.countAsExpense || undefined,
        id: newId(),
      });
      d.loanTransactions.push(txn);
      return txn;
    });
  }

  async updateTransaction(
    id: string,
    patch: Parameters<LoanRepository["updateTransaction"]>[1],
  ) {
    return mutate((d) => {
      const i = findIndexOrThrow(d.loanTransactions, id, "Loan transaction");
      const next: LoanTransaction = clean({
        ...d.loanTransactions[i],
        ...patch,
        ...(patch.amount !== undefined && { amount: roundMoney(patch.amount) }),
        ...(patch.countAsExpense === false && { countAsExpense: undefined }),
        id,
      });
      d.loanTransactions[i] = next;
      return next;
    });
  }

  async deleteTransaction(id: string) {
    mutate((d) => {
      d.loanTransactions = d.loanTransactions.filter((t) => t.id !== id);
    });
  }
}

class LocalStorageBackupRepository implements BackupRepository {
  async exportAll(): Promise<AppData> {
    const { expenses, loans, loanTransactions } = read();
    return { expenses, loans, loanTransactions };
  }

  async importAll(data: AppData) {
    const parsed = appDataSchema.parse(data);
    write({ version: DATA_VERSION, ...parsed });
  }
}

export function createLocalStorageRepositories(): Repositories {
  return {
    expenses: new LocalStorageExpenseRepository(),
    loans: new LocalStorageLoanRepository(),
    backup: new LocalStorageBackupRepository(),
    subscribe(listener) {
      if (typeof window === "undefined") return () => {};
      const onStorage = (e: StorageEvent) => {
        if (e.key === STORAGE_KEY) listener();
      };
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    },
  };
}
