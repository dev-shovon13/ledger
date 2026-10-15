"use client";

import { useMemo } from "react";
import {
  formatDate,
  formatDayMonth,
  formatMonth,
  formatMonthName,
  formatMonthShort,
  formatWeekday,
  formatYear,
} from "../dates";
import { formatMoney, formatNumber } from "../money";
import { usePrefsStore } from "../store";
import type { ISODate, ISOMonth, Locale } from "../types";
import { bn } from "./messages/bn";
import { en, type Messages } from "./messages/en";

export type { Messages };

export const MESSAGES: Record<Locale, Messages> = { en, bn };

/** Each language's own name, shown in the switcher regardless of UI language. */
export const LOCALE_NAMES: Record<Locale, { short: string; long: string }> = {
  en: { short: "EN", long: "English" },
  bn: { short: "বাং", long: "বাংলা" },
};

export const DEFAULT_LOCALE: Locale = "en";

/** Locale-aware formatters bound to the user's currency. */
export function createFormatter(locale: Locale, currency: string) {
  return {
    money: (amount: number, opts?: { signed?: boolean }) =>
      formatMoney(amount, currency, { ...opts, locale }),
    number: (value: number) => formatNumber(value, locale),
    date: (date: ISODate) => formatDate(date, locale),
    dayMonth: (date: ISODate) => formatDayMonth(date, locale),
    weekday: (date: ISODate) => formatWeekday(date, locale),
    month: (month: ISOMonth) => formatMonth(month, locale),
    monthShort: (month: ISOMonth) => formatMonthShort(month, locale),
    monthName: (month: ISOMonth, width?: "long" | "short") =>
      formatMonthName(month, locale, width),
    year: (month: ISOMonth) => formatYear(month, locale),
  };
}

export type Formatter = ReturnType<typeof createFormatter>;

/**
 * The active language lives in the persisted preferences (localStorage), so
 * switching never touches the URL.
 */
export function useI18n() {
  const locale = usePrefsStore((s) => s.locale);
  const currency = usePrefsStore((s) => s.currency);
  return useMemo(
    () => ({ locale, t: MESSAGES[locale], f: createFormatter(locale, currency) }),
    [locale, currency],
  );
}
