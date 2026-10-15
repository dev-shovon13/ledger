import { z } from "zod";
import { isValidISODate, isValidISOMonth } from "./dates";

/** Zod schemas for persisted records: used for storage loading and JSON import. */

const isoDate = z.string().refine(isValidISODate, "Invalid date");
const isoMonth = z.string().refine(isValidISOMonth, "Invalid month");
const amount = z.number().finite().positive();

export const expenseSchema = z.object({
  id: z.string().min(1),
  date: isoDate,
  title: z.string().min(1),
  amount,
  category: z.string().optional(),
  note: z.string().optional(),
  advanceForMonth: isoMonth.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const loanSchema = z.object({
  id: z.string().min(1),
  person: z.string().min(1),
  direction: z.enum(["borrowed", "lent"]),
  note: z.string().optional(),
  createdAt: z.string(),
  settledAt: isoDate.optional(),
});

export const loanTransactionSchema = z.object({
  id: z.string().min(1),
  loanId: z.string().min(1),
  date: isoDate,
  type: z.enum(["principal", "repayment"]),
  amount,
  countAsExpense: z.boolean().optional(),
  note: z.string().optional(),
});

export const appDataSchema = z.object({
  expenses: z.array(expenseSchema),
  loans: z.array(loanSchema),
  loanTransactions: z.array(loanTransactionSchema),
});
