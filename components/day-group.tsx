"use client";

import { ChevronDownIcon, CornerDownLeftIcon, PlusIcon, SquarePenIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ExpenseFormDialog } from "@/components/expense-form";
import { ExpenseRow } from "@/components/expense-row";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { parseQuickAdd, type DayGroup as DayGroupData } from "@/lib/calculations";
import { useI18n } from "@/lib/i18n";
import { useDataStore, usePrefsStore, useViewStore } from "@/lib/store";
import { cn } from "@/lib/utils";

type Props = {
  group: DayGroupData;
  /** True for dates the user added by hand (the automatic "today" card isn't). */
  removable?: boolean;
  open: boolean;
  onOpenChange(open: boolean): void;
};

/**
 * One day's expenses as an accordion item. Collapsed, it is a compact row
 * (date, count, a preview of titles, total) so a full month stays scannable.
 */
export function DayGroup({ group, removable = false, open, onOpenChange }: Props) {
  const { t, f } = useI18n();
  const today = useViewStore((s) => s.today);
  const removeExtraDate = usePrefsStore((s) => s.removeExtraDate);
  const [formOpen, setFormOpen] = useState(false);
  const empty = group.expenses.length === 0;
  const count = group.expenses.length;
  const preview = group.expenses.map((e) => e.title).join(", ");

  return (
    <Card id={`day-${group.date}`} className="scroll-mt-20 gap-0 py-0">
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <CollapsibleTrigger
          className={cn(
            "group/day flex w-full items-center gap-3 px-4 py-3 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset",
            open ? "border-b" : "rounded-xl",
          )}
        >
          <div className="min-w-0 flex-1">
            <h3 className="flex items-center gap-2 font-semibold">
              {f.date(group.date)}
              {group.date === today && (
                <Badge variant="outline" className="border-primary/30 text-primary">
                  {t.common.today}
                </Badge>
              )}
            </h3>
            <p className="truncate text-xs text-muted-foreground">
              {f.weekday(group.date)}
              {!open && count > 0 && (
                <>
                  {" · "}
                  {t.expenses.count(f.number(count), count === 1)}
                  <span className="hidden sm:inline">{` · ${preview}`}</span>
                </>
              )}
            </p>
          </div>
          {!empty && <span className="money text-lg font-semibold">{f.money(group.total)}</span>}
          <ChevronDownIcon
            aria-hidden
            className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")}
          />
        </CollapsibleTrigger>

        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
          <div className="px-4">
            {empty ? (
              <div className="flex items-center justify-between gap-3 py-2">
                <p className="text-sm text-muted-foreground">{t.expenses.noExpensesOnDate}</p>
                {removable && (
                  <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => removeExtraDate(group.date)}>
                    <XIcon /> {t.expenses.removeDate}
                  </Button>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-dashed">
                {group.expenses.map((e) => (
                  <ExpenseRow key={e.id} expense={e} />
                ))}
              </ul>
            )}
          </div>

          {/* Reads as one more row of the list: type "bus 20" and press Enter. */}
          <div className="flex items-center gap-1 border-t border-dashed px-2 py-1.5">
            <QuickAdd date={group.date} />
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0 text-muted-foreground"
              onClick={() => setFormOpen(true)}
              aria-label={t.expenses.addWithDetails}
              title={t.expenses.addWithDetails}
            >
              <SquarePenIcon />
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <ExpenseFormDialog open={formOpen} onOpenChange={setFormOpen} defaultDate={group.date} />
    </Card>
  );
}

/** Single-input add: "bus 20", "bus-20" or "বাস ২০" + Enter. */
function QuickAdd({ date }: { date: string }) {
  const { t, f } = useI18n();
  const addExpense = useDataStore((s) => s.addExpense);
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  const parsed = parseQuickAdd(value);
  const errorId = `quick-add-error-${date}`;

  async function submit() {
    if (!parsed) {
      setError(true);
      return;
    }
    try {
      await addExpense({ date, ...parsed });
      setValue("");
    } catch (e) {
      toast.error(t.row.couldntSave, { description: e instanceof Error ? e.message : undefined });
    }
  }

  return (
    <form
      className="relative min-w-0 flex-1"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <PlusIcon aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-primary" />
      <Input
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError(false);
        }}
        placeholder={t.expenses.quickAddPlaceholder}
        aria-label={t.expenses.quickAddLabel(f.date(date))}
        aria-invalid={error || undefined}
        aria-describedby={error ? errorId : undefined}
        autoComplete="off"
        enterKeyHint="done"
        className={cn(
          "h-9 border-transparent bg-transparent pl-8 shadow-none hover:bg-muted/50 focus-visible:bg-background dark:bg-transparent dark:hover:bg-muted/50",
          (parsed || error) && "pr-28",
        )}
      />
      <span
        className="pointer-events-none absolute inset-y-0 right-2 flex items-center gap-1 text-xs text-muted-foreground"
        aria-live="polite"
      >
        {parsed ? (
          <>
            <span className="max-w-16 truncate">{parsed.title}</span>
            <span className="money font-medium text-foreground">{f.money(parsed.amount)}</span>
            <CornerDownLeftIcon className="size-3" />
          </>
        ) : error ? (
          <span id={errorId} className="text-destructive">
            {t.expenses.quickAddError}
          </span>
        ) : null}
      </span>
    </form>
  );
}
