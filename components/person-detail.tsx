"use client";

import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { LoanCard } from "@/components/loan-card";
import { LoanFormDialog } from "@/components/loan-form";
import { Button } from "@/components/ui/button";
import type { PersonView } from "@/lib/calculations";
import { defaultDateFor } from "@/lib/dates";
import { useI18n } from "@/lib/i18n";
import { toMinor } from "@/lib/money";
import { useViewStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/** Everything with one person: where you stand overall, then each loan. */
export function PersonDetail({ person }: { person: PersonView }) {
  const { t, f } = useI18n();
  const month = useViewStore((s) => s.month)!;
  const today = useViewStore((s) => s.today)!;
  const [newOpen, setNewOpen] = useState(false);
  const sign = Math.sign(toMinor(person.net));
  const active = person.loans.filter((v) => !v.settled);
  const settled = person.loans.filter((v) => v.settled);

  return (
    <div className="space-y-4">
      <header className="flex items-start gap-3">
        <PersonAvatar name={person.name} sign={sign} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-semibold tracking-tight">{person.name}</h2>
          <p
            className={cn(
              "font-medium",
              sign < 0 && "text-negative",
              sign > 0 && "text-positive",
              sign === 0 && "text-muted-foreground",
            )}
          >
            {sign < 0
              ? t.loans.personOwe(person.name, f.money(-person.net))
              : sign > 0
                ? t.loans.personOwed(person.name, f.money(person.net))
                : t.loans.personEven(person.name)}
          </p>
          {person.owe > 0 && person.owed > 0 && (
            <p className="text-sm text-muted-foreground">{t.loans.both(f.money(person.owe), f.money(person.owed))}</p>
          )}
        </div>
      </header>

      <Button variant="outline" className="w-full sm:w-auto" onClick={() => setNewOpen(true)}>
        <PlusIcon /> {t.loans.newLoanWith(person.name)}
      </Button>

      <div className="space-y-3">
        {active.map((v) => (
          <LoanCard key={v.loan.id} view={v} withinPerson />
        ))}
        {settled.map((v) => (
          <LoanCard key={v.loan.id} view={v} withinPerson />
        ))}
      </div>

      <LoanFormDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        defaultPerson={person.name}
        defaultDirection={person.net > 0 ? "lent" : "borrowed"}
        defaultDate={defaultDateFor(month, today)}
      />
    </div>
  );
}

/** Initial in a circle, tinted by who owes whom (red: you owe, green: they owe you). */
export function PersonAvatar({ name, sign, size = "md" }: { name: string; sign: number; size?: "md" | "lg" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold",
        size === "lg" ? "size-12 text-lg" : "size-9 text-sm",
        sign < 0 && "bg-negative/10 text-negative",
        sign > 0 && "bg-positive/10 text-positive",
        sign === 0 && "bg-muted text-muted-foreground",
      )}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
