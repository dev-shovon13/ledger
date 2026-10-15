"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { DatePicker } from "@/components/date-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { monthOf } from "@/lib/dates";
import { useI18n } from "@/lib/i18n";
import { parseAmount } from "@/lib/money";
import { useDataStore, useViewStore } from "@/lib/store";
import type { ISODate, Loan, LoanDirection } from "@/lib/types";
import { cn } from "@/lib/utils";
import { loanFormSchema, type LoanFormValues } from "@/lib/validation";

type Props = {
  open: boolean;
  onOpenChange(open: boolean): void;
  defaultDate: ISODate;
  defaultDirection?: LoanDirection;
  /** Pre-fills the name, e.g. "New loan with Rahim" from a person's page. */
  defaultPerson?: string;
  /** When editing, only person and note can change; amounts are transactions. */
  loan?: Loan;
};

export function LoanFormDialog({ open, onOpenChange, ...rest }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent sheet className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <LoanForm {...rest} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function LoanForm({
  defaultDate,
  defaultDirection = "borrowed",
  defaultPerson = "",
  loan,
  onDone,
}: Omit<Props, "open" | "onOpenChange"> & { onDone(): void }) {
  const { t, f } = useI18n();
  const tl = t.loanForm;
  const addLoan = useDataStore((s) => s.addLoan);
  const updateLoan = useDataStore((s) => s.updateLoan);
  const loans = useDataStore((s) => s.loans);
  const viewMonth = useViewStore((s) => s.month);
  const setMonth = useViewStore((s) => s.setMonth);

  const schema = useMemo(() => loanFormSchema(t.validation, f.number, { editing: !!loan }), [t, f, loan]);
  const { register, control, handleSubmit, formState } = useForm<LoanFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      direction: loan?.direction ?? defaultDirection,
      person: loan?.person ?? defaultPerson,
      amount: "",
      date: defaultDate,
      note: loan?.note ?? "",
    },
  });
  const { errors, isSubmitting } = formState;
  const direction = useWatch({ control, name: "direction" });

  const people = useMemo(
    () => [...new Set(loans.map((l) => l.person))].sort((a, b) => a.localeCompare(b)),
    [loans],
  );

  async function onSubmit(values: LoanFormValues) {
    try {
      if (loan) {
        await updateLoan(loan.id, { person: values.person, note: values.note || undefined });
        toast.success(tl.updated);
      } else {
        const amount = parseAmount(values.amount)!;
        await addLoan({
          direction: values.direction,
          person: values.person,
          amount,
          date: values.date,
          note: values.note || undefined,
        });
        const month = monthOf(values.date);
        toast.success(
          values.direction === "borrowed"
            ? tl.borrowedToast(f.money(amount), values.person)
            : tl.lentToast(f.money(amount), values.person),
          month !== viewMonth
            ? { action: { label: tl.viewMonth(f.monthShort(month)), onClick: () => setMonth(month) } }
            : undefined,
        );
      }
      onDone();
    } catch (e) {
      toast.error(tl.couldntSave, { description: e instanceof Error ? e.message : undefined });
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-5" noValidate>
      <DialogHeader>
        <DialogTitle>{loan ? tl.editTitle : tl.newTitle}</DialogTitle>
        <DialogDescription>{loan ? tl.editDescription : tl.newDescription}</DialogDescription>
      </DialogHeader>

      <FieldGroup className="gap-4">
        {!loan && (
          <Controller
            control={control}
            name="direction"
            render={({ field }) => (
              <div role="radiogroup" aria-label={tl.direction} className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                {(
                  [
                    ["borrowed", tl.iBorrowed, tl.theyLentMe],
                    ["lent", tl.iLent, tl.theyOweMe],
                  ] as const
                ).map(([value, label, hint]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={field.value === value}
                    onClick={() => field.onChange(value)}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                      field.value === value && "bg-background text-foreground shadow-sm dark:bg-input/80",
                    )}
                  >
                    {label}
                    <span className="block text-[11px] font-normal text-muted-foreground">{hint}</span>
                  </button>
                ))}
              </div>
            )}
          />
        )}

        <Field data-invalid={!!errors.person}>
          <FieldLabel htmlFor="loan-person">{direction === "borrowed" ? tl.borrowedFrom : tl.lentTo}</FieldLabel>
          <Input
            id="loan-person"
            list="loan-people"
            placeholder={tl.namePlaceholder}
            autoComplete="off"
            autoFocus={!defaultPerson}
            aria-invalid={!!errors.person}
            {...register("person")}
          />
          <datalist id="loan-people">
            {people.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <FieldError errors={[errors.person]} />
        </Field>

        {!loan && (
          <div className="grid grid-cols-2 gap-3">
            <Field data-invalid={!!errors.amount}>
              <FieldLabel htmlFor="loan-amount">{t.common.amount}</FieldLabel>
              <Input
                id="loan-amount"
                inputMode="decimal"
                placeholder={f.number(0)}
                autoComplete="off"
                className="money"
                aria-invalid={!!errors.amount}
                {...register("amount")}
              />
              <FieldError errors={[errors.amount]} />
            </Field>
            <Field data-invalid={!!errors.date}>
              <FieldLabel htmlFor="loan-date">{t.common.date}</FieldLabel>
              <Controller
                control={control}
                name="date"
                render={({ field }) => (
                  <DatePicker id="loan-date" value={field.value} onChange={field.onChange} invalid={!!errors.date} />
                )}
              />
              <FieldError errors={[errors.date]} />
            </Field>
          </div>
        )}

        <Field data-invalid={!!errors.note}>
          <FieldLabel htmlFor="loan-note">
            {t.common.note} <span className="font-normal text-muted-foreground">{t.common.optional}</span>
          </FieldLabel>
          <Textarea id="loan-note" rows={2} aria-invalid={!!errors.note} {...register("note")} />
          <FieldError errors={[errors.note]} />
        </Field>
      </FieldGroup>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {t.common.cancel}
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {loan ? t.common.saveChanges : tl.addLoan}
        </Button>
      </DialogFooter>
    </form>
  );
}
