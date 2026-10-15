"use client";

/**
 * Client-side PDF export. jsPDF, the table plugin and the font are loaded
 * only when the user downloads, so they add nothing to the normal bundle.
 *
 * The standard PDF fonts can't draw "৳" or Bengali, so we embed "Ledger PDF":
 * Noto Sans + Noto Sans Bengali merged into one file (OFL, public/fonts; built
 * by scripts/build-pdf-fonts.py), covering Latin, Bengali and ৳ $ € £ ₹. The
 * report follows the app language.
 */
import type { jsPDF } from "jspdf";
import type { Cell, CellInput, RowInput, UserOptions } from "jspdf-autotable";
import { todayISO } from "../dates";
import { createFormatter, MESSAGES, type Formatter, type Messages } from "../i18n";
import type { ExpenseReport, MonthReport } from "../report";
import type { Locale } from "../types";
import { drawShapedLines, drawShapedText, loadCanvasFonts, needsShaping } from "./complex-text";

const FONT = "LedgerPdf";
const FONT_FILES = {
  normal: "/fonts/LedgerPdf-Regular.ttf",
  bold: "/fonts/LedgerPdf-SemiBold.ttf",
} as const;

type RGB = [number, number, number];

const MARGIN = 14;
const INK: RGB = [23, 23, 23];
const MUTED: RGB = [115, 115, 115];
const LINE: RGB = [226, 226, 226];
const ACCENT: RGB = [17, 110, 100];
const BAND: RGB = [243, 246, 245];

let fontCache: Promise<Record<keyof typeof FONT_FILES, string>> | null = null;

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function loadFonts() {
  fontCache ??= (async () => {
    const entries = await Promise.all(
      Object.entries(FONT_FILES).map(async ([style, url]) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Could not load PDF font (${res.status}).`);
        return [style, toBase64(await res.arrayBuffer())] as const;
      }),
    );
    return Object.fromEntries(entries) as Record<keyof typeof FONT_FILES, string>;
  })().catch((e) => {
    fontCache = null; // allow a retry
    throw e;
  });
  return fontCache;
}

export function reportFileName(report: ExpenseReport): string {
  return report.from === report.to
    ? `expenses-${report.from}.pdf`
    : `expenses-${report.from}-to-${report.to}.pdf`;
}

export async function downloadExpensePdf(
  report: ExpenseReport,
  opts: { currency: string; locale: Locale },
): Promise<void> {
  const [{ jsPDF }, { autoTable }, fonts] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
    loadFonts(),
    loadCanvasFonts(),
  ]);

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  for (const [style, data] of Object.entries(fonts)) {
    const file = `${FONT}-${style}.ttf`;
    doc.addFileToVFS(file, data);
    doc.addFont(file, FONT, style);
  }
  doc.setFont(FONT, "normal");

  const t = MESSAGES[opts.locale].pdf;
  const f = createFormatter(opts.locale, opts.currency);
  doc.setProperties({ title: `${t.reportTitle} · ${rangeLabel(report, t, f)}`, creator: "Ledger" });

  new ReportWriter(doc, autoTable, t, f).write(report);
  doc.save(reportFileName(report));
}

type PdfMessages = Messages["pdf"];

function rangeLabel(report: ExpenseReport, t: PdfMessages, f: Formatter) {
  return report.from === report.to ? f.month(report.from) : t.range(f.month(report.from), f.month(report.to));
}

type AutoTable = (doc: jsPDF, options: UserOptions) => void;

class ReportWriter {
  private y = MARGIN;
  private readonly pageWidth: number;
  private readonly pageHeight: number;

  constructor(
    private readonly doc: jsPDF,
    private readonly autoTable: AutoTable,
    private readonly t: PdfMessages,
    private readonly f: Formatter,
  ) {
    this.pageWidth = doc.internal.pageSize.getWidth();
    this.pageHeight = doc.internal.pageSize.getHeight();
  }

  write(report: ExpenseReport) {
    this.title(report);
    const multi = report.months.length > 1;
    if (multi) this.overview(report);
    // Empty months are covered by the overview; skip their detail pages.
    const detailed = multi ? report.months.filter(hasContent) : report.months;
    for (const m of detailed) {
      if (multi) this.newPage();
      this.month(m, multi);
    }
    this.footers();
  }

  // -- layout helpers ------------------------------------------------------

  private newPage() {
    this.doc.addPage();
    this.y = MARGIN;
  }

  private ensureSpace(mm: number) {
    if (this.y + mm > this.pageHeight - MARGIN - 8) this.newPage();
  }

  /** One line of text at the cursor; shaped through the browser when needed. */
  private text(value: string, opts: { size: number; bold?: boolean; color?: RGB; x?: number; align?: "left" | "right" }) {
    const x = opts.x ?? MARGIN;
    if (needsShaping(value)) {
      drawShapedText(this.doc, value, { x, y: this.y, sizePt: opts.size, bold: opts.bold, color: opts.color ?? INK, align: opts.align });
      return;
    }
    this.doc.setFont(FONT, opts.bold ? "bold" : "normal");
    this.doc.setFontSize(opts.size);
    this.doc.setTextColor(...(opts.color ?? INK));
    this.doc.text(value, x, this.y, { align: opts.align ?? "left", baseline: "top" });
  }

  private table(options: Omit<UserOptions, "startY" | "margin">) {
    const { didParseCell, ...rest } = options;
    // Cells whose text needs browser shaping (see complex-text.ts).
    const shaped = new WeakMap<Cell, string[]>();
    this.autoTable(this.doc, {
      theme: "plain",
      startY: this.y,
      margin: { left: MARGIN, right: MARGIN, bottom: MARGIN + 8 },
      rowPageBreak: "avoid",
      // Totals belong under the last rows, not stranded on an earlier page.
      showFoot: "lastPage",
      styles: {
        font: FONT,
        fontSize: 9.5,
        textColor: INK,
        cellPadding: { top: 1.6, bottom: 1.6, left: 2, right: 2 },
        lineColor: LINE,
      },
      headStyles: { fontStyle: "bold", textColor: MUTED, fontSize: 8.5, lineWidth: { bottom: 0.3 } },
      footStyles: { fontStyle: "bold", lineWidth: { top: 0.3 } },
      bodyStyles: { lineWidth: { bottom: 0.1 } },
      ...rest,
      didParseCell: (data) => {
        // Head/foot cells don't inherit columnStyles; align amounts with the body.
        const col = rest.columnStyles?.[data.column.index];
        if (data.section !== "body" && col?.halign) data.cell.styles.halign = col.halign;
        didParseCell?.(data);
      },
      willDrawCell: (data) => {
        const lines = data.cell.text;
        if (lines.some(needsShaping)) {
          shaped.set(data.cell, [...lines]);
          data.cell.text = lines.map(() => "");
        }
      },
      didDrawCell: (data) => {
        const lines = shaped.get(data.cell);
        if (lines) drawShapedLines(this.doc, data.cell, lines);
      },
    });
    const last = (this.doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable;
    this.y = (last?.finalY ?? this.y) + 7;
  }

  private section(title: string, note?: string) {
    // Room for the heading plus a table's header, first row and total, so a
    // section never starts with only its title at the bottom of a page.
    this.ensureSpace(note ? 40 : 34);
    this.text(title, { size: 11.5, bold: true });
    this.y += 6.5;
    if (note) {
      this.text(note, { size: 8.5, color: MUTED });
      this.y += 5.5;
    }
  }

  // -- content -------------------------------------------------------------

  private title(report: ExpenseReport) {
    const { t, f } = this;
    this.doc.setFillColor(...ACCENT);
    this.doc.rect(0, 0, this.pageWidth, 2.5, "F");
    this.y = MARGIN;
    this.text(t.reportTitle, { size: 20, bold: true });
    this.text(t.generated(f.date(todayISO())), { size: 8.5, color: MUTED, x: this.pageWidth - MARGIN, align: "right" });
    this.y += 10;
    this.text(rangeLabel(report, t, f), { size: 12, color: ACCENT });
    this.y += 7;
    this.text(t.totalSpent(f.money(report.grandTotal)), { size: 11, bold: true });
    this.y += 11;
  }

  private overview(report: ExpenseReport) {
    const { t, f } = this;
    this.section(t.overview);
    this.table({
      head: [[t.month, t.daily, t.paidInAdvance, t.loanRepayments, t.total]],
      body: report.months.map((r) => [
        f.month(r.month),
        f.money(r.summary.dailySubtotal),
        f.money(r.summary.advancesIn),
        f.money(r.summary.loanRepayments),
        { content: f.money(r.summary.grandTotal), styles: { fontStyle: "bold" } },
      ]),
      foot: [[t.total, "", "", "", f.money(report.grandTotal)]],
      columnStyles: amountColumns([1, 2, 3, 4]),
    });
  }

  private month(r: MonthReport, withHeading: boolean) {
    const { t, f } = this;
    const m = f.money;
    const s = r.summary;

    if (withHeading) {
      this.text(f.month(r.month), { size: 15, bold: true });
      this.text(m(s.grandTotal), { size: 15, bold: true, x: this.pageWidth - MARGIN, align: "right" });
      this.y += 10;
    }

    this.table({
      body: [
        [t.dailyExpenses, m(s.dailySubtotal), t.avgPerDay, `${m(s.averagePerDay)}  (${t.overDays(f.number(s.daysCounted))})`],
        [
          t.paidInAdvanceForMonth,
          m(s.advancesIn),
          t.highestDay,
          s.highestDay ? `${m(s.highestDay.total)}  (${f.date(s.highestDay.date)})` : "—",
        ],
        [t.loanRepaymentsCounted, m(s.loanRepayments), "", ""],
        [
          { content: t.grandTotal, styles: { fontStyle: "bold" } },
          { content: m(s.grandTotal), styles: { fontStyle: "bold" } },
          "",
          "",
        ],
      ],
      bodyStyles: { lineWidth: 0, fillColor: BAND },
      columnStyles: {
        0: { textColor: MUTED, cellWidth: 56 },
        1: { halign: "right", cellWidth: 30 },
        2: { textColor: MUTED, cellWidth: 38 },
      },
    });

    this.section(t.dailyExpenses);
    if (r.days.length === 0) {
      this.text(t.noDaily, { size: 9.5, color: MUTED });
      this.y += 9;
    } else {
      const body: RowInput[] = [];
      for (const day of r.days) {
        body.push([
          {
            content: `${f.date(day.date)}  ·  ${f.weekday(day.date)}`,
            colSpan: 2,
            styles: { fontStyle: "bold", fillColor: BAND },
          },
          { content: m(day.total), styles: { fontStyle: "bold", fillColor: BAND, halign: "right" } },
        ]);
        for (const e of day.expenses) {
          body.push([itemCell(e.title, e.note), e.category ?? "", m(e.amount)]);
        }
      }
      this.table({
        head: [[t.item, t.category, t.amount]],
        body,
        foot: [[t.dailyTotal, "", m(s.dailySubtotal)]],
        columnStyles: { 1: { cellWidth: 40, textColor: MUTED }, 2: { cellWidth: 32, halign: "right" } },
      });
    }

    if (r.advancesIn.length > 0) {
      this.section(t.paidInAdvance, t.paidInAdvanceNote(f.monthShort(r.month)));
      this.table({
        head: [[t.paidOn, t.item, t.category, t.amount]],
        body: r.advancesIn.map((e) => [f.date(e.date), itemCell(e.title, e.note), e.category ?? "", m(e.amount)]),
        foot: [["", "", t.total, m(s.advancesIn)]],
        columnStyles: { 0: { cellWidth: 36 }, 2: { cellWidth: 34, textColor: MUTED }, 3: { cellWidth: 32, halign: "right" } },
      });
    }

    if (r.loanRepayments.length > 0) {
      this.section(t.loanRepaymentsTitle);
      this.table({
        head: [[t.date, t.paidTo, t.note, t.amount]],
        body: r.loanRepayments.map((l) => [f.date(l.date), l.person, l.note ?? "", m(l.amount)]),
        foot: [["", "", t.total, m(s.loanRepayments)]],
        columnStyles: { 0: { cellWidth: 36 }, 2: { textColor: MUTED }, 3: { cellWidth: 32, halign: "right" } },
      });
    }

    if (r.advancesOut.length > 0) {
      this.section(t.advancesOutTitle, t.advancesOutNote(f.monthShort(r.month)));
      this.table({
        head: [[t.paidOn, t.item, t.countsIn, t.amount]],
        body: r.advancesOut.map((e) => [
          f.date(e.date),
          itemCell(e.title, e.note),
          f.monthShort(e.advanceForMonth!),
          m(e.amount),
        ]),
        foot: [["", "", t.total, m(s.advancesOut)]],
        styles: {
          font: FONT,
          fontSize: 9.5,
          textColor: MUTED,
          cellPadding: { top: 1.6, bottom: 1.6, left: 2, right: 2 },
          lineColor: LINE,
        },
        columnStyles: { 0: { cellWidth: 36 }, 2: { cellWidth: 34 }, 3: { cellWidth: 32, halign: "right" } },
      });
    }
  }

  private footers() {
    const { t, f } = this;
    const pages = this.doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      this.doc.setPage(i);
      this.y = this.pageHeight - MARGIN;
      this.doc.setDrawColor(...LINE);
      this.doc.setLineWidth(0.2);
      this.doc.line(MARGIN, this.y - 2, this.pageWidth - MARGIN, this.y - 2);
      this.text(t.footer, { size: 8, color: MUTED });
      this.text(t.page(f.number(i), f.number(pages)), { size: 8, color: MUTED, x: this.pageWidth - MARGIN, align: "right" });
    }
  }
}

function hasContent(r: MonthReport): boolean {
  return r.days.length > 0 || r.advancesIn.length > 0 || r.advancesOut.length > 0 || r.loanRepayments.length > 0;
}

function itemCell(title: string, note?: string): CellInput {
  return note ? `${title}\n${note}` : title;
}

function amountColumns(indexes: number[]): UserOptions["columnStyles"] {
  return Object.fromEntries(indexes.map((i) => [i, { halign: "right" as const }]));
}
