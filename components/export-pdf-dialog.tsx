"use client";

import { FileDownIcon, Loader2Icon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addMonths } from "@/lib/dates";
import { useI18n } from "@/lib/i18n";
import { buildExpenseReport, reportableMonths } from "@/lib/report";
import { useDataStore, usePrefsStore, useViewStore } from "@/lib/store";
import type { ISOMonth } from "@/lib/types";

type Props = { open: boolean; onOpenChange(open: boolean): void };

export function ExportPdfDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent sheet className="sm:max-w-md">
        {/* Mounted only while open so the range resets to the viewed month. */}
        <ExportForm onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ExportForm({ onDone }: { onDone(): void }) {
  const { t, f, locale } = useI18n();
  const tp = t.pdfDialog;
  const month = useViewStore((s) => s.month)!;
  const today = useViewStore((s) => s.today)!;
  const expenses = useDataStore((s) => s.expenses);
  const loans = useDataStore((s) => s.loans);
  const transactions = useDataStore((s) => s.transactions);
  const currency = usePrefsStore((s) => s.currency);

  const [from, setFrom] = useState<ISOMonth>(month);
  const [to, setTo] = useState<ISOMonth>(month);
  const [busy, setBusy] = useState(false);

  const options = useMemo(
    () => reportableMonths(expenses, transactions, month).reverse(),
    [expenses, transactions, month],
  );
  const report = useMemo(
    () => buildExpenseReport({ expenses, loans, transactions, today, from, to }),
    [expenses, loans, transactions, today, from, to],
  );
  const itemCount = report.months.reduce(
    (n, m) => n + m.days.reduce((d, g) => d + g.expenses.length, 0) + m.advancesIn.length,
    0,
  );

  const presets: { label: string; from: ISOMonth; to: ISOMonth }[] = [
    { label: tp.thisMonth, from: month, to: month },
    { label: tp.last3, from: addMonths(month, -2), to: month },
    { label: tp.year(f.year(month)), from: `${month.slice(0, 4)}-01`, to: `${month.slice(0, 4)}-12` },
  ];

  async function download() {
    setBusy(true);
    try {
      const { downloadExpensePdf } = await import("@/lib/pdf/expense-pdf");
      await downloadExpensePdf(report, { currency, locale });
      toast.success(tp.downloaded);
      onDone();
    } catch (e) {
      toast.error(tp.failed, { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{tp.title}</DialogTitle>
        <DialogDescription>{tp.description}</DialogDescription>
      </DialogHeader>

      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <Button
            key={p.label}
            type="button"
            size="sm"
            variant={from === p.from && to === p.to ? "default" : "outline"}
            aria-pressed={from === p.from && to === p.to}
            onClick={() => {
              setFrom(p.from);
              setTo(p.to);
            }}
          >
            {p.label}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <MonthSelect id="pdf-from" label={tp.from} value={from} options={options} onChange={setFrom} />
        <MonthSelect id="pdf-to" label={tp.to} value={to} options={options} onChange={setTo} />
      </div>

      <p className="rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
        {tp.summary(
          f.number(report.months.length),
          report.months.length === 1,
          f.number(itemCount),
          itemCount === 1,
        )}{" "}
        <span className="money font-medium text-foreground">{f.money(report.grandTotal)}</span>
      </p>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={busy}>
          {t.common.cancel}
        </Button>
        <Button type="button" onClick={download} disabled={busy}>
          {busy ? <Loader2Icon className="animate-spin" /> : <FileDownIcon />}
          {tp.download}
        </Button>
      </DialogFooter>
    </>
  );
}

function MonthSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: ISOMonth;
  options: ISOMonth[];
  onChange(m: ISOMonth): void;
}) {
  // Presets can pick months outside the data range; keep them selectable.
  const { f } = useI18n();
  const all = options.includes(value) ? options : [...options, value].sort().reverse();
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {all.map((m) => (
            <SelectItem key={m} value={m}>
              {f.month(m)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
