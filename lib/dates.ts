import type { ISODate, ISOMonth, Locale } from "./types";

/*
 * All dates are plain calendar strings. We never parse "YYYY-MM-DD" with
 * `new Date(str)` because that is UTC and shifts the day in UTC+6.
 */

const pad = (n: number) => String(n).padStart(2, "0");

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISODate(date: ISODate): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(): ISODate {
  return toISODate(new Date());
}

export function monthOf(date: ISODate): ISOMonth {
  return date.slice(0, 7);
}

export function addMonths(month: ISOMonth, delta: number): ISOMonth {
  const [y, m] = month.split("-").map(Number);
  const index = y * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
}

export function daysInMonth(month: ISOMonth): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

export function firstDayOf(month: ISOMonth): ISODate {
  return `${month}-01`;
}

export function lastDayOf(month: ISOMonth): ISODate {
  return `${month}-${pad(daysInMonth(month))}`;
}

/** Today when it falls in `month`, otherwise the 1st of that month. */
export function defaultDateFor(month: ISOMonth, today: ISODate): ISODate {
  return monthOf(today) === month ? today : firstDayOf(month);
}

export function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return toISODate(parseISODate(value)) === value;
}

export function isValidISOMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** Intl tag per app locale. bn-BD writes Bangla digits (১৫ অক্টো, ২০২৬). */
const DATE_LOCALE: Record<Locale, string> = { en: "en-GB", bn: "bn-BD" };

function fmt(date: ISODate, locale: Locale, options: Intl.DateTimeFormatOptions) {
  // Bangla month abbreviations (অক্টো, সেপ) read unnaturally; always spell
  // the month out in Bangla.
  const opts = locale === "bn" && options.month === "short" ? { ...options, month: "long" as const } : options;
  return parseISODate(date).toLocaleDateString(DATE_LOCALE[locale], opts);
}

/** "15 Oct 2026" · "১৫ অক্টোবর, ২০২৬" */
export function formatDate(date: ISODate, locale: Locale = "en"): string {
  return fmt(date, locale, { day: "numeric", month: "short", year: "numeric" });
}

/** "15 Oct" · "১৫ অক্টোবর" */
export function formatDayMonth(date: ISODate, locale: Locale = "en"): string {
  return fmt(date, locale, { day: "numeric", month: "short" });
}

/** "Thursday" · "বৃহস্পতিবার" */
export function formatWeekday(date: ISODate, locale: Locale = "en"): string {
  return fmt(date, locale, { weekday: "long" });
}

/** "October 2026" · "অক্টোবর ২০২৬" */
export function formatMonth(month: ISOMonth, locale: Locale = "en"): string {
  return fmt(firstDayOf(month), locale, { month: "long", year: "numeric" });
}

/** "Oct 2026" · "অক্টোবর ২০২৬" */
export function formatMonthShort(month: ISOMonth, locale: Locale = "en"): string {
  return fmt(firstDayOf(month), locale, { month: "short", year: "numeric" });
}

/** Month name only: "October" / "Oct" · always "অক্টোবর" */
export function formatMonthName(
  month: ISOMonth,
  locale: Locale = "en",
  width: "long" | "short" = "long",
): string {
  return fmt(firstDayOf(month), locale, { month: width });
}

/** "2026" · "২০২৬" */
export function formatYear(month: ISOMonth, locale: Locale = "en"): string {
  return fmt(firstDayOf(month), locale, { year: "numeric" });
}
