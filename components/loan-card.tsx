"use client";

import {
  ArrowDownLeftIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  ChevronDownIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LoanFormDialog } from "@/components/loan-form";
import { LoanTransactionDialog, useTransactionLabel } from "@/components/loan-transaction-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { loanBalance, type LoanView } from "@/lib/calculations";
import { defaultDateFor, lastDayOf, monthOf } from "@/lib/dates";
import { useI18n } from "@/lib/i18n";
import { sumMoney } from "@/lib/money";
import { useDataStore, useViewStore } from "@/lib/store";
import type { LoanTransaction, LoanTransactionType } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * One loan. `withinPerson` is used on a person's page, where their name is
 * already the heading: the card is then titled by direction instead.
 */
export function LoanCard({ view, withinPerson = false }: { view: LoanView; withinPerson?: boolean }) {
  const { loan, statement, transactions, settled } = view;
  const { t, f } = useI18n();
  const tc = t.loanCard;
  const label = useTransactionLabel(loan);
  const month = useViewStore((s) => s.month)!;
  const today = useViewStore((s) => s.today)!;
  const reopenLoan = useDataStore((s) => s.reopenLoan);
  const deleteLoan = useDataStore((s) => s.deleteLoan);

  const [txnDialog, setTxnDialog] = useState<{ type: LoanTransactionType; txn?: LoanTransaction } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const borrowed = loan.direction === "borrowed";
  const monthName = f.monthName(month, "short");

  // Progress as of the end of the viewed month.
  const upToMonth = transactions.filter((tx) => tx.date <= lastDayOf(month));
  const principal = sumMoney(upToMonth.filter((tx) => tx.type === "principal").map((tx) => tx.amount));
  const repaid = sumMoney(upToMonth.filter((tx) => tx.type === "repayment").map((tx) => tx.amount));
  const progress = principal > 0 ? Math.min(100, Math.round((repaid / principal) * 100)) : 0;

  async function handleReopen() {
    try {
      await reopenLoan(loan.id);
      toast.success(tc.reopenedManual(loan.person));
    } catch (e) {
      toast.error(tc.couldntReopen, { description: e instanceof Error ? e.message : undefined });
    }
  }

  return (
    <Card className={cn("gap-0 py-0", settled && "bg-muted/30 shadow-none")}>
      <div className="flex items-start gap-3 px-4 pt-4">
        <div
          aria-hidden
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
            borrowed ? "bg-negative/10 text-negative" : "bg-positive/10 text-positive",
          )}
        >
          {withinPerson ? (
            borrowed ? <ArrowDownLeftIcon className="size-4" /> : <ArrowUpRightIcon className="size-4" />
          ) : (
            loan.person.charAt(0).toUpperCase()
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-semibold">{withinPerson ? label("principal") : loan.person}</h3>
            {settled && <Badge variant="secondary">{tc.settled}</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">
            {view.startDate ? tc.since(f.date(view.startDate)) : "—"}
            {settled && loan.settledAt && ` · ${tc.settledOn(f.date(loan.settledAt))}`}
          </p>
          {loan.note && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{loan.note}</p>}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="-mt-1 -mr-1 text-muted-foreground"
              aria-label={tc.actionsFor(loan.person)}
            >
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {!settled && (
              <DropdownMenuItem onSelect={() => setTxnDialog({ type: "repayment" })}>
                <ArrowRightIcon /> {tc.recordAction(label("repayment"))}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => setTxnDialog({ type: "principal" })}>
              <PlusIcon /> {borrowed ? tc.borrowMore : tc.lendMore}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setEditOpen(true)}>
              <PencilIcon /> {tc.editNameNote}
            </DropdownMenuItem>
            {loan.settledAt && (
              <DropdownMenuItem onSelect={handleReopen}>
                <RotateCcwIcon /> {tc.reopen}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
              <Trash2Icon /> {tc.deleteLoan}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Opening → activity → closing for the viewed month */}
      <dl className="mx-4 mt-4 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-x-1 rounded-lg bg-muted/50 px-3 py-2.5 text-center">
        <Figure label={tc.opening} value={f.money(statement.opening)} />
        <ArrowRightIcon aria-hidden className="size-3.5 text-muted-foreground" />
        <Figure
          label={borrowed ? tc.paidBackIn(monthName) : tc.receivedIn(monthName)}
          value={statement.repaid > 0 ? `−${f.money(statement.repaid)}` : f.money(0)}
          className={statement.repaid > 0 ? "text-positive" : "text-muted-foreground"}
        />
        <ArrowRightIcon aria-hidden className="size-3.5 text-muted-foreground" />
        <Figure label={tc.closing} value={f.money(statement.closing)} strong />
      </dl>
      {statement.added > 0 && (
        <p className="mx-4 mt-1.5 text-xs text-muted-foreground">{tc.addedThisMonth(f.money(statement.added), borrowed)}</p>
      )}

      {principal > 0 && (
        <div className="mx-4 mt-3">
          <div
            className="h-1.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={tc.repaidLabel}
          >
            <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {tc.progress(f.number(progress), f.money(principal), borrowed)}
          </p>
        </div>
      )}

      <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
        <div className="mt-3 flex items-center gap-2 border-t px-4 py-2.5">
          {!settled ? (
            <Button size="sm" onClick={() => setTxnDialog({ type: "repayment" })}>
              {borrowed ? tc.recordRepayment : tc.recordReceived}
            </Button>
          ) : (
            loan.settledAt && (
              <Button size="sm" variant="outline" onClick={handleReopen}>
                <RotateCcwIcon /> {tc.reopen}
              </Button>
            )
          )}
          <CollapsibleTrigger asChild>
            <Button size="sm" variant="ghost" className="ml-auto text-muted-foreground">
              {tc.history(f.number(transactions.length))}
              <ChevronDownIcon className={cn("transition-transform", historyOpen && "rotate-180")} />
            </Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <TransactionHistory view={view} onEdit={(txn) => setTxnDialog({ type: txn.type, txn })} />
        </CollapsibleContent>
      </Collapsible>

      {txnDialog && (
        <LoanTransactionDialog
          open
          onOpenChange={(o) => !o && setTxnDialog(null)}
          loan={loan}
          transactions={transactions}
          type={txnDialog.type}
          transaction={txnDialog.txn}
          defaultDate={defaultDateFor(month, today)}
        />
      )}
      <LoanFormDialog open={editOpen} onOpenChange={setEditOpen} loan={loan} defaultDate={today} />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={tc.deleteLoanTitle(loan.person)}
        description={tc.deleteLoanBody(f.number(transactions.length))}
        confirmLabel={tc.deleteLoan}
        onConfirm={async () => {
          try {
            await deleteLoan(loan.id);
            toast.success(tc.deletedLoan(loan.person));
          } catch (e) {
            toast.error(tc.couldntDelete, { description: e instanceof Error ? e.message : undefined });
          }
        }}
      />
    </Card>
  );
}

function Figure({ label, value, strong, className }: { label: string; value: string; strong?: boolean; className?: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[11px] text-muted-foreground">{label}</dt>
      <dd className={cn("money truncate text-sm font-medium", strong && "text-base font-semibold", className)}>{value}</dd>
    </div>
  );
}

function TransactionHistory({ view, onEdit }: { view: LoanView; onEdit(txn: LoanTransaction): void }) {
  const { loan, transactions } = view;
  const { t, f } = useI18n();
  const tc = t.loanCard;
  const label = useTransactionLabel(loan);
  const month = useViewStore((s) => s.month);
  const deleteTransaction = useDataStore((s) => s.deleteTransaction);
  const [toDelete, setToDelete] = useState<LoanTransaction | null>(null);

  const principalCount = transactions.filter((tx) => tx.type === "principal").length;

  function blockReason(txn: LoanTransaction): string | null {
    if (txn.type !== "principal") return null;
    if (principalCount === 1) return tc.originalAmountReason;
    if (loanBalance(transactions.filter((tx) => tx.id !== txn.id)) < 0) return tc.negativeReason;
    return null;
  }

  return (
    <>
      <ul className="divide-y border-t text-sm">
        {[...transactions].reverse().map((tx) => {
          const inMonth = monthOf(tx.date) === month;
          return (
            <li key={tx.id} className={cn("flex items-start gap-3 px-4 py-2", inMonth && "bg-primary/5")}>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium">{label(tx.type)}</span>
                  <span className="text-xs text-muted-foreground">{f.date(tx.date)}</span>
                  {tx.countAsExpense && (
                    <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                      {tc.countedAsExpense}
                    </Badge>
                  )}
                </p>
                {tx.note && <p className="line-clamp-2 text-xs text-muted-foreground">{tx.note}</p>}
              </div>
              <span className={cn("money font-medium", tx.type === "repayment" && "text-positive")}>
                {tx.type === "repayment" ? "−" : "+"}
                {f.money(tx.amount)}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-xs" className="text-muted-foreground" aria-label={tc.transactionActions}>
                    <MoreHorizontalIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => onEdit(tx)}>
                    <PencilIcon /> {t.common.edit}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => {
                      const reason = blockReason(tx);
                      if (reason) toast.error(tc.cantDelete, { description: reason });
                      else setToDelete(tx);
                    }}
                  >
                    <Trash2Icon /> {t.common.delete}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={tc.deleteEntryTitle}
        description={toDelete && tc.deleteEntryBody(label(toDelete.type), f.money(toDelete.amount), f.date(toDelete.date))}
        onConfirm={async () => {
          if (!toDelete) return;
          try {
            const change = await deleteTransaction(toDelete.id);
            if (change === "reopened") toast.info(tc.reopened(loan.person));
            else if (change === "settled") toast.success(tc.settledToast(loan.person));
            else toast.success(tc.entryDeleted);
          } catch (e) {
            toast.error(tc.couldntDelete, { description: e instanceof Error ? e.message : undefined });
          }
        }}
      />
    </>
  );
}
