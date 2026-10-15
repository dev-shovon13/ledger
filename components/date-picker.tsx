"use client";

import { CalendarIcon } from "lucide-react";
import { useState } from "react";
import { bn as bnCalendar } from "react-day-picker/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { parseISODate, toISODate } from "@/lib/dates";
import { useI18n } from "@/lib/i18n";
import type { ISODate } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Calendar props that follow the app language (Bangla months and digits). */
export function useCalendarLocale() {
  const { locale } = useI18n();
  return locale === "bn" ? ({ locale: bnCalendar, numerals: "beng" } as const) : {};
}

type Props = {
  id?: string;
  value: ISODate;
  onChange(value: ISODate): void;
  /** Dates before this are disabled. */
  min?: ISODate;
  invalid?: boolean;
  className?: string;
};

export function DatePicker({ id, value, onChange, min, invalid, className }: Props) {
  const { f } = useI18n();
  const calendarLocale = useCalendarLocale();
  const [open, setOpen] = useState(false);
  const selected = value ? parseISODate(value) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-invalid={invalid || undefined}
          className={cn("h-9 w-full justify-start font-normal", className)}
        >
          <CalendarIcon className="text-muted-foreground" />
          {value ? f.date(value) : "—"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          required
          selected={selected}
          defaultMonth={selected}
          disabled={min ? { before: parseISODate(min) } : undefined}
          onSelect={(d) => {
            if (!d) return;
            onChange(toISODate(d));
            setOpen(false);
          }}
          autoFocus
          {...calendarLocale}
        />
      </PopoverContent>
    </Popover>
  );
}
