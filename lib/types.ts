/** Calendar date in local time, formatted YYYY-MM-DD. */
export type ISODate = string;
/** Calendar month, formatted YYYY-MM. */
export type ISOMonth = string;

export type Expense = {
  id: string;
  /** For advances this is the paid date (when the money actually left). */
  date: ISODate;
  title: string;
  /** Major currency units, rounded to 2 decimals. Sum via lib/money. */
  amount: number;
  category?: string;
  note?: string;
  /** Set only for advances: the month this expense belongs to. */
  advanceForMonth?: ISOMonth;
  createdAt: string;
  updatedAt: string;
};

export type LoanDirection = "borrowed" | "lent";

export type Loan = {
  id: string;
  person: string;
  direction: LoanDirection;
  note?: string;
  createdAt: string;
  /** Date (YYYY-MM-DD) the balance reached zero. Absent while open. */
  settledAt?: ISODate;
};

export type LoanTransactionType = "principal" | "repayment";

export type LoanTransaction = {
  id: string;
  loanId: string;
  date: ISODate;
  /** principal = money borrowed/lent; repayment = money paid back. */
  type: LoanTransactionType;
  amount: number;
  /** Borrowed loans only: include this repayment in the month's spending. */
  countAsExpense?: boolean;
  note?: string;
};

/** Everything the app persists, as one snapshot (used for export/import). */
export type AppData = {
  expenses: Expense[];
  loans: Loan[];
  loanTransactions: LoanTransaction[];
};

export type ExpenseInput = Omit<Expense, "id" | "createdAt" | "updatedAt">;
export type ExpensePatch = Partial<ExpenseInput>;

export type LoanInput = Omit<Loan, "id" | "createdAt">;
export type LoanPatch = Partial<LoanInput>;

export type LoanTransactionInput = Omit<LoanTransaction, "id">;
export type LoanTransactionPatch = Partial<Omit<LoanTransactionInput, "loanId">>;

export type SortOrder = "newest" | "oldest";

/** UI language. Chosen in the app and stored locally; never in the URL. */
export type Locale = "en" | "bn";
