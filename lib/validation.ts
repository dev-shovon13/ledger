import { z } from "zod";
import { isValidISODate, isValidISOMonth, monthOf } from "./dates";
import type { Messages } from "./i18n/messages/en";
import { parseAmount } from "./money";

/*
 * Form schemas. They are built per language (messages come from the active
 * dictionary). Amounts stay strings while editing so "12." isn't mangled,
 * and are converted with parseAmount on submit; Bangla digits are accepted.
 */

type V = Messages["validation"];
/** Formats numbers in messages with the active locale's digits. */
type NumberFormat = (n: number) => string;

const amountField = (v: V) =>
  z.string().trim().min(1, v.amountRequired).refine((s) => parseAmount(s) !== null, v.amountInvalid);

const dateField = (v: V) => z.string().refine(isValidISODate, v.pickDate);

const text = (v: V, max: number, num: NumberFormat) => z.string().trim().max(max, v.tooLong(num(max)));

export function expenseFormSchema(v: V, num: NumberFormat) {
  return z
    .object({
      title: z.string().trim().min(1, v.titleRequired).max(80, v.tooLong(num(80))),
      amount: amountField(v),
      date: dateField(v),
      category: text(v, 40, num),
      note: text(v, 500, num),
      isAdvance: z.boolean(),
      advanceForMonth: z.string(),
    })
    .superRefine((value, ctx) => {
      if (!value.isAdvance) return;
      if (!isValidISOMonth(value.advanceForMonth)) {
        ctx.addIssue({ code: "custom", path: ["advanceForMonth"], message: v.chooseMonth });
      } else if (isValidISODate(value.date) && value.advanceForMonth <= monthOf(value.date)) {
        ctx.addIssue({ code: "custom", path: ["advanceForMonth"], message: v.monthAfterPaid });
      }
    });
}

export type ExpenseFormValues = z.infer<ReturnType<typeof expenseFormSchema>>;

export function inlineExpenseSchema(v: V, num: NumberFormat) {
  return z.object({
    title: z.string().trim().min(1, v.titleRequired).max(80, v.tooLong(num(80))),
    amount: amountField(v),
  });
}

export type InlineExpenseValues = z.infer<ReturnType<typeof inlineExpenseSchema>>;

export function loanFormSchema(v: V, num: NumberFormat, opts: { editing?: boolean } = {}) {
  return z.object({
    direction: z.enum(["borrowed", "lent"]),
    person: z.string().trim().min(1, v.nameRequired).max(60, v.tooLong(num(60))),
    // Amount and date only matter when creating; edits change name/note.
    amount: opts.editing ? z.string() : amountField(v),
    date: opts.editing ? z.string() : dateField(v),
    note: text(v, 500, num),
  });
}

export type LoanFormValues = z.infer<ReturnType<typeof loanFormSchema>>;

/** Built per use because the limits depend on the loan's current balance. */
export function loanTransactionFormSchema(
  v: V,
  num: NumberFormat,
  opts: {
    /** Max for a repayment: outstanding balance excluding the edited txn. */
    maxRepayment?: number;
    /** Min for a principal: keeps the balance from going negative. */
    minPrincipal?: number;
    minDate?: string;
    /** Formats amounts in error messages. */
    money: (amount: number) => string;
  },
) {
  return z
    .object({
      amount: amountField(v),
      date: dateField(v),
      note: text(v, 500, num),
      countAsExpense: z.boolean(),
    })
    .superRefine((value, ctx) => {
      const amount = parseAmount(value.amount);
      if (amount !== null && opts.maxRepayment !== undefined && amount > opts.maxRepayment) {
        ctx.addIssue({ code: "custom", path: ["amount"], message: v.maxOutstanding(opts.money(opts.maxRepayment)) });
      }
      if (amount !== null && opts.minPrincipal !== undefined && amount < opts.minPrincipal) {
        ctx.addIssue({ code: "custom", path: ["amount"], message: v.minPrincipal(opts.money(opts.minPrincipal)) });
      }
      if (opts.minDate && isValidISODate(value.date) && value.date < opts.minDate) {
        ctx.addIssue({ code: "custom", path: ["date"], message: v.beforeLoanStart });
      }
    });
}

export type LoanTransactionFormValues = z.infer<ReturnType<typeof loanTransactionFormSchema>>;
