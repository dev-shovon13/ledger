"use client";

import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { foldCategories, type CategoryTotal, type MonthSummary as Summary } from "@/lib/calculations";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const MAX_CATEGORIES = 6;

type Props = {
  summary: Summary;
  categories: CategoryTotal[];
  /** Selected category key, or null for all. */
  activeCategory: string | null;
  onSelectCategory(key: string | null): void;
};

/**
 * How the month's total is made up. The total itself lives in the page
 * header; this card explains it. Collapsible on phones, always open (and
 * sticky, via the parent) on desktop.
 */
export function MonthSummary({ summary, categories, activeCategory, onSelectCategory }: Props) {
  const { t, f } = useI18n();
  const s = t.summary;
  const [open, setOpen] = useState(false);

  return (
    <Card className="gap-0 py-0">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger
          className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50 lg:pointer-events-none"
          aria-label={open ? s.hideBreakdown : s.showBreakdown}
        >
          <h2 className="text-sm font-semibold">{s.breakdown}</h2>
          <span className="flex items-center gap-2 text-sm text-muted-foreground lg:hidden">
            <span className="money">
              {s.avgPerDay} {f.money(summary.averagePerDay)}
            </span>
            <ChevronDownIcon className={cn("size-4 transition-transform duration-200", open && "rotate-180")} />
          </span>
        </CollapsibleTrigger>

        <CollapsibleContent forceMount className="data-[state=closed]:hidden lg:data-[state=closed]:block">
          <div className="space-y-4 px-4 pb-4">
            <Separator />
            <dl className="space-y-2.5 text-sm">
              <Row label={s.daily} value={f.money(summary.dailySubtotal)} />
              <Row label={s.paidInAdvance} hint={s.forThisMonth} value={f.money(summary.advancesIn)} />
              <Row label={s.loanRepayments} hint={s.countedAsExpense} value={f.money(summary.loanRepayments)} />
              <Separator />
              <Row label={s.grandTotal} value={f.money(summary.grandTotal)} strong />
            </dl>

            {categories.length > 0 && (
              <CategoryBars categories={categories} active={activeCategory} onSelect={onSelectCategory} />
            )}

            <dl className="grid grid-cols-2 gap-3 border-t pt-3 text-sm">
              <div>
                <dt className="text-muted-foreground">{s.avgPerDay}</dt>
                <dd className="money font-semibold">{f.money(summary.averagePerDay)}</dd>
                <dd className="text-xs text-muted-foreground">{s.overDays(f.number(summary.daysCounted))}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{s.highestDay}</dt>
                <dd className="money font-semibold">
                  {summary.highestDay ? f.money(summary.highestDay.total) : s.noneYet}
                </dd>
                {summary.highestDay && (
                  <dd className="text-xs text-muted-foreground">{f.dayMonth(summary.highestDay.date)}</dd>
                )}
              </div>
            </dl>

            {summary.advancesOut > 0 && (
              <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                {s.advancesOutNote(f.money(summary.advancesOut))}
              </p>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

/**
 * Single-series magnitude bars (one hue, no legend); each row filters the
 * expense list. Values sit beside the bars in text colour.
 */
function CategoryBars({
  categories,
  active,
  onSelect,
}: {
  categories: CategoryTotal[];
  active: string | null;
  onSelect(key: string | null): void;
}) {
  const { t, f } = useI18n();
  const s = t.summary;
  const { shown, other } = foldCategories(categories, MAX_CATEGORIES);
  const max = Math.max(...categories.map((c) => c.total), 0);

  return (
    <section aria-labelledby="by-category">
      <h3 id="by-category" className="mb-2 text-xs font-medium text-muted-foreground">
        {s.byCategory}
      </h3>
      <ul className="space-y-1">
        {shown.map((c) => {
          const label = c.label ?? s.uncategorized;
          const selected = active === c.key;
          return (
            <li key={c.key}>
              <button
                type="button"
                aria-pressed={selected}
                aria-label={`${s.showOnly(label)}, ${f.money(c.total)}`}
                onClick={() => onSelect(selected ? null : c.key)}
                className={cn(
                  "group/bar -mx-2 block w-[calc(100%+1rem)] rounded-md px-2 py-1.5 text-left outline-none transition-colors hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring/50",
                  selected && "bg-primary/10 hover:bg-primary/15",
                  active !== null && !selected && "opacity-60 hover:opacity-100",
                )}
              >
                <span className="flex items-baseline justify-between gap-2 text-sm">
                  <span className={cn("truncate", !c.label && "text-muted-foreground italic", selected && "font-medium")}>
                    {label}
                  </span>
                  <span className="money shrink-0 font-medium">{f.money(c.total)}</span>
                </span>
                <span aria-hidden className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                    style={{ width: max > 0 ? `${Math.max(2, (c.total / max) * 100)}%` : 0 }}
                  />
                </span>
              </button>
            </li>
          );
        })}
        {other && (
          <li className="flex items-baseline justify-between gap-2 px-0 py-1.5 text-sm text-muted-foreground">
            <span>
              {s.other} · {f.number(other.count)}
            </span>
            <span className="money">{f.money(other.total)}</span>
          </li>
        )}
      </ul>
    </section>
  );
}

function Row({ label, hint, value, strong }: { label: string; hint?: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3", strong && "text-base font-semibold")}>
      <dt className={cn(!strong && "text-muted-foreground")}>
        {label}
        {hint && <span className="block text-xs text-muted-foreground/80">{hint}</span>}
      </dt>
      <dd className="money text-right">{value}</dd>
    </div>
  );
}
