/**
 * Pure report data for exports (PDF). Built entirely from the calculation
 * selectors, so exported numbers always match what the app shows.
 */
import {
  advancesIntoMonth,
  advancesPaidInMonth,
  groupExpensesByDate,
  loanRepaymentsCountedInMonth,
  monthSummary,
  type DayGroup,
  type MonthSummary,
} from "./calculations";
import { addMonths, monthOf } from "./dates";
import { fromMinor, toMinor } from "./money";
import type { Expense, ISODate, ISOMonth, Loan, LoanTransaction } from "./types";

export type LoanRepaymentLine = {
  date: ISODate;
  person: string;
  amount: number;
  note?: string;
};

export type MonthReport = {
  month: ISOMonth;
  summary: MonthSummary;
  /** Days with expenses, oldest first. */
  days: DayGroup[];
  advancesIn: Expense[];
  advancesOut: Expense[];
  loanRepayments: LoanRepaymentLine[];
};

export type ExpenseReport = {
  from: ISOMonth;
  to: ISOMonth;
  months: MonthReport[];
  /** Sum of every month's grand total. */
  grandTotal: number;
};

type ReportInput = {
  expenses: Expense[];
  loans: Loan[];
  transactions: LoanTransaction[];
  today: ISODate;
};

/** Inclusive list of months; swaps the ends if given in reverse. */
export function monthsBetween(from: ISOMonth, to: ISOMonth): ISOMonth[] {
  const [start, end] = from <= to ? [from, to] : [to, from];
  const months: ISOMonth[] = [];
  for (let m = start; m <= end; m = addMonths(m, 1)) months.push(m);
  return months;
}

export function buildMonthReport(input: ReportInput & { month: ISOMonth }): MonthReport {
  const { expenses, loans, transactions, month } = input;
  const people = new Map(loans.map((l) => [l.id, l.person]));
  return {
    month,
    summary: monthSummary(input),
    days: groupExpensesByDate(expenses, month, { order: "oldest" }),
    advancesIn: advancesIntoMonth(expenses, month),
    advancesOut: advancesPaidInMonth(expenses, month),
    loanRepayments: loanRepaymentsCountedInMonth(loans, transactions, month).map((t) => ({
      date: t.date,
      person: people.get(t.loanId) ?? "Unknown",
      amount: t.amount,
      note: t.note,
    })),
  };
}

export function buildExpenseReport(
  input: ReportInput & { from: ISOMonth; to: ISOMonth },
): ExpenseReport {
  const range = monthsBetween(input.from, input.to);
  const months = range.map((month) => buildMonthReport({ ...input, month }));
  return {
    from: range[0],
    to: range[range.length - 1],
    months,
    grandTotal: fromMinor(months.reduce((acc, m) => acc + toMinor(m.summary.grandTotal), 0)),
  };
}

/** Months that have anything to report, plus `current`, sorted ascending. */
export function reportableMonths(
  expenses: Expense[],
  transactions: LoanTransaction[],
  current: ISOMonth,
): ISOMonth[] {
  let min = current;
  let max = current;
  const visit = (m: ISOMonth) => {
    if (m < min) min = m;
    if (m > max) max = m;
  };
  for (const e of expenses) {
    visit(monthOf(e.date));
    if (e.advanceForMonth) visit(e.advanceForMonth);
  }
  for (const t of transactions) if (t.countAsExpense) visit(monthOf(t.date));
  return monthsBetween(min, max);
}
