"use client";

import { LOCALE_NAMES, useI18n } from "@/lib/i18n";
import { usePrefsStore } from "@/lib/store";
import type { Locale } from "@/lib/types";
import { cn } from "@/lib/utils";

const LOCALES: Locale[] = ["en", "bn"];

/**
 * EN | বাং segmented switch. The choice is saved in local preferences; the
 * URL never changes.
 */
export function LanguageSwitch({ size = "sm", className }: { size?: "sm" | "lg"; className?: string }) {
  const { t, locale } = useI18n();
  const setLocale = usePrefsStore((s) => s.setLocale);

  return (
    <div
      role="radiogroup"
      aria-label={t.nav.language}
      className={cn(
        "inline-flex shrink-0 items-center rounded-lg bg-muted p-0.75",
        size === "sm" ? "h-8" : "h-10 w-full",
        className,
      )}
    >
      {LOCALES.map((l) => {
        const active = l === locale;
        return (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={active}
            lang={l}
            title={LOCALE_NAMES[l].long}
            onClick={() => setLocale(l)}
            className={cn(
              "h-full rounded-md px-2.5 text-xs font-semibold text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
              size === "lg" && "flex-1 text-sm font-medium",
              active && "bg-background text-foreground shadow-sm dark:bg-input/80",
            )}
          >
            {size === "lg" ? LOCALE_NAMES[l].long : LOCALE_NAMES[l].short}
          </button>
        );
      })}
    </div>
  );
}
