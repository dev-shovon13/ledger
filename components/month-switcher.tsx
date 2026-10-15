"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { monthOf } from "@/lib/dates";
import { useI18n } from "@/lib/i18n";
import { useViewStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const MONTH_NUMBERS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));

export function MonthSwitcher({ className }: { className?: string }) {
  const { t, f } = useI18n();
  const month = useViewStore((s) => s.month);
  const today = useViewStore((s) => s.today);
  const setMonth = useViewStore((s) => s.setMonth);
  const shiftMonth = useViewStore((s) => s.shiftMonth);
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(() => Number(month?.slice(0, 4) ?? 2026));

  if (!month || !today) return null;
  const currentMonth = monthOf(today);

  return (
    <div className={cn("flex items-center", className)}>
      <Button variant="ghost" size="icon" onClick={() => shiftMonth(-1)} aria-label={t.nav.prevMonth}>
        <ChevronLeftIcon />
      </Button>
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (o) setYear(Number(month.slice(0, 4)));
        }}
      >
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            className="px-2 text-sm font-semibold sm:min-w-36 sm:text-base"
            aria-label={t.nav.chooseMonth(f.month(month))}
          >
            {f.month(month)}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64" align="center">
          <div className="mb-2 flex items-center justify-between">
            <Button variant="ghost" size="icon-sm" onClick={() => setYear((y) => y - 1)} aria-label={t.nav.prevYear}>
              <ChevronLeftIcon />
            </Button>
            <span className="text-sm font-medium">{f.year(`${year}-01`)}</span>
            <Button variant="ghost" size="icon-sm" onClick={() => setYear((y) => y + 1)} aria-label={t.nav.nextYear}>
              <ChevronRightIcon />
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {MONTH_NUMBERS.map((mm) => {
              const value = `${year}-${mm}`;
              const selected = value === month;
              return (
                <Button
                  key={value}
                  size="sm"
                  variant={selected ? "default" : "ghost"}
                  aria-pressed={selected}
                  className={cn(value === currentMonth && !selected && "font-semibold text-primary")}
                  onClick={() => {
                    setMonth(value);
                    setOpen(false);
                  }}
                >
                  {f.monthName(value, "short")}
                </Button>
              );
            })}
          </div>
          {month !== currentMonth && (
            <Button
              variant="outline"
              size="sm"
              className="mt-2 w-full"
              onClick={() => {
                setMonth(currentMonth);
                setOpen(false);
              }}
            >
              {t.nav.jumpToThisMonth}
            </Button>
          )}
        </PopoverContent>
      </Popover>
      <Button variant="ghost" size="icon" onClick={() => shiftMonth(1)} aria-label={t.nav.nextMonth}>
        <ChevronRightIcon />
      </Button>
    </div>
  );
}
