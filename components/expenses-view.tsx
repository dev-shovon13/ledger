"use client";

import {
  ArrowDownWideNarrowIcon,
  ArrowUpNarrowWideIcon,
  CalendarClockIcon,
  CalendarPlusIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  FileDownIcon,
  FilterIcon,
  MinusIcon,
  PlusIcon,
  ReceiptTextIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  XIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useCalendarLocale } from "@/components/date-picker";
import { DayGroup } from "@/components/day-group";
import { EmptyState } from "@/components/empty-state";
import { ExpenseFormDialog } from "@/components/expense-form";
import { ExpenseRow } from "@/components/expense-row";
import { ExportPdfDialog } from "@/components/export-pdf-dialog";
import { MonthList } from "@/components/month-list";
import { MonthSummary } from "@/components/month-summary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  advancesIntoMonth,
  advancesPaidInMonth,
  categoryTotals,
  dailyExpensesInMonth,
  filterByCategory,
  groupExpensesByDate,
  monthSummary,
  monthTotal,
  type CategoryTotal,
} from "@/lib/calculations";
import { addMonths, defaultDateFor, monthOf, parseISODate, toISODate } from "@/lib/dates";
import { useI18n } from "@/lib/i18n";
import { subtractMoney, sumMoney } from "@/lib/money";
import { useDataStore, usePrefsStore, useViewStore } from "@/lib/store";
import type { Expense, ISODate } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ExpensesView() {
  const { t, f } = useI18n();
  const te = t.expenses;
  const month = useViewStore((s) => s.month)!;
  const today = useViewStore((s) => s.today)!;
  const expenses = useDataStore((s) => s.expenses);
  const loans = useDataStore((s) => s.loans);
  const transactions = useDataStore((s) => s.transactions);
  const sortOrder = usePrefsStore((s) => s.sortOrder);
  const setSortOrder = usePrefsStore((s) => s.setSortOrder);
  const extraDates = usePrefsStore((s) => s.extraDates);
  const [formOpen, setFormOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  // The filter belongs to the month it was chosen in; switching months clears it.
  const [filter, setFilter] = useState<{ month: string; key: string } | null>(null);
  const activeCategory = filter?.month === month ? filter.key : null;
  const selectCategory = (key: string | null) => setFilter(key === null ? null : { month, key });

  // Accordion state: explicit choices per date, otherwise the defaults below.
  // Choices are kept per filter, so filtering always shows its matches open.
  const [openDays, setOpenDays] = useState<Record<string, boolean>>({});
  const dayKey = (date: string) => `${activeCategory ?? "*"}|${date}`;
  // Open the day that just received an expense (adjusting state during render).
  const lastAddedId = useDataStore((s) => s.lastAddedExpenseId);
  const [seenAddedId, setSeenAddedId] = useState(lastAddedId);
  if (lastAddedId !== seenAddedId) {
    setSeenAddedId(lastAddedId);
    const date = expenses.find((e) => e.id === lastAddedId)?.date;
    if (date) setOpenDays((o) => ({ ...o, [dayKey(date)]: true }));
  }

  const isCurrentMonth = monthOf(today) === month;
  const categories = useMemo(() => categoryTotals(expenses, month), [expenses, month]);
  const visible = useMemo(() => filterByCategory(expenses, activeCategory), [expenses, activeCategory]);
  const groups = useMemo(
    () =>
      groupExpensesByDate(visible, month, {
        // While filtering, show only days that match. Otherwise always offer
        // a "today" card in the current month, ready for quick entry.
        extraDates: activeCategory !== null ? [] : isCurrentMonth ? [...extraDates, today] : extraDates,
        order: sortOrder,
      }),
    [visible, month, extraDates, sortOrder, activeCategory, isCurrentMonth, today],
  );
  const advancesIn = useMemo(() => advancesIntoMonth(visible, month), [visible, month]);
  const advancesOut = useMemo(() => advancesPaidInMonth(visible, month), [visible, month]);
  const summary = useMemo(
    () => monthSummary({ expenses, loans, transactions, month, today }),
    [expenses, loans, transactions, month, today],
  );
  const prevMonth = addMonths(month, -1);
  const prevTotal = useMemo(
    () => monthTotal(expenses, prevMonth, loans, transactions),
    [expenses, prevMonth, loans, transactions],
  );

  const defaultDate = defaultDateFor(month, today);
  const hasExpenses = groups.some((g) => g.expenses.length > 0) || advancesIn.length > 0 || advancesOut.length > 0;
  const expenseCount = useMemo(() => countAll(expenses, month), [expenses, month]);
  const sortLabel = sortOrder === "newest" ? te.newestFirst : te.oldestFirst;
  // Past days start collapsed; today, empty dates and filtered results start open.
  const isOpen = (g: { date: string; expenses: Expense[] }) =>
    openDays[dayKey(g.date)] ?? (activeCategory !== null || g.date === today || g.expenses.length === 0);
  const allOpen = groups.every(isOpen);
  // After picking another day: that day (and today) open, the rest collapsed, so the
  // new day is in focus for entry.
  const focusDay = (date: string) =>
    setOpenDays((o) => ({
      ...o,
      ...Object.fromEntries(groups.map((g) => [dayKey(g.date), g.date === today])),
      [dayKey(date)]: true,
    }));
  const setAll = (open: boolean) =>
    setOpenDays((o) => ({ ...o, ...Object.fromEntries(groups.map((g) => [dayKey(g.date), open])) }));
  const activeLabel =
    activeCategory === null
      ? null
      : (categories.find((c) => c.key === activeCategory)?.label ?? t.summary.uncategorized);
  const filteredTotal = sumMoney([...groups.flatMap((g) => g.expenses), ...advancesIn].map((e) => e.amount));

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[12rem_minmax(0,1fr)_18rem] lg:grid-rows-[auto_1fr] lg:gap-x-6 xl:grid-cols-[14rem_minmax(0,1fr)_20rem] xl:gap-x-8">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-3 lg:col-start-2 lg:row-start-1">
        <div className="min-w-0">
          <h1 id="month-heading" className="sr-only text-lg font-medium text-muted-foreground sm:not-sr-only">
            {f.month(month)}
          </h1>
          {/* Hero figure: proportional digits read better at display size. */}
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="figure text-4xl font-semibold tracking-tight">{f.money(summary.grandTotal)}</span>
            <span className="text-sm text-muted-foreground">
              {te.spent} · {te.count(f.number(expenseCount), expenseCount === 1)}
            </span>
          </p>
          {prevTotal > 0 && <PrevMonthDelta current={summary.grandTotal} previous={prevTotal} prevMonth={prevMonth} />}
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={() => setPdfOpen(true)} aria-label={te.downloadPdf}>
            <FileDownIcon />
            <span className="hidden sm:inline">{te.downloadPdf}</span>
          </Button>
          <Button className="hidden sm:inline-flex" onClick={() => setFormOpen(true)}>
            <PlusIcon /> {te.addExpense}
          </Button>
        </div>
      </header>

      <aside className="space-y-3 lg:sticky lg:top-20 lg:col-start-3 lg:row-span-2 lg:row-start-1">
        <MonthSummary
          summary={summary}
          categories={categories}
          activeCategory={activeCategory}
          onSelectCategory={selectCategory}
        />
      </aside>

      <section className="min-w-0 space-y-4 lg:col-start-2 lg:row-start-2" aria-labelledby="month-heading">
        {categories.length > 1 && (
          <CategoryChips categories={categories} active={activeCategory} onSelect={selectCategory} />
        )}

        {activeLabel !== null && (
          <div
            role="status"
            className="flex items-center gap-3 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-sm"
          >
            <FilterIcon className="size-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate">
              {te.showing(activeLabel)} · <span className="money font-semibold">{f.money(filteredTotal)}</span>
            </span>
            <Button variant="ghost" size="sm" onClick={() => selectCategory(null)}>
              <XIcon /> {te.showAll}
            </Button>
          </div>
        )}

        {advancesIn.length > 0 && (
          <AdvanceSection
            title={te.paidInAdvance}
            description={te.paidInAdvanceDesc(f.monthShort(month))}
            expenses={advancesIn}
            badge={(e) => <Badge variant="outline">{te.prepaidIn(f.monthShort(monthOf(e.date)))}</Badge>}
          />
        )}

        {activeLabel !== null && !hasExpenses ? (
          <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            {te.noMatches(activeLabel)}
          </p>
        ) : !hasExpenses && !isCurrentMonth ? (
          <EmptyState
            icon={ReceiptTextIcon}
            title={te.emptyTitle(f.month(month))}
            description={te.emptyBody}
            action={
              <>
                <Button onClick={() => setFormOpen(true)}>
                  <PlusIcon /> {te.addExpense}
                </Button>
                <AddDateButton month={month} defaultDate={defaultDate} onPicked={focusDay} />
              </>
            }
          />
        ) : (
          <>
            {groups.length > 1 && (
              <div className="flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => setAll(!allOpen)}
                  aria-label={allOpen ? te.collapseAll : te.expandAll}
                >
                  {allOpen ? <ChevronsDownUpIcon /> : <ChevronsUpDownIcon />}
                  {allOpen ? te.collapseAll : te.expandAll}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => setSortOrder(sortOrder === "newest" ? "oldest" : "newest")}
                  aria-label={te.switchOrder(sortLabel)}
                >
                  {sortOrder === "newest" ? <ArrowDownWideNarrowIcon /> : <ArrowUpNarrowWideIcon />}
                  {sortLabel}
                </Button>
              </div>
            )}
            {groups.map((g) => (
              <DayGroup
                key={g.date}
                group={g}
                removable={extraDates.includes(g.date)}
                open={isOpen(g)}
                onOpenChange={(open) => setOpenDays((o) => ({ ...o, [dayKey(g.date)]: open }))}
              />
            ))}
            {activeCategory === null && <AddDateButton month={month} defaultDate={defaultDate} onPicked={focusDay} block />}
          </>
        )}

        {advancesOut.length > 0 && (
          <AdvanceSection
            title={te.advancesOut}
            description={te.advancesOutDesc(f.monthShort(month))}
            expenses={advancesOut}
            badge={(e) => (
              <Badge variant="outline" className="border-primary/30 text-primary">
                {te.advanceTo(f.monthShort(e.advanceForMonth!))}
              </Badge>
            )}
            muted
          />
        )}
      </section>

      {/* After the expenses on phones; left column on desktop. */}
      <aside className="mt-4 lg:sticky lg:top-20 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:mt-0">
        <MonthList />
      </aside>

      {/* Phones: thumb-reachable add button, above the tab bar. */}
      <Button
        size="icon-lg"
        className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 size-14 rounded-full shadow-[0_10px_28px_-8px_color-mix(in_oklch,var(--primary)_60%,transparent)] sm:hidden"
        onClick={() => setFormOpen(true)}
        aria-label={te.addExpense}
      >
        <PlusIcon className="size-6" />
      </Button>

      <ExpenseFormDialog open={formOpen} onOpenChange={setFormOpen} defaultDate={defaultDate} />
      <ExportPdfDialog open={pdfOpen} onOpenChange={setPdfOpen} />
    </div>
  );
}

/** Number of expenses counted in the month (daily + advances belonging to it). */
function countAll(expenses: Expense[], month: string) {
  return dailyExpensesInMonth(expenses, month).length + advancesIntoMonth(expenses, month).length;
}

/** "৳520 more than September": context for the headline number. */
function PrevMonthDelta({ current, previous, prevMonth }: { current: number; previous: number; prevMonth: string }) {
  const { t, f } = useI18n();
  const diff = subtractMoney(current, previous);
  const month = f.monthName(prevMonth);
  const Icon = diff > 0 ? TrendingUpIcon : diff < 0 ? TrendingDownIcon : MinusIcon;
  return (
    <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
      <Icon aria-hidden className="size-4" />
      {diff === 0 ? t.expenses.sameAsPrev(month) : t.expenses.vsPrev(f.money(Math.abs(diff)), month, diff > 0)}
    </p>
  );
}

/** Phones and tablets: one-tap category filter (desktop uses the breakdown bars). */
function CategoryChips({
  categories,
  active,
  onSelect,
}: {
  categories: CategoryTotal[];
  active: string | null;
  onSelect(key: string | null): void;
}) {
  const { t, f } = useI18n();
  const chip = (selected: boolean) =>
    cn(
      "flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
      selected
        ? "border-primary bg-primary text-primary-foreground"
        : "bg-card text-foreground hover:bg-muted dark:bg-card",
    );
  return (
    <div
      role="group"
      aria-label={t.expenses.filterCategories}
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:hidden"
    >
      <button type="button" aria-pressed={active === null} className={chip(active === null)} onClick={() => onSelect(null)}>
        {t.expenses.all}
      </button>
      {categories.map((c) => (
        <button
          key={c.key}
          type="button"
          aria-pressed={active === c.key}
          className={chip(active === c.key)}
          onClick={() => onSelect(active === c.key ? null : c.key)}
        >
          {c.label ?? t.summary.uncategorized}
          <span className={cn("money text-xs", active === c.key ? "opacity-80" : "text-muted-foreground")}>
            {f.money(c.total)}
          </span>
        </button>
      ))}
    </div>
  );
}

function AdvanceSection({
  title,
  description,
  expenses,
  badge,
  muted,
}: {
  title: string;
  description: string;
  expenses: Expense[];
  badge(e: Expense): React.ReactNode;
  muted?: boolean;
}) {
  const { f } = useI18n();
  const total = sumMoney(expenses.map((e) => e.amount));

  return (
    <Card className={cn("gap-0 py-0", muted && "border-dashed bg-muted/30 shadow-none ring-0")}>
      <div className="flex items-start gap-3 border-b px-4 py-3">
        <CalendarClockIcon className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <span className={muted ? "money font-medium text-muted-foreground" : "money text-lg font-semibold"}>
          {f.money(total)}
        </span>
      </div>
      <ul className="divide-y divide-dashed px-4">
        {expenses.map((e) => (
          <ExpenseRow key={e.id} expense={e} badge={badge(e)} muted={muted} />
        ))}
      </ul>
    </Card>
  );
}

function AddDateButton({
  month,
  defaultDate,
  block,
  onPicked,
}: {
  month: string;
  defaultDate: ISODate;
  block?: boolean;
  /** Called with the chosen date so the list can focus that day. */
  onPicked(date: ISODate): void;
}) {
  const { t } = useI18n();
  const calendarLocale = useCalendarLocale();
  const [open, setOpen] = useState(false);
  const addExtraDate = usePrefsStore((s) => s.addExtraDate);
  const setMonth = useViewStore((s) => s.setMonth);

  function pick(date: ISODate) {
    addExtraDate(date);
    setOpen(false);
    if (monthOf(date) !== month) setMonth(monthOf(date));
    // Bring the (possibly existing) day into view once rendered.
    onPicked(date);
    // Once the day has rendered (and others collapsed): bring it into view and
    // put the cursor in its quick-add box, ready for "bus 20".
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const day = document.getElementById(`day-${date}`);
        day?.scrollIntoView({ behavior: "smooth", block: "start" });
        day?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
      }),
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn(block && "w-full border-dashed bg-transparent")}>
          <CalendarPlusIcon /> {block ? t.expenses.addAnotherDay : t.expenses.pickDay}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="center">
        <Calendar
          mode="single"
          required
          defaultMonth={parseISODate(defaultDate)}
          selected={parseISODate(defaultDate)}
          onSelect={(d) => d && pick(toISODate(d))}
          autoFocus
          {...calendarLocale}
        />
      </PopoverContent>
    </Popover>
  );
}
