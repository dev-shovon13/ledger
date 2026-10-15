import { describe, expect, it } from "vitest";
import {
  advancesIntoMonth,
  advancesPaidInMonth,
  buildLoanGroups,
  buildPeople,
  categoryTotals,
  filterByCategory,
  foldCategories,
  groupExpensesByDate,
  loanStatementForMonth,
  loanTotals,
  monthSummary,
  monthTotal,
  monthTotals,
  nextSettlement,
  parseQuickAdd,
} from "./calculations";
import { addMonths, daysInMonth } from "./dates";
import { formatMoney, parseAmount, sumMoney } from "./money";
import type { Expense, Loan, LoanTransaction } from "./types";

let seq = 0;
function expense(partial: Partial<Expense> & Pick<Expense, "date" | "amount">): Expense {
  seq += 1;
  const ts = new Date(2026, 0, 1, 0, 0, seq).toISOString();
  return { id: `e${seq}`, title: `Item ${seq}`, createdAt: ts, updatedAt: ts, ...partial };
}

function txn(partial: Partial<LoanTransaction> & Pick<LoanTransaction, "date" | "amount" | "type">): LoanTransaction {
  seq += 1;
  return { id: `t${seq}`, loanId: "L1", ...partial };
}

const loan = (partial: Partial<Loan> = {}): Loan => ({
  id: "L1",
  person: "Rahim",
  direction: "borrowed",
  createdAt: "2026-10-01T00:00:00.000Z",
  ...partial,
});

describe("daily expenses", () => {
  const expenses = [
    expense({ date: "2026-10-15", title: "Bus", amount: 20 }),
    expense({ date: "2026-10-15", title: "Rickshaw", amount: 30 }),
    expense({ date: "2026-10-15", title: "Snacks", amount: 50 }),
    expense({ date: "2026-10-16", title: "Lunch", amount: 110 }),
    expense({ date: "2026-11-01", title: "Other month", amount: 999 }),
  ];

  it("sums a date and the month (acceptance: 20 + 30 + 50 = 100)", () => {
    const groups = groupExpensesByDate(expenses, "2026-10");
    expect(groups.map((g) => [g.date, g.total])).toEqual([
      ["2026-10-16", 110],
      ["2026-10-15", 100],
    ]);
    expect(monthTotal(expenses, "2026-10")).toBe(210);
  });

  it("supports oldest-first ordering and keeps entry order within a day", () => {
    const groups = groupExpensesByDate(expenses, "2026-10", { order: "oldest" });
    expect(groups[0].date).toBe("2026-10-15");
    expect(groups[0].expenses.map((e) => e.title)).toEqual(["Bus", "Rickshaw", "Snacks"]);
  });

  it("includes empty extra dates of the month only", () => {
    const groups = groupExpensesByDate([], "2026-10", {
      extraDates: ["2026-10-20", "2026-09-30"],
    });
    expect(groups).toEqual([{ date: "2026-10-20", expenses: [], total: 0 }]);
  });

  it("avoids floating point drift", () => {
    const list = [
      expense({ date: "2026-10-01", amount: 0.1 }),
      expense({ date: "2026-10-01", amount: 0.2 }),
    ];
    expect(groupExpensesByDate(list, "2026-10")[0].total).toBe(0.3);
    expect(sumMoney([0.1, 0.2, 0.3])).toBe(0.6);
  });
});

describe("advances", () => {
  const rent = expense({
    date: "2026-10-25",
    title: "November rent",
    amount: 15000,
    advanceForMonth: "2026-11",
  });
  const daily = expense({ date: "2026-10-25", amount: 100 });
  const expenses = [rent, daily];

  it("counts in the target month, not the paid month (acceptance)", () => {
    expect(monthTotal(expenses, "2026-10")).toBe(100);
    expect(monthTotal(expenses, "2026-11")).toBe(15000);
  });

  it("appears in both months in the right section", () => {
    expect(advancesPaidInMonth(expenses, "2026-10")).toEqual([rent]);
    expect(advancesIntoMonth(expenses, "2026-10")).toEqual([]);
    expect(advancesIntoMonth(expenses, "2026-11")).toEqual([rent]);
    expect(advancesPaidInMonth(expenses, "2026-11")).toEqual([]);
    // Not listed under the paid date's day group.
    expect(groupExpensesByDate(expenses, "2026-10")[0].expenses).toEqual([daily]);
  });

  it("reports advances in the month summary", () => {
    const base = { loans: [], transactions: [], today: "2026-10-31" };
    const oct = monthSummary({ ...base, expenses, month: "2026-10" });
    expect(oct).toMatchObject({ dailySubtotal: 100, advancesOut: 15000, advancesIn: 0, grandTotal: 100 });
    const nov = monthSummary({ ...base, expenses, month: "2026-11" });
    expect(nov).toMatchObject({ dailySubtotal: 0, advancesIn: 15000, grandTotal: 15000 });
  });
});

describe("loans", () => {
  const txns = [
    txn({ date: "2026-10-01", type: "principal", amount: 1000 }),
    txn({ date: "2026-10-20", type: "repayment", amount: 300 }),
  ];

  it("carries closing balance forward (acceptance: 1000 − 300)", () => {
    const oct = loanStatementForMonth(txns, "2026-10");
    expect(oct).toEqual({ opening: 0, added: 1000, repaid: 300, closing: 700 });
    const nov = loanStatementForMonth(txns, "2026-11");
    expect(nov.opening).toBe(700);
    expect(nov.closing).toBe(700);
  });

  it("closing of every month equals opening of the next", () => {
    const history = [
      ...txns,
      txn({ date: "2026-11-05", type: "repayment", amount: 200 }),
      txn({ date: "2026-12-10", type: "principal", amount: 50.5 }),
    ];
    let month = "2026-09";
    for (let i = 0; i < 5; i++) {
      const next = addMonths(month, 1);
      expect(loanStatementForMonth(history, next).opening).toBe(
        loanStatementForMonth(history, month).closing,
      );
      month = next;
    }
  });

  it("totals and net position as of a month", () => {
    const loans = [
      loan(),
      loan({ id: "L2", person: "Karim", direction: "lent" }),
    ];
    const all = [
      ...txns,
      txn({ loanId: "L2", date: "2026-09-10", type: "principal", amount: 500 }),
    ];
    expect(loanTotals(loans, all, "2026-10")).toEqual({ iOwe: 700, owedToMe: 500, net: -200 });
    expect(loanTotals(loans, all, "2026-09")).toEqual({ iOwe: 0, owedToMe: 500, net: 500 });
  });

  it("settles at zero and reopens when balance returns", () => {
    const paidOff = [...txns, txn({ date: "2026-11-02", type: "repayment", amount: 700 })];
    expect(nextSettlement(loan(), paidOff)).toEqual({ settledAt: "2026-11-02" });
    expect(nextSettlement(loan({ settledAt: "2026-11-02" }), paidOff)).toBeUndefined();
    expect(nextSettlement(loan({ settledAt: "2026-11-02" }), txns)).toEqual({ settledAt: undefined });
  });

  it("groups loans by status as of the month and hides future loans", () => {
    const settled = loan({ settledAt: "2026-11-02" });
    const groups = (m: string) => buildLoanGroups([settled], txns, m).borrowed;
    expect(groups("2026-09")).toEqual({ active: [], settled: [] });
    expect(groups("2026-10").active).toHaveLength(1);
    expect(groups("2026-11").settled).toHaveLength(1);
  });

  it("counts flagged repayments of borrowed loans as spending", () => {
    const loans = [loan(), loan({ id: "L2", direction: "lent" })];
    const all = [
      txn({ date: "2026-10-01", type: "principal", amount: 1000 }),
      txn({ date: "2026-10-20", type: "repayment", amount: 300, countAsExpense: true }),
      txn({ loanId: "L2", date: "2026-10-01", type: "principal", amount: 100 }),
      txn({ loanId: "L2", date: "2026-10-21", type: "repayment", amount: 100, countAsExpense: true }),
    ];
    const s = monthSummary({ expenses: [], loans, transactions: all, month: "2026-10", today: "2026-10-31" });
    expect(s.loanRepayments).toBe(300);
    expect(s.grandTotal).toBe(300);
  });
});

describe("month summary", () => {
  it("averages over elapsed days of the current month and finds the top day", () => {
    const expenses = [
      expense({ date: "2026-10-01", amount: 100 }),
      expense({ date: "2026-10-05", amount: 400 }),
    ];
    const s = monthSummary({ expenses, loans: [], transactions: [], month: "2026-10", today: "2026-10-10" });
    expect(s.daysCounted).toBe(10);
    expect(s.averagePerDay).toBe(50);
    expect(s.highestDay).toEqual({ date: "2026-10-05", total: 400 });

    const past = monthSummary({ expenses, loans: [], transactions: [], month: "2026-10", today: "2026-12-01" });
    expect(past.daysCounted).toBe(daysInMonth("2026-10"));
  });
});

describe("quick add", () => {
  it.each([
    ["bus 20", { title: "Bus", amount: 20 }],
    ["bus-20", { title: "Bus", amount: 20 }],
    ["bus20", { title: "Bus", amount: 20 }],
    ["Bus fare 20.50", { title: "Bus fare", amount: 20.5 }],
    ["  rickshaw   30 ", { title: "Rickshaw", amount: 30 }],
    ["20 snacks", { title: "Snacks", amount: 20 }],
    ["rent 1,500", { title: "Rent", amount: 1500 }],
    ["item2 30", { title: "Item2", amount: 30 }],
    ["7-eleven 45", { title: "7-eleven", amount: 45 }],
    ["বাস ২০", { title: "বাস", amount: 20 }],
    ["রিক্সা-৩০", { title: "রিক্সা", amount: 30 }],
    ["চা 15.50", { title: "চা", amount: 15.5 }],
  ])("parses %j", (input, expected) => {
    expect(parseQuickAdd(input)).toEqual(expected);
  });

  it.each(["bus", "20", "", "bus 0", "bus -", "- 20"])("rejects %j", (input) => {
    expect(parseQuickAdd(input)).toBeNull();
  });
});

describe("money", () => {
  it("parses and formats amounts", () => {
    expect(parseAmount("1,250.5")).toBe(1250.5);
    expect(parseAmount("0")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("1.234")).toBeNull();
    expect(formatMoney(100000, "৳")).toBe("৳1,00,000");
    expect(formatMoney(20.5, "৳")).toBe("৳20.50");
    expect(formatMoney(-200, "৳")).toBe("−৳200");
    expect(parseAmount("১,২৫০.৫")).toBe(1250.5);
    expect(formatMoney(100000, "৳", { locale: "bn" })).toBe("৳১,০০,০০০");
    expect(formatMoney(20.5, "৳", { locale: "bn" })).toBe("৳২০.৫০");
  });
});

describe("report", async () => {
  const { buildExpenseReport, monthsBetween, reportableMonths } = await import("./report");
  const expenses = [
    expense({ date: "2026-10-15", title: "Bus", amount: 20 }),
    expense({ date: "2026-10-16", title: "Snacks", amount: 50.5 }),
    expense({ date: "2026-10-25", title: "Rent", amount: 15000, advanceForMonth: "2026-11" }),
  ];

  it("lists months inclusively in either order", () => {
    expect(monthsBetween("2026-11", "2027-01")).toEqual(["2026-11", "2026-12", "2027-01"]);
    expect(monthsBetween("2027-01", "2026-11")).toEqual(["2026-11", "2026-12", "2027-01"]);
  });

  it("matches the month totals the app shows", () => {
    const r = buildExpenseReport({ expenses, loans: [], transactions: [], today: "2026-11-30", from: "2026-10", to: "2026-11" });
    expect(r.months.map((m) => m.summary.grandTotal)).toEqual([70.5, 15000]);
    expect(r.grandTotal).toBe(15070.5);
    expect(r.months[0].days.map((d) => d.date)).toEqual(["2026-10-15", "2026-10-16"]);
    expect(r.months[0].advancesOut).toHaveLength(1);
    expect(r.months[1].advancesIn).toHaveLength(1);
  });

  it("offers months that have data", () => {
    expect(reportableMonths(expenses, [], "2026-09")).toEqual(["2026-09", "2026-10", "2026-11"]);
  });
});

describe("month list", () => {
  const loans = [loan()];
  const expenses = [
    expense({ date: "2026-10-15", amount: 20 }),
    expense({ date: "2026-10-16", amount: 0.1 }),
    expense({ date: "2026-10-16", amount: 0.2 }),
    expense({ date: "2026-10-25", amount: 15000, advanceForMonth: "2026-11" }),
    expense({ date: "2025-12-01", amount: 99 }),
  ];
  const transactions = [
    txn({ date: "2026-09-01", type: "principal", amount: 1000 }),
    txn({ date: "2026-09-20", type: "repayment", amount: 300, countAsExpense: true }),
  ];

  it("totals every month with data, newest first, matching monthTotal", () => {
    const list = monthTotals(expenses, loans, transactions, ["2027-01"]);
    expect(list).toEqual([
      { month: "2027-01", total: 0 },
      { month: "2026-11", total: 15000 },
      { month: "2026-10", total: 20.3 },
      { month: "2026-09", total: 300 },
      { month: "2025-12", total: 99 },
    ]);
    for (const { month, total } of list) {
      expect(total).toBe(monthTotal(expenses, month, loans, transactions));
    }
  });
});

describe("categories", () => {
  const expenses = [
    expense({ date: "2026-10-01", amount: 20, category: "Food" }),
    expense({ date: "2026-10-02", amount: 30.5, category: " food " }),
    expense({ date: "2026-10-02", amount: 100, category: "Transport" }),
    expense({ date: "2026-10-03", amount: 5 }),
    expense({ date: "2026-09-28", amount: 1200, category: "Bills", advanceForMonth: "2026-10" }),
    expense({ date: "2026-10-25", amount: 9999, category: "Rent", advanceForMonth: "2026-11" }),
  ];

  it("totals counted spending per category, merging case and spaces", () => {
    expect(categoryTotals(expenses, "2026-10")).toEqual([
      { key: "bills", label: "Bills", total: 1200, count: 1 },
      { key: "transport", label: "Transport", total: 100, count: 1 },
      { key: "food", label: "Food", total: 50.5, count: 2 },
      { key: "", label: null, total: 5, count: 1 },
    ]);
  });

  it("folds the tail into other", () => {
    const { shown, other } = foldCategories(categoryTotals(expenses, "2026-10"), 3);
    expect(shown.map((c) => c.key)).toEqual(["bills", "transport"]);
    expect(other).toEqual({ total: 55.5, count: 3 });
    expect(foldCategories(categoryTotals(expenses, "2026-10"), 4).other).toBeUndefined();
  });

  it("filters by category key", () => {
    expect(filterByCategory(expenses, "food")).toHaveLength(2);
    expect(filterByCategory(expenses, "")).toHaveLength(1);
    expect(filterByCategory(expenses, null)).toHaveLength(6);
  });
});

describe("date formatting", async () => {
  const { formatDate, formatDayMonth, formatMonthShort, formatMonthName } = await import("./dates");

  it("spells Bangla months out in full; English keeps abbreviations", () => {
    expect(formatDate("2026-10-15", "bn")).toBe("১৫ অক্টোবর, ২০২৬");
    expect(formatDayMonth("2026-09-28", "bn")).toBe("২৮ সেপ্টেম্বর");
    expect(formatMonthShort("2026-11", "bn")).toBe("নভেম্বর ২০২৬");
    expect(formatMonthName("2026-10", "bn", "short")).toBe("অক্টোবর");
    expect(formatDate("2026-10-15", "en")).toBe("15 Oct 2026");
  });
});

describe("people", () => {
  const loans: Loan[] = [
    loan({ id: "A", person: "Rahim", direction: "borrowed" }),
    loan({ id: "B", person: " rahim ", direction: "lent" }),
    loan({ id: "C", person: "Karim", direction: "lent" }),
    loan({ id: "D", person: "Sumi", direction: "borrowed", settledAt: "2026-09-20" }),
    loan({ id: "E", person: "Later", direction: "lent" }),
  ];
  const transactions = [
    txn({ loanId: "A", date: "2026-10-01", type: "principal", amount: 1000 }),
    txn({ loanId: "A", date: "2026-10-20", type: "repayment", amount: 300 }),
    txn({ loanId: "B", date: "2026-09-05", type: "principal", amount: 200 }),
    txn({ loanId: "C", date: "2026-09-10", type: "principal", amount: 500 }),
    txn({ loanId: "D", date: "2026-08-10", type: "principal", amount: 2000 }),
    txn({ loanId: "D", date: "2026-09-20", type: "repayment", amount: 2000 }),
    txn({ loanId: "E", date: "2026-12-01", type: "principal", amount: 50 }),
  ];

  it("merges a person's loans in both directions and nets them", () => {
    const people = buildPeople(loans, transactions, "2026-10");
    expect(people.map((p) => [p.name, p.owe, p.owed, p.net, p.settled])).toEqual([
      ["Karim", 0, 500, 500, false],
      ["Rahim", 700, 200, -500, false],
      ["Sumi", 0, 0, 0, true],
    ]);
    const rahim = people.find((p) => p.key === "rahim")!;
    expect(rahim.loans).toHaveLength(2);
    // A capitalized spelling wins over " rahim ", even though that loan is older.
    expect(rahim.name).toBe("Rahim");
    expect(rahim).toMatchObject({ paidBack: 300, borrowed: 1000, received: 0, lent: 0 });
  });

  it("leaves out loans that start after the month", () => {
    expect(buildPeople(loans, transactions, "2026-10").some((p) => p.name === "Later")).toBe(false);
    expect(buildPeople(loans, transactions, "2026-12").some((p) => p.name === "Later")).toBe(true);
  });
});
