"use client";

import { ChevronDownIcon, ChevronRightIcon, HandCoinsIcon, PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { LoanFormDialog } from "@/components/loan-form";
import { PersonAvatar, PersonDetail } from "@/components/person-detail";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useMediaQuery } from "@/hooks/use-media-query";
import { buildPeople, loanTotals, type LoanTotals, type PersonView } from "@/lib/calculations";
import { defaultDateFor } from "@/lib/dates";
import { useI18n } from "@/lib/i18n";
import { toMinor } from "@/lib/money";
import { useDataStore, useViewStore } from "@/lib/store";
import type { LoanDirection } from "@/lib/types";
import { cn } from "@/lib/utils";

type Filter = "all" | "owe" | "owed";

const matches = (p: PersonView, filter: Filter) =>
  filter === "all" ? true : filter === "owe" ? p.owe > 0 : p.owed > 0;

export function LoansView() {
  const { t, f } = useI18n();
  const month = useViewStore((s) => s.month)!;
  const today = useViewStore((s) => s.today)!;
  const loans = useDataStore((s) => s.loans);
  const transactions = useDataStore((s) => s.transactions);
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const [filter, setFilter] = useState<Filter>("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [newLoan, setNewLoan] = useState<LoanDirection | null>(null);
  const [settledOpen, setSettledOpen] = useState(false);

  const people = useMemo(() => buildPeople(loans, transactions, month), [loans, transactions, month]);
  const totals = useMemo(() => loanTotals(loans, transactions, month), [loans, transactions, month]);

  const active = people.filter((p) => !p.settled && matches(p, filter));
  const settled = filter === "all" ? people.filter((p) => p.settled) : [];
  const shown = [...active, ...settled];
  // Desktop always shows someone: the chosen person, else the first in the list.
  const selected = shown.find((p) => p.key === selectedKey) ?? (isDesktop ? shown[0] : undefined);

  function openPerson(key: string) {
    setSelectedKey(key);
    if (!isDesktop) setSheetOpen(true);
  }

  const filters: { value: Filter; label: string; count: number }[] = [
    { value: "all", label: t.loans.everyone, count: people.filter((p) => !p.settled).length },
    { value: "owe", label: t.loans.iOwe, count: people.filter((p) => !p.settled && p.owe > 0).length },
    { value: "owed", label: t.loans.owedToMe, count: people.filter((p) => !p.settled && p.owed > 0).length },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t.loans.title}</h1>
          <p className="text-sm text-muted-foreground">{t.loans.asOf(f.month(month))}</p>
        </div>
        <Button onClick={() => setNewLoan(filter === "owed" ? "lent" : "borrowed")}>
          <PlusIcon /> {t.loans.newLoan}
        </Button>
      </header>

      <BalancePanel totals={totals} />

      {people.length === 0 ? (
        <EmptyState
          icon={HandCoinsIcon}
          title={t.loans.noLoans}
          description={t.loans.emptyAllBody}
          action={
            <>
              <Button variant="outline" onClick={() => setNewLoan("borrowed")}>
                <PlusIcon /> {t.loans.iBorrowedMoney}
              </Button>
              <Button variant="outline" onClick={() => setNewLoan("lent")}>
                <PlusIcon /> {t.loans.iLentMoney}
              </Button>
            </>
          }
        />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <div className="space-y-3">
            <div role="radiogroup" aria-label={t.loans.people} className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
              {filters.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  role="radio"
                  aria-checked={filter === item.value}
                  onClick={() => setFilter(item.value)}
                  className={cn(
                    "flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
                    filter === item.value && "bg-background text-foreground shadow-sm dark:bg-input/80",
                  )}
                >
                  <span className="truncate">{item.label}</span>
                  <span className="text-xs opacity-70">{f.number(item.count)}</span>
                </button>
              ))}
            </div>

            {active.length === 0 ? (
              <EmptyState
                icon={HandCoinsIcon}
                title={filter === "owed" ? t.loans.emptyLentTitle : filter === "owe" ? t.loans.emptyBorrowedTitle : t.loans.noLoans}
                description={filter === "owed" ? t.loans.emptyLentBody : t.loans.emptyBorrowedBody}
              />
            ) : (
              <PeopleList people={active} selectedKey={isDesktop ? selected?.key : undefined} onOpen={openPerson} />
            )}

            {settled.length > 0 && (
              <Collapsible open={settledOpen} onOpenChange={setSettledOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between text-muted-foreground">
                    {t.loans.settledCount(f.number(settled.length))}
                    <ChevronDownIcon className={cn("transition-transform", settledOpen && "rotate-180")} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <PeopleList people={settled} selectedKey={isDesktop ? selected?.key : undefined} onOpen={openPerson} />
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>

          {isDesktop && (
            <aside className="lg:sticky lg:top-20" aria-live="polite">
              {selected ? (
                <PersonDetail key={selected.key} person={selected} />
              ) : (
                <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                  {t.loans.selectPerson}
                </p>
              )}
            </aside>
          )}
        </div>
      )}

      {/* Phones and tablets: the person opens as a sheet over the list. */}
      {!isDesktop && (
        <Dialog open={sheetOpen && !!selected} onOpenChange={setSheetOpen}>
          <DialogContent sheet className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
            {selected && (
              <>
                <DialogTitle className="sr-only">{selected.name}</DialogTitle>
                <DialogDescription className="sr-only">{t.loans.asOf(f.month(month))}</DialogDescription>
                <PersonDetail key={selected.key} person={selected} />
              </>
            )}
          </DialogContent>
        </Dialog>
      )}

      <LoanFormDialog
        open={newLoan !== null}
        onOpenChange={(o) => !o && setNewLoan(null)}
        defaultDirection={newLoan ?? "borrowed"}
        defaultDate={defaultDateFor(month, today)}
      />
    </div>
  );
}

function PeopleList({
  people,
  selectedKey,
  onOpen,
}: {
  people: PersonView[];
  selectedKey?: string;
  onOpen(key: string): void;
}) {
  const { t, f } = useI18n();
  const month = useViewStore((s) => s.month)!;
  const monthName = f.monthName(month, "short");

  return (
    <Card className="gap-0 py-0">
      <ul aria-label={t.loans.people} className="divide-y">
        {people.map((p) => {
          const sign = Math.sign(toMinor(p.net));
          const selected = p.key === selectedKey;
          const activity =
            p.paidBack > 0
              ? t.loans.activityPaid(f.money(p.paidBack), monthName)
              : p.received > 0
                ? t.loans.activityReceived(f.money(p.received), monthName)
                : p.borrowed > 0
                  ? t.loans.activityBorrowed(f.money(p.borrowed), monthName)
                  : p.lent > 0
                    ? t.loans.activityLent(f.money(p.lent), monthName)
                    : null;
          const since = p.loans.reduce((min, v) => (v.startDate && v.startDate < min ? v.startDate : min), "9999");
          return (
            <li key={p.key}>
              <button
                type="button"
                onClick={() => onOpen(p.key)}
                aria-label={t.loans.open(p.name)}
                aria-current={selected ? "true" : undefined}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset",
                  selected && "bg-primary/8 hover:bg-primary/12",
                )}
              >
                <PersonAvatar name={p.name} sign={sign} />
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate font-medium", selected && "text-primary")}>{p.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {t.loans.loansCount(f.number(p.loans.length), p.loans.length === 1)} ·{" "}
                    {activity ?? t.loanCard.since(f.date(since))}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[11px] text-muted-foreground">
                    {p.settled ? t.loanCard.settled : sign < 0 ? t.loans.youOwe : sign > 0 ? t.loans.owesYou : "—"}
                  </span>
                  <span
                    className={cn(
                      "money block font-semibold",
                      sign < 0 && "text-negative",
                      sign > 0 && "text-positive",
                      sign === 0 && "text-muted-foreground",
                    )}
                  >
                    {f.money(Math.abs(p.net))}
                  </span>
                </span>
                <ChevronRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground lg:hidden" />
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** Net position in words, with the owe/owed split drawn to scale. */
function BalancePanel({ totals }: { totals: LoanTotals }) {
  const { t, f } = useI18n();
  const sign = Math.sign(toMinor(totals.net));
  const sum = totals.iOwe + totals.owedToMe;
  const owePct = sum > 0 ? (totals.iOwe / sum) * 100 : 0;
  const sentence =
    sign < 0 ? t.loans.netOwe(f.money(-totals.net)) : sign > 0 ? t.loans.netOwed(f.money(totals.net)) : t.loans.netEven;

  return (
    <Card className="gap-4 px-4 py-4 sm:px-5">
      <p
        className={cn(
          "figure text-lg font-semibold tracking-tight sm:text-xl",
          sign < 0 && "text-negative",
          sign > 0 && "text-positive",
        )}
      >
        {sentence}
      </p>
      <div aria-hidden className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-muted">
        {sum > 0 && (
          <>
            <span className="h-full rounded-full bg-negative/80" style={{ width: `${owePct}%` }} />
            <span className="h-full flex-1 rounded-full bg-positive/80" />
          </>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-3">
        <div>
          <dt className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <span aria-hidden className="size-2 rounded-full bg-negative/80" />
            {t.loans.iOwe}
          </dt>
          <dd className="money text-xl font-semibold">{f.money(totals.iOwe)}</dd>
        </div>
        <div className="text-right">
          <dt className="flex items-center justify-end gap-1.5 text-sm text-muted-foreground">
            <span aria-hidden className="size-2 rounded-full bg-positive/80" />
            {t.loans.owedToMe}
          </dt>
          <dd className="money text-xl font-semibold">{f.money(totals.owedToMe)}</dd>
        </div>
      </dl>
    </Card>
  );
}
