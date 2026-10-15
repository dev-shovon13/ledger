"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { DatePicker } from "@/components/date-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { loanBalance, loanStartDate } from "@/lib/calculations";
import { useI18n } from "@/lib/i18n";
import { parseAmount } from "@/lib/money";
import { useDataStore } from "@/lib/store";
import type { ISODate, Loan, LoanTransaction, LoanTransactionType } from "@/lib/types";
import { loanTransactionFormSchema, type LoanTransactionFormValues } from "@/lib/validation";

type Props = {
  open: boolean;
  onOpenChange(open: boolean): void;
  loan: Loan;
  /** All of this loan's transactions. */
  transactions: LoanTransaction[];
  type: LoanTransactionType;
  /** Present when editing. */
  transaction?: LoanTransaction;
  defaultDate: ISODate;
};

/** "Borrowed" / "Lent" / "Paid back" / "Received", in the active language. */
export function useTransactionLabel(loan: Loan) {
  const { t } = useI18n();
  const borrowed = loan.direction === "borrowed";
  return useCallback(
    (type: LoanTransactionType) =>
      type === "principal"
        ? borrowed
          ? t.loanCard.borrowed
          : t.loanCard.lent
        : borrowed
          ? t.loanCard.paidBack
          : t.loanCard.received,
    [t, borrowed],
  );
}

export function LoanTransactionDialog({ open, onOpenChange, ...rest }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent sheet className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <TransactionForm {...rest} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function TransactionForm({
  loan,
  transactions,
  type,
  transaction,
  defaultDate,
  onDone,
}: Omit<Props, "open" | "onOpenChange"> & { onDone(): void }) {
  const { t, f } = useI18n();
  const tt = t.txnForm;
  const label = useTransactionLabel(loan);
  const addTransaction = useDataStore((s) => s.addTransaction);
  const updateTransaction = useDataStore((s) => s.updateTransaction);

  const others = useMemo(
    () => transactions.filter((tx) => tx.id !== transaction?.id),
    [transactions, transaction?.id],
  );
  const outstanding = loanBalance(others);
  const isRepayment = type === "repayment";
  const borrowed = loan.direction === "borrowed";

  const schema = useMemo(
    () =>
      loanTransactionFormSchema(t.validation, f.number, {
        maxRepayment: isRepayment ? outstanding : undefined,
        minPrincipal: !isRepayment && outstanding < 0 ? -outstanding : undefined,
        minDate: isRepayment ? loanStartDate(others) : undefined,
        money: f.money,
      }),
    [t, f, isRepayment, outstanding, others],
  );

  const { register, control, handleSubmit, setValue, formState } = useForm<LoanTransactionFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      amount: transaction ? String(transaction.amount) : "",
      date: transaction?.date ?? defaultDate,
      note: transaction?.note ?? "",
      countAsExpense: transaction?.countAsExpense ?? false,
    },
  });
  const { errors, isSubmitting } = formState;

  const title = transaction
    ? tt.editTitle(label(type))
    : isRepayment
      ? borrowed
        ? tt.payBack(loan.person)
        : tt.receivedFrom(loan.person)
      : borrowed
        ? tt.borrowMoreFrom(loan.person)
        : tt.lendMoreTo(loan.person);

  async function onSubmit(values: LoanTransactionFormValues) {
    const input = {
      amount: parseAmount(values.amount)!,
      date: values.date,
      note: values.note || undefined,
      countAsExpense: isRepayment && borrowed ? values.countAsExpense : undefined,
    };
    try {
      const change = transaction
        ? await updateTransaction(transaction.id, input)
        : await addTransaction({ ...input, loanId: loan.id, type });
      if (change === "settled") {
        toast.success(t.loanCard.settledToast(loan.person), { description: t.loanCard.settledDesc });
      } else if (change === "reopened") {
        toast.info(t.loanCard.reopened(loan.person), { description: t.loanCard.reopenedDesc });
      } else {
        const amount = f.money(input.amount);
        toast.success(transaction ? tt.updated(amount) : tt.recorded(label(type), amount));
      }
      onDone();
    } catch (e) {
      toast.error(tt.couldntSave, { description: e instanceof Error ? e.message : undefined });
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-5" noValidate>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          {tt.outstanding}
          {transaction ? ` ${tt.excludingThis}` : ""}:{" "}
          <span className="money font-medium text-foreground">{f.money(Math.max(outstanding, 0))}</span>
        </DialogDescription>
      </DialogHeader>

      <FieldGroup className="gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field data-invalid={!!errors.amount}>
            <div className="flex items-center justify-between gap-2">
              <FieldLabel htmlFor="txn-amount">{t.common.amount}</FieldLabel>
              {isRepayment && outstanding > 0 && (
                <button
                  type="button"
                  className="truncate rounded-sm text-xs font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
                  onClick={() => setValue("amount", String(outstanding), { shouldValidate: true })}
                >
                  {tt.full(f.money(outstanding))}
                </button>
              )}
            </div>
            <Input
              id="txn-amount"
              inputMode="decimal"
              placeholder={f.number(0)}
              autoComplete="off"
              autoFocus
              className="money"
              aria-invalid={!!errors.amount}
              {...register("amount")}
            />
            <FieldError errors={[errors.amount]} />
          </Field>
          <Field data-invalid={!!errors.date}>
            <FieldLabel htmlFor="txn-date">{t.common.date}</FieldLabel>
            <Controller
              control={control}
              name="date"
              render={({ field }) => (
                <DatePicker id="txn-date" value={field.value} onChange={field.onChange} invalid={!!errors.date} />
              )}
            />
            <FieldError errors={[errors.date]} />
          </Field>
        </div>

        {isRepayment && borrowed && (
          <Controller
            control={control}
            name="countAsExpense"
            render={({ field }) => (
              <Field orientation="horizontal" className="rounded-lg border bg-muted/40 p-3">
                <Checkbox id="txn-count" checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} />
                <div className="grid gap-0.5">
                  <FieldLabel htmlFor="txn-count" className="font-normal">
                    {tt.countAsExpense}
                  </FieldLabel>
                  <FieldDescription className="text-xs">{tt.countAsExpenseHelp}</FieldDescription>
                </div>
              </Field>
            )}
          />
        )}

        <Field data-invalid={!!errors.note}>
          <FieldLabel htmlFor="txn-note">
            {t.common.note} <span className="font-normal text-muted-foreground">{t.common.optional}</span>
          </FieldLabel>
          <Textarea id="txn-note" rows={2} aria-invalid={!!errors.note} {...register("note")} />
          <FieldError errors={[errors.note]} />
        </Field>
      </FieldGroup>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {t.common.cancel}
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {transaction ? t.common.saveChanges : isRepayment ? tt.record : tt.add}
        </Button>
      </DialogFooter>
    </form>
  );
}
