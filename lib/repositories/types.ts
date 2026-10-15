import type {
  AppData,
  Expense,
  ExpenseInput,
  ExpensePatch,
  Loan,
  LoanInput,
  LoanPatch,
  LoanTransaction,
  LoanTransactionInput,
  LoanTransactionPatch,
} from "../types";

/*
 * The UI and store only ever talk to these interfaces. Swapping
 * LocalStorage for an HTTP API means writing an `ApiRepositories` that
 * implements them and returning it from `getRepositories()`.
 *
 * Repositories own id and timestamp generation, as a server would.
 */

export interface ExpenseRepository {
  list(): Promise<Expense[]>;
  create(input: ExpenseInput): Promise<Expense>;
  update(id: string, patch: ExpensePatch): Promise<Expense>;
  delete(id: string): Promise<void>;
}

export interface LoanRepository {
  list(): Promise<Loan[]>;
  create(input: LoanInput): Promise<Loan>;
  update(id: string, patch: LoanPatch): Promise<Loan>;
  /** Deletes the loan and all of its transactions. */
  delete(id: string): Promise<void>;

  listTransactions(): Promise<LoanTransaction[]>;
  createTransaction(input: LoanTransactionInput): Promise<LoanTransaction>;
  updateTransaction(
    id: string,
    patch: LoanTransactionPatch,
  ): Promise<LoanTransaction>;
  deleteTransaction(id: string): Promise<void>;
}

export interface BackupRepository {
  exportAll(): Promise<AppData>;
  /** Replaces all stored data with `data`. */
  importAll(data: AppData): Promise<void>;
}

export type Repositories = {
  expenses: ExpenseRepository;
  loans: LoanRepository;
  backup: BackupRepository;
  /**
   * Notifies when data changes outside this app instance (another tab today;
   * a push/poll channel for an API later). Returns an unsubscribe function.
   */
  subscribe?(listener: () => void): () => void;
};

export class NotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} ${id} not found`);
    this.name = "NotFoundError";
  }
}
