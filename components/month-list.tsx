"use client";

import { CalendarRangeIcon } from "lucide-react";
import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { monthTotals, type MonthTotal } from "@/lib/calculations";
import { monthOf } from "@/lib/dates";
import { useI18n } from "@/lib/i18n";
import { sumMoney } from "@/lib/money";
import { useDataStore, useViewStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/** Every month with data and its total; selecting one opens it. */
export function MonthList() {
  const { t, f } = useI18n();
  const month = useViewStore((s) => s.month)!;
  const today = useViewStore((s) => s.today)!;
  const setMonth = useViewStore((s) => s.setMonth);
  const expenses = useDataStore((s) => s.expenses);
  const loans = useDataStore((s) => s.loans);
  const transactions = useDataStore((s) => s.transactions);
  const currentMonth = monthOf(today);

  const { years, max } = useMemo(() => {
    // Always list this month and the one being viewed, even with no data.
    const list = monthTotals(expenses, loans, transactions, [currentMonth, month]);
    const byYear = new Map<string, MonthTotal[]>();
    for (const item of list) {
      const year = item.month.slice(0, 4);
      byYear.set(year, [...(byYear.get(year) ?? []), item]);
    }
    return { years: [...byYear.entries()], max: Math.max(0, ...list.map((m) => m.total)) };
  }, [expenses, loans, transactions, currentMonth, month]);

  function open(m: string) {
    setMonth(m);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <Card className="gap-0 py-0 lg:max-h-[calc(100dvh-6rem)]">
      <div className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
        <CalendarRangeIcon className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">{t.monthList.title}</h2>
      </div>
      <nav aria-label={t.monthList.title} className="min-h-0 space-y-3 overflow-y-auto p-2">
        {years.map(([year, months]) => (
          <div key={year}>
            <div className="flex items-baseline justify-between px-2 pt-1 pb-1.5 text-xs font-medium text-muted-foreground">
              <span>{f.year(`${year}-01`)}</span>
              <span className="money">{f.money(sumMoney(months.map((m) => m.total)))}</span>
            </div>
            <ul className="space-y-0.5">
              {months.map((m) => {
                const active = m.month === month;
                const isCurrent = m.month === currentMonth;
                return (
                  <li key={m.month}>
                    <button
                      type="button"
                      onClick={() => open(m.month)}
                      aria-current={active ? "true" : undefined}
                      aria-label={`${f.month(m.month)}, ${f.money(m.total)}${isCurrent ? `, ${t.monthList.thisMonth}` : ""}`}
                      className={cn(
                        "w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50",
                        active && "bg-primary/10 hover:bg-primary/15",
                      )}
                    >
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={cn("flex items-center gap-1.5", active && "font-semibold text-primary")}>
                          {f.monthName(m.month)}
                          {isCurrent && <span className="size-1.5 rounded-full bg-primary" aria-hidden />}
                        </span>
                        <span className={cn("money text-xs", m.total > 0 ? "font-medium" : "text-muted-foreground")}>
                          {f.money(m.total)}
                        </span>
                      </span>
                      <span aria-hidden className="mt-1 block h-1 overflow-hidden rounded-full bg-muted">
                        <span
                          className={cn("block h-full rounded-full", active ? "bg-primary" : "bg-primary/40")}
                          style={{ width: max > 0 ? `${(m.total / max) * 100}%` : 0 }}
                        />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </Card>
  );
}
