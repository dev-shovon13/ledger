/**
 * Pure selectors. Every derived number in the UI (date sums, month totals,
 * loan opening/closing balances) is computed here from raw records and never
 * stored, so there is nothing to keep in sync.
 */
import { daysInMonth, firstDayOf, monthOf } from "./dates";
import { fromMinor, normalizeDigits, parseAmount, toMinor } from "./money";
import type {
  Expense,
  ISODate,
  ISOMonth,
  Loan,
  LoanDirection,
  LoanTransaction,
  SortOrder,
} from "./types";

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

export type DayGroup = {
  date: ISODate;
  expenses: Expense[];
  total: number;
};

const sumMinor = (items: { amount: number }[]) =>
  items.reduce((acc, i) => acc + toMinor(i.amount), 0);

const byCreated = (a: Expense, b: Expense) =>
  a.createdAt.localeCompare(b.createdAt);

/** An advance is paid in one month but belongs to a different (later) one. */
export function isAdvance(e: Expense): boolean {
  return !!e.advanceForMonth && e.advanceForMonth !== monthOf(e.date);
}

/** The month whose spending total this expense counts towards. */
export function budgetMonthOf(e: Expense): ISOMonth {
  return isAdvance(e) ? e.advanceForMonth! : monthOf(e.date);
}

/** Regular (non-advance) expenses dated in `month`. */
export function dailyExpensesInMonth(expenses: Expense[], month: ISOMonth) {
  return expenses.filter((e) => !isAdvance(e) && monthOf(e.date) === month);
}

/** Advances paid earlier that belong to `month` ("Paid in advance"). */
export function advancesIntoMonth(expenses: Expense[], month: ISOMonth) {
  return expenses
    .filter((e) => isAdvance(e) && e.advanceForMonth === month)
    .sort((a, b) => a.date.localeCompare(b.date) || byCreated(a, b));
}

/** Advances paid during `month` for another month (cash out, not spending). */
export function advancesPaidInMonth(expenses: Expense[], month: ISOMonth) {
  return expenses
    .filter((e) => isAdvance(e) && monthOf(e.date) === month)
    .sort((a, b) => a.date.localeCompare(b.date) || byCreated(a, b));
}

/**
 * Daily expenses of `month` grouped per date. `extraDates` are dates the user
 * added that may have no expenses yet; they appear as empty groups.
 */
export function groupExpensesByDate(
  expenses: Expense[],
  month: ISOMonth,
  opts: { extraDates?: ISODate[]; order?: SortOrder } = {},
): DayGroup[] {
  const map = new Map<ISODate, Expense[]>();
  for (const date of opts.extraDates ?? []) {
    if (monthOf(date) === month) map.set(date, []);
  }
  for (const e of dailyExpensesInMonth(expenses, month)) {
    const list = map.get(e.date);
    if (list) list.push(e);
    else map.set(e.date, [e]);
  }
  const dir = opts.order === "oldest" ? 1 : -1;
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b) * dir)
    .map(([date, list]) => ({
      date,
      expenses: list.sort(byCreated),
      total: fromMinor(sumMinor(list)),
    }));
}

export function dateTotal(expenses: Expense[], date: ISODate): number {
  return fromMinor(
    sumMinor(expenses.filter((e) => !isAdvance(e) && e.date === date)),
  );
}

// ---------------------------------------------------------------------------
// Loans
// ---------------------------------------------------------------------------

export type LoanStatement = {
  /** Balance carried in from all previous months. */
  opening: number;
  /** Extra borrowing/lending recorded this month (incl. the original). */
  added: number;
  /** Repaid (borrowed) or received back (lent) this month. */
  repaid: number;
  /** opening + added − repaid; becomes next month's opening. */
  closing: number;
};

const signedMinor = (t: LoanTransaction) =>
  t.type === "principal" ? toMinor(t.amount) : -toMinor(t.amount);

export function transactionsForLoan(
  transactions: LoanTransaction[],
  loanId: string,
): LoanTransaction[] {
  return transactions
    .filter((t) => t.loanId === loanId)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        // principal before repayment on the same day
        (a.type === b.type ? 0 : a.type === "principal" ? -1 : 1),
    );
}

/** Outstanding balance including every transaction on or before `date`. */
export function loanBalanceAsOf(
  loanTransactions: LoanTransaction[],
  date: ISODate,
): number {
  return fromMinor(
    loanTransactions
      .filter((t) => t.date <= date)
      .reduce((acc, t) => acc + signedMinor(t), 0),
  );
}

/** Outstanding balance across all recorded history. */
export function loanBalance(loanTransactions: LoanTransaction[]): number {
  return fromMinor(loanTransactions.reduce((acc, t) => acc + signedMinor(t), 0));
}

/**
 * Month view of one loan. Opening is derived from history before the month,
 * so closing(Oct) === opening(Nov) by construction.
 */
export function loanStatementForMonth(
  loanTransactions: LoanTransaction[],
  month: ISOMonth,
): LoanStatement {
  let opening = 0;
  let added = 0;
  let repaid = 0;
  const start = firstDayOf(month);
  for (const t of loanTransactions) {
    if (t.date < start) opening += signedMinor(t);
    else if (monthOf(t.date) === month) {
      if (t.type === "principal") added += toMinor(t.amount);
      else repaid += toMinor(t.amount);
    }
  }
  return {
    opening: fromMinor(opening),
    added: fromMinor(added),
    repaid: fromMinor(repaid),
    closing: fromMinor(opening + added - repaid),
  };
}

export function loanStartDate(
  loanTransactions: LoanTransaction[],
): ISODate | undefined {
  let min: ISODate | undefined;
  for (const t of loanTransactions) {
    if (t.type === "principal" && (!min || t.date < min)) min = t.date;
  }
  return min;
}

/** Whether the loan had been settled by the end of `month`. */
export function isSettledBy(loan: Loan, month: ISOMonth): boolean {
  return !!loan.settledAt && monthOf(loan.settledAt) <= month;
}

/**
 * What `settledAt` should be after the loan's transactions change, or
 * `undefined` for "leave as is". A loan settles on the date its balance
 * reaches zero, and reopens automatically if the balance goes positive again.
 */
export function nextSettlement(
  loan: Loan,
  loanTransactions: LoanTransaction[],
): { settledAt: ISODate | undefined } | undefined {
  const balance = toMinor(loanBalance(loanTransactions));
  if (balance > 0 && loan.settledAt) return { settledAt: undefined };
  if (balance <= 0 && !loan.settledAt && loanTransactions.length > 0) {
    const last = loanTransactions.reduce((max, t) =>
      t.date > max.date ? t : max,
    );
    return { settledAt: last.date };
  }
  return undefined;
}

export type LoanView = {
  loan: Loan;
  transactions: LoanTransaction[];
  monthTransactions: LoanTransaction[];
  statement: LoanStatement;
  startDate?: ISODate;
  settled: boolean;
};

export type LoanGroups = Record<
  LoanDirection,
  { active: LoanView[]; settled: LoanView[] }
>;

/** Loans that exist by the end of `month`, split by direction and status. */
export function buildLoanGroups(
  loans: Loan[],
  transactions: LoanTransaction[],
  month: ISOMonth,
): LoanGroups {
  const groups: LoanGroups = {
    borrowed: { active: [], settled: [] },
    lent: { active: [], settled: [] },
  };
  for (const loan of loans) {
    const txns = transactionsForLoan(transactions, loan.id);
    const startDate = loanStartDate(txns);
    if (!startDate || monthOf(startDate) > month) continue;
    const view: LoanView = {
      loan,
      transactions: txns,
      monthTransactions: txns.filter((t) => monthOf(t.date) === month),
      statement: loanStatementForMonth(txns, month),
      startDate,
      settled: isSettledBy(loan, month),
    };
    groups[loan.direction][view.settled ? "settled" : "active"].push(view);
  }
  const byPerson = (a: LoanView, b: LoanView) =>
    a.loan.person.localeCompare(b.loan.person);
  for (const dir of ["borrowed", "lent"] as const) {
    groups[dir].active.sort(
      (a, b) => b.statement.closing - a.statement.closing || byPerson(a, b),
    );
    groups[dir].settled.sort(
      (a, b) =>
        (b.loan.settledAt ?? "").localeCompare(a.loan.settledAt ?? "") ||
        byPerson(a, b),
    );
  }
  return groups;
}

export type LoanTotals = { iOwe: number; owedToMe: number; net: number };

/** Balances as of the end of `month`. net > 0 means others owe you more. */
export function loanTotals(
  loans: Loan[],
  transactions: LoanTransaction[],
  month: ISOMonth,
): LoanTotals {
  const direction = new Map(loans.map((l) => [l.id, l.direction]));
  let iOwe = 0;
  let owedToMe = 0;
  const end = `${month}-31`;
  for (const t of transactions) {
    if (t.date > end) continue;
    const dir = direction.get(t.loanId);
    if (dir === "borrowed") iOwe += signedMinor(t);
    else if (dir === "lent") owedToMe += signedMinor(t);
  }
  return {
    iOwe: fromMinor(iOwe),
    owedToMe: fromMinor(owedToMe),
    net: fromMinor(owedToMe - iOwe),
  };
}

/**
 * Repayments of borrowed money the user chose to count as spending, in
 * `month` (or in every month when omitted).
 */
export function loanRepaymentsCountedInMonth(
  loans: Loan[],
  transactions: LoanTransaction[],
  month?: ISOMonth,
): LoanTransaction[] {
  const borrowed = new Set(
    loans.filter((l) => l.direction === "borrowed").map((l) => l.id),
  );
  return transactions
    .filter(
      (t) =>
        t.type === "repayment" &&
        t.countAsExpense &&
        borrowed.has(t.loanId) &&
        (month === undefined || monthOf(t.date) === month),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------------------------------------------------------------------
// Month summary
// ---------------------------------------------------------------------------

export type MonthSummary = {
  /** Regular daily expenses dated in the month. */
  dailySubtotal: number;
  /** Advances paid earlier that belong to this month. */
  advancesIn: number;
  /** Advances paid this month for other months (excluded from total). */
  advancesOut: number;
  /** Loan repayments flagged "count as expense". */
  loanRepayments: number;
  /** dailySubtotal + advancesIn + loanRepayments */
  grandTotal: number;
  /** Days used for the average: elapsed days for the current month. */
  daysCounted: number;
  /** dailySubtotal / daysCounted */
  averagePerDay: number;
  highestDay?: { date: ISODate; total: number };
};

export function daysCountedIn(month: ISOMonth, today: ISODate): number {
  return monthOf(today) === month ? Number(today.slice(8, 10)) : daysInMonth(month);
}

export function monthSummary(input: {
  expenses: Expense[];
  loans: Loan[];
  transactions: LoanTransaction[];
  month: ISOMonth;
  today: ISODate;
}): MonthSummary {
  const { expenses, loans, transactions, month, today } = input;
  const daily = dailyExpensesInMonth(expenses, month);
  const dailyMinor = sumMinor(daily);
  const advancesInMinor = sumMinor(advancesIntoMonth(expenses, month));
  const advancesOutMinor = sumMinor(advancesPaidInMonth(expenses, month));
  const loanMinor = sumMinor(
    loanRepaymentsCountedInMonth(loans, transactions, month),
  );

  let highestDay: MonthSummary["highestDay"];
  for (const g of groupExpensesByDate(expenses, month)) {
    if (g.total > 0 && (!highestDay || g.total > highestDay.total)) {
      highestDay = { date: g.date, total: g.total };
    }
  }

  const daysCounted = daysCountedIn(month, today);
  return {
    dailySubtotal: fromMinor(dailyMinor),
    advancesIn: fromMinor(advancesInMinor),
    advancesOut: fromMinor(advancesOutMinor),
    loanRepayments: fromMinor(loanMinor),
    grandTotal: fromMinor(dailyMinor + advancesInMinor + loanMinor),
    daysCounted,
    averagePerDay: fromMinor(Math.round(dailyMinor / daysCounted)),
    highestDay,
  };
}

/** Month header total: everything that counts as this month's spending. */
export function monthTotal(
  expenses: Expense[],
  month: ISOMonth,
  loans: Loan[] = [],
  transactions: LoanTransaction[] = [],
): number {
  return fromMinor(
    sumMinor(dailyExpensesInMonth(expenses, month)) +
      sumMinor(advancesIntoMonth(expenses, month)) +
      sumMinor(loanRepaymentsCountedInMonth(loans, transactions, month)),
  );
}

// ---------------------------------------------------------------------------
// Quick add
// ---------------------------------------------------------------------------

/**
 * Parse "bus 20", "bus-20", "Bus fare 20.50", "bus20", "20 bus" or
 * "বাস ২০" into a title and amount. Returns null when no positive amount can be found.
 */
export function parseQuickAdd(
  input: string,
): { title: string; amount: number } | null {
  const text = normalizeDigits(input).trim().replace(/\s+/g, " ");
  if (!text) return null;

  const trailing = text.match(/^(.*?[^\s\-:=])[\s\-:=]*(\d[\d,]*(?:\.\d{1,2})?)$/);
  const leading = text.match(/^(\d[\d,]*(?:\.\d{1,2})?)[\s\-:=]+(.+)$/);

  let title: string | undefined;
  let raw: string | undefined;
  if (trailing) [, title, raw] = trailing;
  else if (leading) [, raw, title] = leading;
  if (!title || !raw) return null;

  title = title.trim();
  // A title of only digits/punctuation is not a title.
  if (!/[\p{L}]/u.test(title)) return null;

  const amount = parseAmount(raw);
  if (amount === null) return null;
  return { title: title.charAt(0).toUpperCase() + title.slice(1), amount };
}

// ---------------------------------------------------------------------------
// Month list
// ---------------------------------------------------------------------------

export type MonthTotal = { month: ISOMonth; total: number };

/**
 * Spending total for every month that has data (same rules as `monthTotal`),
 * plus any `include`d months, newest first.
 */
export function monthTotals(
  expenses: Expense[],
  loans: Loan[],
  transactions: LoanTransaction[],
  include: ISOMonth[] = [],
): MonthTotal[] {
  const totals = new Map<ISOMonth, number>(include.map((m) => [m, 0]));
  const add = (month: ISOMonth, minor: number) =>
    totals.set(month, (totals.get(month) ?? 0) + minor);

  for (const e of expenses) {
    add(budgetMonthOf(e), toMinor(e.amount));
    // An advance's paid month has cash out, so list it even if its total is 0.
    if (isAdvance(e)) add(monthOf(e.date), 0);
  }
  for (const t of loanRepaymentsCountedInMonth(loans, transactions)) {
    add(monthOf(t.date), toMinor(t.amount));
  }

  return [...totals.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, minor]) => ({ month, total: fromMinor(minor) }));
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

/** Case- and space-insensitive identity; "" means uncategorized. */
export function categoryKey(category?: string): string {
  return (category ?? "").trim().toLocaleLowerCase();
}

export type CategoryTotal = {
  key: string;
  /** Display name as first entered; null when uncategorized. */
  label: string | null;
  total: number;
  count: number;
};

/**
 * Expense spending that counts in `month` (daily expenses plus advances
 * belonging to it), per category, largest first.
 */
export function categoryTotals(expenses: Expense[], month: ISOMonth): CategoryTotal[] {
  const map = new Map<string, { label: string | null; minor: number; count: number }>();
  const counted = [...dailyExpensesInMonth(expenses, month), ...advancesIntoMonth(expenses, month)];
  for (const e of [...counted].sort(byCreated)) {
    const key = categoryKey(e.category);
    const entry = map.get(key) ?? { label: key ? e.category!.trim() : null, minor: 0, count: 0 };
    entry.minor += toMinor(e.amount);
    entry.count += 1;
    map.set(key, entry);
  }
  return [...map.entries()]
    .map(([key, v]) => ({ key, label: v.label, total: fromMinor(v.minor), count: v.count }))
    .sort((a, b) => b.total - a.total || (a.label ?? "").localeCompare(b.label ?? ""));
}

/** Keeps the largest `max` categories and folds the rest into one "other" entry. */
export function foldCategories(
  list: CategoryTotal[],
  max: number,
): { shown: CategoryTotal[]; other?: { total: number; count: number } } {
  if (list.length <= max) return { shown: list };
  const rest = list.slice(max - 1);
  return {
    shown: list.slice(0, max - 1),
    other: {
      total: fromMinor(rest.reduce((acc, c) => acc + toMinor(c.total), 0)),
      count: rest.reduce((acc, c) => acc + c.count, 0),
    },
  };
}

/** Expenses in category `key` ("" = uncategorized); all when key is null. */
export function filterByCategory(expenses: Expense[], key: string | null): Expense[] {
  return key === null ? expenses : expenses.filter((e) => categoryKey(e.category) === key);
}

// ---------------------------------------------------------------------------
// People (loans grouped by who they are with)
// ---------------------------------------------------------------------------

/** Case- and space-insensitive identity for a person's name. */
export function personKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export type PersonView = {
  key: string;
  /** Display name: a capitalized spelling if any loan has one, else the earliest. */
  name: string;
  /** Their loans that exist by the end of the month; active first. */
  loans: LoanView[];
  /** What you owe them / they owe you, at the end of the month. */
  owe: number;
  owed: number;
  /** owed − owe: positive means they owe you overall. */
  net: number;
  /** Movement during the month. */
  paidBack: number;
  received: number;
  borrowed: number;
  lent: number;
  /** Every loan with them is settled by the end of the month. */
  settled: boolean;
};

/**
 * Picks how to show a person whose loans spell the name differently
 * ("Rahim", " rahim "): the earliest capitalized spelling, else the earliest.
 * Scripts without letter case (Bangla) simply get the earliest.
 */
function displayName(entries: { name: string; date: string }[]): string {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const isCapitalized = (s: string) => {
    const c = s.charAt(0);
    return c !== c.toLocaleLowerCase() && c === c.toLocaleUpperCase();
  };
  const pick = sorted.find((e) => isCapitalized(e.name.trim())) ?? sorted[0];
  return pick.name.trim().replace(/\s+/g, " ");
}

/**
 * Loans grouped by person for `month`. Active people come first (largest
 * net balance first), then settled ones.
 */
export function buildPeople(
  loans: Loan[],
  transactions: LoanTransaction[],
  month: ISOMonth,
): PersonView[] {
  const groups = buildLoanGroups(loans, transactions, month);
  const views = [
    ...groups.borrowed.active,
    ...groups.lent.active,
    ...groups.borrowed.settled,
    ...groups.lent.settled,
  ];
  const map = new Map<string, LoanView[]>();
  for (const v of views) {
    const key = personKey(v.loan.person);
    map.set(key, [...(map.get(key) ?? []), v]);
  }

  const people: PersonView[] = [];
  for (const [key, list] of map) {
    let owe = 0, owed = 0, paidBack = 0, received = 0, borrowed = 0, lent = 0;
    for (const v of list) {
      const s = v.statement;
      if (v.loan.direction === "borrowed") {
        owe += toMinor(s.closing);
        paidBack += toMinor(s.repaid);
        borrowed += toMinor(s.added);
      } else {
        owed += toMinor(s.closing);
        received += toMinor(s.repaid);
        lent += toMinor(s.added);
      }
    }
    const name = displayName(list.map((v) => ({ name: v.loan.person, date: v.startDate ?? "" })));
    people.push({
      key,
      name,
      loans: list,
      owe: fromMinor(owe),
      owed: fromMinor(owed),
      net: fromMinor(owed - owe),
      paidBack: fromMinor(paidBack),
      received: fromMinor(received),
      borrowed: fromMinor(borrowed),
      lent: fromMinor(lent),
      settled: list.every((v) => v.settled),
    });
  }

  return people.sort(
    (a, b) =>
      Number(a.settled) - Number(b.settled) ||
      Math.abs(b.net) - Math.abs(a.net) ||
      a.name.localeCompare(b.name),
  );
}
