"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { isAdvance } from "@/lib/calculations";
import { addMonths, isValidISODate, monthOf } from "@/lib/dates";
import { useI18n } from "@/lib/i18n";
import { parseAmount } from "@/lib/money";
import { useDataStore, useViewStore } from "@/lib/store";
import type { Expense, ExpenseInput, ISODate } from "@/lib/types";
import { expenseFormSchema, type ExpenseFormValues } from "@/lib/validation";

type Props = {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Present when editing. */
  expense?: Expense;
  defaultDate: ISODate;
  defaultAdvance?: boolean;
};

export function ExpenseFormDialog({ open, onOpenChange, ...rest }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent sheet className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        {/* Mounted only while open, so each open starts from fresh values. */}
        <ExpenseForm {...rest} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ExpenseForm({
  expense,
  defaultDate,
  defaultAdvance = false,
  onDone,
}: Omit<Props, "open" | "onOpenChange"> & { onDone(): void }) {
  const { t, f } = useI18n();
  const tf = t.expenseForm;
  const addExpense = useDataStore((s) => s.addExpense);
  const updateExpense = useDataStore((s) => s.updateExpense);
  const expenses = useDataStore((s) => s.expenses);
  const viewMonth = useViewStore((s) => s.month);
  const setMonth = useViewStore((s) => s.setMonth);

  const schema = useMemo(() => expenseFormSchema(t.validation, f.number), [t, f]);
  const editingAdvance = expense ? isAdvance(expense) : false;
  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: expense?.title ?? "",
      amount: expense ? String(expense.amount) : "",
      date: expense?.date ?? defaultDate,
      category: expense?.category ?? "",
      note: expense?.note ?? "",
      isAdvance: expense ? editingAdvance : defaultAdvance,
      advanceForMonth:
        (editingAdvance && expense?.advanceForMonth) || addMonths(monthOf(expense?.date ?? defaultDate), 1),
    },
  });
  const { register, control, handleSubmit, setValue, formState } = form;
  const { errors, isSubmitting } = formState;

  const date = useWatch({ control, name: "date" });
  const advance = useWatch({ control, name: "isAdvance" });
  const paidMonth = isValidISODate(date) ? monthOf(date) : monthOf(defaultDate);

  const monthOptions = useMemo(() => {
    const options = Array.from({ length: 12 }, (_, i) => addMonths(paidMonth, i + 1));
    const current = expense?.advanceForMonth;
    if (current && current > paidMonth && !options.includes(current)) options.push(current);
    return options;
  }, [paidMonth, expense?.advanceForMonth]);

  // The user's own categories first, then this language's suggestions.
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const e of expenses) if (e.category) set.add(e.category);
    for (const c of tf.categories) set.add(c);
    return [...set];
  }, [expenses, tf.categories]);

  async function onSubmit(values: ExpenseFormValues) {
    const input: ExpenseInput = {
      title: values.title,
      amount: parseAmount(values.amount)!,
      date: values.date,
      category: values.category || undefined,
      note: values.note || undefined,
      advanceForMonth: values.isAdvance ? values.advanceForMonth : undefined,
    };
    try {
      if (expense) await updateExpense(expense.id, input);
      else await addExpense(input);
    } catch (e) {
      toast.error(tf.couldntSave, { description: e instanceof Error ? e.message : undefined });
      return;
    }

    const where = input.advanceForMonth ? tf.advanceFor(f.monthShort(input.advanceForMonth)) : f.date(input.date);
    const targetMonth = input.advanceForMonth ?? monthOf(input.date);
    const elsewhere = viewMonth !== targetMonth && viewMonth !== monthOf(input.date);
    const amount = f.money(input.amount);
    toast.success(expense ? tf.updated(input.title, amount) : tf.added(input.title, amount), {
      description: where,
      action: elsewhere ? { label: t.common.view, onClick: () => setMonth(monthOf(input.date)) } : undefined,
    });
    onDone();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-5" noValidate>
      <DialogHeader>
        <DialogTitle>{expense ? tf.editTitle : tf.addTitle}</DialogTitle>
        <DialogDescription className="sr-only">{tf.description}</DialogDescription>
      </DialogHeader>

      <FieldGroup className="gap-4">
        <div className="grid grid-cols-[minmax(0,1fr)_8rem] gap-3">
          <Field data-invalid={!!errors.title}>
            <FieldLabel htmlFor="expense-title">{t.common.title}</FieldLabel>
            <Input
              id="expense-title"
              placeholder={tf.titlePlaceholder}
              autoComplete="off"
              autoFocus
              aria-invalid={!!errors.title}
              {...register("title")}
            />
            <FieldError errors={[errors.title]} />
          </Field>
          <Field data-invalid={!!errors.amount}>
            <FieldLabel htmlFor="expense-amount">{t.common.amount}</FieldLabel>
            <Input
              id="expense-amount"
              inputMode="decimal"
              placeholder={f.number(0)}
              autoComplete="off"
              className="money"
              aria-invalid={!!errors.amount}
              {...register("amount")}
            />
            <FieldError errors={[errors.amount]} />
          </Field>
        </div>

        <Field data-invalid={!!errors.date}>
          <FieldLabel htmlFor="expense-date">{advance ? tf.paidOn : t.common.date}</FieldLabel>
          <Controller
            control={control}
            name="date"
            render={({ field }) => (
              <DatePicker
                id="expense-date"
                value={field.value}
                invalid={!!errors.date}
                onChange={(d) => {
                  field.onChange(d);
                  // Keep the advance target ahead of the new paid month.
                  if (form.getValues("advanceForMonth") <= monthOf(d)) {
                    setValue("advanceForMonth", addMonths(monthOf(d), 1));
                  }
                }}
              />
            )}
          />
          <FieldError errors={[errors.date]} />
        </Field>

        <div className="rounded-lg border bg-muted/40 p-3">
          <Controller
            control={control}
            name="isAdvance"
            render={({ field }) => (
              <Field orientation="horizontal">
                <Checkbox
                  id="expense-advance"
                  checked={field.value}
                  onCheckedChange={(c) => field.onChange(c === true)}
                />
                <FieldLabel htmlFor="expense-advance" className="font-normal">
                  {tf.advanceToggle}
                </FieldLabel>
              </Field>
            )}
          />
          {advance && (
            <Field data-invalid={!!errors.advanceForMonth} className="mt-3">
              <FieldLabel htmlFor="expense-target">{tf.belongsTo}</FieldLabel>
              <Controller
                control={control}
                name="advanceForMonth"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="expense-target" className="w-full" aria-invalid={!!errors.advanceForMonth}>
                      <SelectValue placeholder={tf.chooseMonth} />
                    </SelectTrigger>
                    <SelectContent>
                      {monthOptions.map((m) => (
                        <SelectItem key={m} value={m}>
                          {f.month(m)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldDescription className="text-xs">{tf.advanceHelp(f.monthShort(paidMonth))}</FieldDescription>
              <FieldError errors={[errors.advanceForMonth]} />
            </Field>
          )}
        </div>

        <Field data-invalid={!!errors.category}>
          <FieldLabel htmlFor="expense-category">
            {t.common.category} <span className="font-normal text-muted-foreground">{t.common.optional}</span>
          </FieldLabel>
          <Input
            id="expense-category"
            list="expense-categories"
            placeholder={tf.categoryPlaceholder}
            autoComplete="off"
            aria-invalid={!!errors.category}
            {...register("category")}
          />
          <datalist id="expense-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <FieldError errors={[errors.category]} />
        </Field>

        <Field data-invalid={!!errors.note}>
          <FieldLabel htmlFor="expense-note">
            {t.common.note} <span className="font-normal text-muted-foreground">{t.common.optional}</span>
          </FieldLabel>
          <Textarea id="expense-note" rows={2} aria-invalid={!!errors.note} {...register("note")} />
          <FieldError errors={[errors.note]} />
        </Field>
      </FieldGroup>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {t.common.cancel}
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {expense ? t.common.saveChanges : tf.addTitle}
        </Button>
      </DialogFooter>
    </form>
  );
}
