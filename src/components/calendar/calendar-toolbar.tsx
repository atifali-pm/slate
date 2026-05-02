"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  buildCalendarHref,
  formatRangeLabel,
  shiftDate,
  type CalendarView,
} from "@/lib/calendar/dates";

type Props = {
  view: CalendarView;
  date: Date;
};

export function CalendarToolbar({ view, date }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const buttonClass = buttonVariants({ size: "sm", variant: "outline" });
  const ghostClass = buttonVariants({ size: "sm", variant: "ghost" });

  function go(href: string) {
    startTransition(() => router.push(href));
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3" data-testid="calendar-toolbar">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={buttonClass}
          onClick={() => go(buildCalendarHref(view, shiftDate(view, date, -1)))}
          disabled={pending}
          data-testid="cal-prev"
        >
          Prev
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() => go(buildCalendarHref(view, new Date()))}
          disabled={pending}
          data-testid="cal-today"
        >
          Today
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() => go(buildCalendarHref(view, shiftDate(view, date, 1)))}
          disabled={pending}
          data-testid="cal-next"
        >
          Next
        </button>
        <span className="ml-2 text-sm font-medium" data-testid="cal-range-label">
          {formatRangeLabel(view, date)}
        </span>
      </div>
      <div
        className="inline-flex items-center rounded-md border bg-background p-0.5 text-xs"
        role="tablist"
        aria-label="Calendar view"
      >
        <Link
          href={buildCalendarHref("week", date)}
          aria-pressed={view === "week"}
          data-testid="cal-view-week"
          className={cn(
            "rounded-sm px-2.5 py-1 transition-colors",
            view === "week"
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          Week
        </Link>
        <Link
          href={buildCalendarHref("day", date)}
          aria-pressed={view === "day"}
          data-testid="cal-view-day"
          className={cn(
            "rounded-sm px-2.5 py-1 transition-colors",
            view === "day"
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          Day
        </Link>
      </div>
      <Link
        href="/dashboard"
        className={cn(ghostClass, "text-xs")}
        data-testid="cal-back-to-list"
      >
        Back to list
      </Link>
    </div>
  );
}
