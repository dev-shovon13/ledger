import type { Locale } from "./types";

/**
 * Amounts are stored as major units (e.g. 20.5 taka) but all arithmetic goes
 * through integer minor units (paisa/cents) so sums never drift
 * (0.1 + 0.2 === 0.3 here).
 */

export function toMinor(amount: number): number {
  return Math.round(amount * 100);
}

export function fromMinor(minor: number): number {
  return minor / 100;
}

/** Round an arbitrary number to a storable 2-decimal amount. */
export function roundMoney(amount: number): number {
  return fromMinor(toMinor(amount));
}

export function sumMoney(amounts: Iterable<number>): number {
  let total = 0;
  for (const a of amounts) total += toMinor(a);
  return fromMinor(total);
}

export function subtractMoney(a: number, b: number): number {
  return fromMinor(toMinor(a) - toMinor(b));
}

/** Bangla digits (০–৯) to ASCII, so "২০" and "20" are the same input. */
export function normalizeDigits(input: string): string {
  return input.replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6));
}

/** Parse user input like "1,250.50" or "১,২৫০" into a positive amount, or null. */
export function parseAmount(input: string): number | null {
  const cleaned = normalizeDigits(input).replace(/[,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned) && !/^\.\d{1,2}$/.test(cleaned)) {
    return null;
  }
  const value = roundMoney(Number(cleaned));
  return value > 0 ? value : null;
}

/** en-IN and bn-BD both group as 1,00,000, which is what BDT users expect. */
const NUMBER_LOCALE: Record<Locale, string> = { en: "en-IN", bn: "bn-BD" };
const formatters = new Map<string, Intl.NumberFormat>();

function getFormatter(locale: Locale, fractionDigits: number) {
  const key = `${locale}:${fractionDigits}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(NUMBER_LOCALE[locale], {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    formatters.set(key, f);
  }
  return f;
}

export function formatAmount(amount: number, locale: Locale = "en"): string {
  const minor = toMinor(amount);
  const hasFraction = minor % 100 !== 0;
  return getFormatter(locale, hasFraction ? 2 : 0).format(Math.abs(fromMinor(minor)));
}

/** Whole numbers (counts, percentages, days) in the locale's digits. */
export function formatNumber(value: number, locale: Locale = "en"): string {
  return getFormatter(locale, 0).format(value);
}

export function formatMoney(
  amount: number,
  currency: string,
  opts: { signed?: boolean; locale?: Locale } = {},
): string {
  const negative = toMinor(amount) < 0;
  const sign = negative ? "−" : opts.signed && amount > 0 ? "+" : "";
  return `${sign}${currency}${formatAmount(amount, opts.locale)}`;
}
