"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { nextSettlement, transactionsForLoan } from "./calculations";
import { addMonths, monthOf, todayISO } from "./dates";
import { getRepositories } from "./repositories";
import type {
  AppData,
  Expense,
  ExpenseInput,
  ExpensePatch,
  ISODate,
  ISOMonth,
  Loan,
  LoanDirection,
  LoanPatch,
  LoanTransaction,
  LoanTransactionInput,
  LoanTransactionPatch,
  Locale,
  SortOrder,
} from "./types";

// ---------------------------------------------------------------------------
// Data store: an in-memory mirror of the repositories. Every mutation goes
// through the repository first, then updates state with what it returned.
// ---------------------------------------------------------------------------

type Status = "idle" | "loading" | "ready" | "error";

export type NewLoanInput = {
  person: string;
  direction: LoanDirection;
  amount: number;
  date: ISODate;
  note?: string;
};

type DataState = {
  status: Status;
  error?: string;
  expenses: Expense[];
  loans: Loan[];
  transactions: LoanTransaction[];
  /** Briefly highlighted in the list so the user sees where it landed. */
  lastAddedExpenseId?: string;

  load(): Promise<void>;

  addExpense(input: ExpenseInput): Promise<Expense>;
  updateExpense(id: string, patch: ExpensePatch): Promise<Expense>;
  deleteExpense(id: string): Promise<void>;

  addLoan(input: NewLoanInput): Promise<Loan>;
  updateLoan(id: string, patch: LoanPatch): Promise<Loan>;
  deleteLoan(id: string): Promise<void>;
  reopenLoan(id: string): Promise<void>;

  /** Returns the loan's settlement change, if this transaction caused one. */
  addTransaction(input: LoanTransactionInput): Promise<SettlementChange>;
  updateTransaction(
    id: string,
    patch: LoanTransactionPatch,
  ): Promise<SettlementChange>;
  deleteTransaction(id: string): Promise<SettlementChange>;

  replaceAll(data: AppData): Promise<void>;
};

export type SettlementChange = "settled" | "reopened" | null;

const repos = () => getRepositories();

export const useDataStore = create<DataState>()((set, get) => {
  /** Keep `settledAt` in step with the balance after any transaction change. */
  async function syncSettlement(loanId: string): Promise<SettlementChange> {
    const loan = get().loans.find((l) => l.id === loanId);
    if (!loan) return null;
    const change = nextSettlement(
      loan,
      transactionsForLoan(get().transactions, loanId),
    );
    if (!change) return null;
    const updated = await repos().loans.update(loanId, change);
    set((s) => ({
      loans: s.loans.map((l) => (l.id === loanId ? updated : l)),
    }));
    return change.settledAt ? "settled" : "reopened";
  }

  return {
    status: "idle",
    expenses: [],
    loans: [],
    transactions: [],

    async load() {
      if (get().status === "idle") set({ status: "loading" });
      try {
        const r = repos();
        const [expenses, loans, transactions] = await Promise.all([
          r.expenses.list(),
          r.loans.list(),
          r.loans.listTransactions(),
        ]);
        set({ status: "ready", error: undefined, expenses, loans, transactions });
      } catch (e) {
        set({
          status: "error",
          error: e instanceof Error ? e.message : "Could not load data.",
        });
      }
    },

    async addExpense(input) {
      const expense = await repos().expenses.create(input);
      set((s) => ({ expenses: [...s.expenses, expense], lastAddedExpenseId: expense.id }));
      return expense;
    },

    async updateExpense(id, patch) {
      const expense = await repos().expenses.update(id, patch);
      set((s) => ({
        expenses: s.expenses.map((e) => (e.id === id ? expense : e)),
      }));
      return expense;
    },

    async deleteExpense(id) {
      await repos().expenses.delete(id);
      set((s) => ({ expenses: s.expenses.filter((e) => e.id !== id) }));
    },

    async addLoan({ amount, date, ...loanInput }) {
      const r = repos();
      const loan = await r.loans.create(loanInput);
      const txn = await r.loans.createTransaction({
        loanId: loan.id,
        date,
        type: "principal",
        amount,
      });
      set((s) => ({
        loans: [...s.loans, loan],
        transactions: [...s.transactions, txn],
      }));
      return loan;
    },

    async updateLoan(id, patch) {
      const loan = await repos().loans.update(id, patch);
      set((s) => ({ loans: s.loans.map((l) => (l.id === id ? loan : l)) }));
      return loan;
    },

    async deleteLoan(id) {
      await repos().loans.delete(id);
      set((s) => ({
        loans: s.loans.filter((l) => l.id !== id),
        transactions: s.transactions.filter((t) => t.loanId !== id),
      }));
    },

    async reopenLoan(id) {
      await get().updateLoan(id, { settledAt: undefined });
    },

    async addTransaction(input) {
      const txn = await repos().loans.createTransaction(input);
      set((s) => ({ transactions: [...s.transactions, txn] }));
      return syncSettlement(input.loanId);
    },

    async updateTransaction(id, patch) {
      const txn = await repos().loans.updateTransaction(id, patch);
      set((s) => ({
        transactions: s.transactions.map((t) => (t.id === id ? txn : t)),
      }));
      return syncSettlement(txn.loanId);
    },

    async deleteTransaction(id) {
      const txn = get().transactions.find((t) => t.id === id);
      await repos().loans.deleteTransaction(id);
      set((s) => ({ transactions: s.transactions.filter((t) => t.id !== id) }));
      return txn ? syncSettlement(txn.loanId) : null;
    },

    async replaceAll(data) {
      await repos().backup.importAll(data);
      await get().load();
    },
  };
});

// ---------------------------------------------------------------------------
// Preferences: small UI settings, persisted with zustand's persist middleware.
// ---------------------------------------------------------------------------

type PrefsState = {
  locale: Locale;
  currency: string;
  sortOrder: SortOrder;
  /** Days the user picked to log on ("Add expenses for another day"); may be empty. */
  extraDates: ISODate[];
  setLocale(locale: Locale): void;
  setCurrency(currency: string): void;
  setSortOrder(order: SortOrder): void;
  addExtraDate(date: ISODate): void;
  removeExtraDate(date: ISODate): void;
};

export const DEFAULT_CURRENCY = "৳";

const noopStorage: Storage = {
  length: 0,
  clear: () => {},
  getItem: () => null,
  key: () => null,
  removeItem: () => {},
  setItem: () => {},
};

const safeStorage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = {
  getItem: (k) => {
    try {
      return window.localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      window.localStorage.setItem(k, v);
    } catch {
      /* storage full or disabled */
    }
  },
  removeItem: (k) => {
    try {
      window.localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      locale: "en",
      currency: DEFAULT_CURRENCY,
      sortOrder: "newest",
      extraDates: [],
      setLocale: (locale) => set({ locale }),
      setCurrency: (currency) => set({ currency }),
      setSortOrder: (sortOrder) => set({ sortOrder }),
      addExtraDate: (date) =>
        set((s) =>
          s.extraDates.includes(date)
            ? s
            : { extraDates: [...s.extraDates, date] },
        ),
      removeExtraDate: (date) =>
        set((s) => ({ extraDates: s.extraDates.filter((d) => d !== date) })),
    }),
    {
      name: "expense-tracker:prefs",
      version: 1,
      // Fall back to an in-memory no-op when storage is unavailable.
      storage: createJSONStorage(() =>
        typeof window === "undefined" ? noopStorage : safeStorage,
      ),
      // Read only on the client, after mount (see initApp).
      skipHydration: true,
    },
  ),
);

// ---------------------------------------------------------------------------
// View state shared by the Expenses and Loans pages.
// ---------------------------------------------------------------------------

type ViewState = {
  /** null until the client has mounted (we don't know "today" on the server). */
  today: ISODate | null;
  month: ISOMonth | null;
  setMonth(month: ISOMonth): void;
  shiftMonth(delta: number): void;
};

export const useViewStore = create<ViewState>()((set) => ({
  today: null,
  month: null,
  setMonth: (month) => set({ month }),
  shiftMonth: (delta) =>
    set((s) => (s.month ? { month: addMonths(s.month, delta) } : s)),
}));

let initialized = false;

/** Client-only bootstrap: called once from the app shell after mount. */
export function initApp() {
  if (initialized) return;
  initialized = true;
  const today = todayISO();
  useViewStore.setState({ today, month: monthOf(today) });
  void usePrefsStore.persist.rehydrate();
  void useDataStore.getState().load();

  // Keep other open tabs/devices in sync.
  getRepositories().subscribe?.(() => void useDataStore.getState().load());
  window.addEventListener("storage", (e) => {
    if (e.key === usePrefsStore.persist.getOptions().name) {
      void usePrefsStore.persist.rehydrate();
    }
  });
}

/** Ready once data and preferences are both loaded on the client. */
export function useAppReady() {
  const status = useDataStore((s) => s.status);
  const month = useViewStore((s) => s.month);
  return status === "ready" && month !== null;
}
