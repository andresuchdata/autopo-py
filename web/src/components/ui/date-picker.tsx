"use client";

import * as React from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DatePickerProps {
  value?: string;
  onChange: (value: string | "") => void;
  placeholder?: string;
  labelFormatter?: (date: Date) => string;
}

const formatDateLabel = (date: Date) => {
  return date.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export function DatePicker({ value, onChange, placeholder = "Select date", labelFormatter = formatDateLabel }: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [month, setMonth] = React.useState<Date>(() => {
    if (value) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return new Date();
  });

  const selectedDate = React.useMemo(() => {
    if (!value) return null;
    // value is expected in YYYY-MM-DD format; parse as a local date to avoid timezone shifts
    const [yearStr, monthStr, dayStr] = value.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);
    if (!year || !month || !day) return null;
    const parsed = new Date(year, month - 1, day);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, [value]);

  const startOfMonth = React.useMemo(() => new Date(month.getFullYear(), month.getMonth(), 1), [month]);
  const endOfMonth = React.useMemo(() => new Date(month.getFullYear(), month.getMonth() + 1, 0), [month]);

  const days: Date[] = React.useMemo(() => {
    const firstDayOfWeek = startOfMonth.getDay(); // 0 (Sun) - 6 (Sat)
    const daysInMonth = endOfMonth.getDate();

    const result: Date[] = [];

    // Previous month padding
    for (let i = 0; i < firstDayOfWeek; i++) {
      result.push(new Date(startOfMonth.getFullYear(), startOfMonth.getMonth(), startOfMonth.getDate() - (firstDayOfWeek - i)));
    }

    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      result.push(new Date(month.getFullYear(), month.getMonth(), d));
    }

    // Next month padding to complete weeks (up to 6 weeks)
    while (result.length % 7 !== 0 || result.length < 42) {
      const last = result[result.length - 1];
      result.push(new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1));
    }

    return result;
  }, [startOfMonth, endOfMonth, month]);

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const handleSelect = (day: Date) => {
    // Build YYYY-MM-DD from local date parts to avoid timezone-related off-by-one issues
    const y = day.getFullYear();
    const m = String(day.getMonth() + 1).padStart(2, "0");
    const d = String(day.getDate()).padStart(2, "0");
    const localDateString = `${y}-${m}-${d}`;
    onChange(localDateString);
    setOpen(false);
  };

  const handleClear = (event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    onChange("");
  };

  const goToPreviousMonth = () => {
    setMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const triggerLabel = selectedDate ? labelFormatter(selectedDate) : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-44 justify-between h-10 px-3 bg-background border-border hover:bg-muted/50 rounded-lg font-normal"
        >
          <span className={cn(!selectedDate && "text-muted-foreground")}>{triggerLabel}</span>
          <div className="flex items-center gap-1">
            {selectedDate && (
              <span
                role="button"
                aria-label="Clear date"
                className="text-xs text-muted-foreground hover:text-destructive mr-1 cursor-pointer select-none"
                onClick={handleClear}
              >
                ×
              </span>
            )}
            <CalendarIcon className="h-4 w-4 opacity-70" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="end">
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            className="text-xs px-2 py-1 rounded-md hover:bg-muted"
            onClick={goToPreviousMonth}
          >
            ‹
          </button>
          <div className="text-sm font-medium">
            {month.toLocaleDateString("id-ID", { month: "long", year: "numeric" })}
          </div>
          <button
            type="button"
            className="text-xs px-2 py-1 rounded-md hover:bg-muted"
            onClick={goToNextMonth}
          >
            ›
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-[11px] text-muted-foreground mb-1">
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
            <div key={d} className="h-6 flex items-center justify-center font-medium">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 text-xs">
          {days.map((day, idx) => {
            const inCurrentMonth = day.getMonth() === month.getMonth();
            const isSelected = selectedDate && isSameDay(day, selectedDate);
            const isToday = isSameDay(day, new Date());

            return (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelect(day)}
                className={cn(
                  "h-8 w-8 rounded-md flex items-center justify-center transition-colors",
                  inCurrentMonth ? "text-foreground" : "text-muted-foreground/40",
                  isSelected && "bg-primary text-primary-foreground shadow-sm",
                  !isSelected && isToday && "border border-primary/60",
                  !isSelected && !isToday && "hover:bg-muted/60"
                )}
              >
                {day.getDate()}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
