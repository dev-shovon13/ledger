"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckIcon, MoreHorizontalIcon, PencilIcon, SquarePenIcon, Trash2Icon, XIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ExpenseFormDialog } from "@/components/expense-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";
import { parseAmount } from "@/lib/money";
import { useDataStore, usePrefsStore } from "@/lib/store";
import type { Expense } from "@/lib/types";
import { cn } from "@/lib/utils";
import { inlineExpenseSchema, type InlineExpenseValues } from "@/lib/validation";

type Props = {
  expense: Expense;
  /** Extra context shown under the title, e.g. an advance badge. */
  badge?: React.ReactNode;
  muted?: boolean;
};

export function ExpenseRow({ expense, badge, muted }: Props) {
  const { t, f } = useI18n();
  const deleteExpense = useDataStore((s) => s.deleteExpense);
  const justAdded = useDataStore((s) => s.lastAddedExpenseId === expense.id);
  const [editing, setEditing] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function handleDelete() {
    try {
      const sameDay = useDataStore
        .getState()
        .expenses.filter((e) => e.date === expense.date && !e.advanceForMonth);
      await deleteExpense(expense.id);
      // Keep the (now empty) date visible so it can be reused or removed.
      if (!expense.advanceForMonth && sameDay.length === 1) {
        usePrefsStore.getState().addExtraDate(expense.date);
      }
      toast.success(t.row.deleted(expense.title));
    } catch (e) {
      toast.error(t.row.couldntDelete, { description: e instanceof Error ? e.message : undefined });
    }
  }

  return (
    <li className={cn("-mx-2 rounded-md px-2", justAdded && "row-flash")}>
      {editing ? (
        <InlineEdit expense={expense} onDone={() => setEditing(false)} />
      ) : (
        <div className={cn("flex items-start gap-2 py-2.5", muted && "text-muted-foreground")}>
          <button
            type="button"
            className="min-w-0 flex-1 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            onClick={() => setEditing(true)}
            aria-label={t.row.edit(expense.title)}
          >
            <span className="flex items-baseline gap-2">
              <span className="truncate">{expense.title}</span>
              <span
                aria-hidden
                className="mb-1 hidden min-w-4 flex-1 self-end border-b border-dotted border-muted-foreground/30 sm:block"
              />
            </span>
            {(expense.category || badge || expense.note) && (
              <span className="mt-1 flex flex-wrap items-center gap-1.5">
                {expense.category && (
                  <Badge variant="secondary" className="font-normal">
                    {expense.category}
                  </Badge>
                )}
                {badge}
                {expense.note && <span className="line-clamp-1 text-xs text-muted-foreground">{expense.note}</span>}
              </span>
            )}
          </button>
          <span className={cn("money ml-auto pt-px font-medium", !muted && "text-foreground")}>
            {f.money(expense.amount)}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="-my-1 -mr-1 text-muted-foreground"
                aria-label={t.row.actionsFor(expense.title)}
              >
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditing(true)}>
                <PencilIcon /> {t.row.quickEdit}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setDetailsOpen(true)}>
                <SquarePenIcon /> {t.row.editDetails}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirmOpen(true)}>
                <Trash2Icon /> {t.common.delete}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <ExpenseFormDialog open={detailsOpen} onOpenChange={setDetailsOpen} expense={expense} defaultDate={expense.date} />
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t.row.deleteTitle(expense.title)}
        description={t.row.deleteBody(f.money(expense.amount))}
        onConfirm={handleDelete}
      />
    </li>
  );
}

function InlineEdit({ expense, onDone }: { expense: Expense; onDone(): void }) {
  const { t, f } = useI18n();
  const updateExpense = useDataStore((s) => s.updateExpense);
  const schema = useMemo(() => inlineExpenseSchema(t.validation, f.number), [t, f]);
  const { register, handleSubmit, formState } = useForm<InlineExpenseValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: expense.title, amount: String(expense.amount) },
  });
  const { errors, isSubmitting } = formState;

  async function onSubmit(values: InlineExpenseValues) {
    try {
      await updateExpense(expense.id, { title: values.title, amount: parseAmount(values.amount)! });
      onDone();
    } catch (e) {
      toast.error(t.row.couldntSave, { description: e instanceof Error ? e.message : undefined });
    }
  }

  const error = errors.title?.message ?? errors.amount?.message;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onDone();
        }
      }}
      className="py-1.5"
      noValidate
    >
      <div className="flex items-center gap-1.5">
        <Input
          aria-label={t.common.title}
          autoFocus
          autoComplete="off"
          className="h-8 min-w-0 flex-1"
          aria-invalid={!!errors.title}
          {...register("title")}
        />
        <Input
          aria-label={t.common.amount}
          inputMode="decimal"
          autoComplete="off"
          className="money h-8 w-24 text-right"
          aria-invalid={!!errors.amount}
          {...register("amount")}
        />
        <Button type="submit" size="icon-sm" aria-label={t.common.save} disabled={isSubmitting}>
          <CheckIcon />
        </Button>
        <Button type="button" size="icon-sm" variant="ghost" aria-label={t.common.cancel} onClick={onDone}>
          <XIcon />
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
