"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import {
  CALENDAR_HOUR_END,
  CALENDAR_HOUR_START,
  CALENDAR_SLOT_MINUTES,
  formatDayHeader,
  formatHourLabel,
  listDaysOfWeek,
  toDateOnlyString,
} from "@/lib/calendar/dates";
import { rescheduleBookingAction } from "@/lib/bookings/actions";
import type { FilteredBooking } from "@/lib/bookings/queries";
import type { BookingStatus } from "@/db/schema";

type Props = {
  anchor: Date;
  bookings: FilteredBooking[];
};

const STATUS_BG: Record<BookingStatus, string> = {
  pending: "bg-amber-200/80 border-amber-400 text-amber-950",
  confirmed: "bg-emerald-200/80 border-emerald-400 text-emerald-950",
  completed: "bg-slate-200/80 border-slate-400 text-slate-700",
  cancelled: "bg-red-200/70 border-red-400 text-red-950 line-through opacity-70",
};

const SLOT_HEIGHT_PX = 22;

function slotIndex(d: Date) {
  const minutes = (d.getHours() - CALENDAR_HOUR_START) * 60 + d.getMinutes();
  return minutes / CALENDAR_SLOT_MINUTES;
}

function durationSlots(startAt: Date, endAt: Date) {
  const minutes = (endAt.getTime() - startAt.getTime()) / 60000;
  return minutes / CALENDAR_SLOT_MINUTES;
}

const TOTAL_SLOTS =
  ((CALENDAR_HOUR_END - CALENDAR_HOUR_START) * 60) / CALENDAR_SLOT_MINUTES;

const HOUR_TICKS = Array.from(
  { length: CALENDAR_HOUR_END - CALENDAR_HOUR_START + 1 },
  (_, i) => CALENDAR_HOUR_START + i,
);

export function WeekGrid({ anchor, bookings }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hover, setHover] = useState<{ slot: number; dayKey: string } | null>(null);

  const days = listDaysOfWeek(anchor);
  const byDay = new Map<string, FilteredBooking[]>();
  for (const d of days) byDay.set(toDateOnlyString(d), []);
  for (const b of bookings) {
    const key = toDateOnlyString(new Date(b.startAt));
    byDay.get(key)?.push(b);
  }

  function dropOn(day: Date, slot: number, bookingId: string) {
    const newStart = new Date(day);
    newStart.setHours(
      CALENDAR_HOUR_START + Math.floor((slot * CALENDAR_SLOT_MINUTES) / 60),
      (slot * CALENDAR_SLOT_MINUTES) % 60,
      0,
      0,
    );
    setError(null);
    startTransition(async () => {
      const result = await rescheduleBookingAction({
        bookingId,
        startAt: newStart.toISOString(),
      });
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-2" data-testid="week-grid">
      {error ? (
        <p className="text-sm text-destructive" role="alert" data-testid="cal-error">
          {error}
        </p>
      ) : null}
      <div
        className="grid overflow-x-auto rounded-lg border bg-card text-xs"
        style={{
          gridTemplateColumns: `56px repeat(${days.length}, minmax(110px, 1fr))`,
        }}
      >
        <div className="border-b border-r bg-muted/30 p-2 text-right text-muted-foreground">
          Time
        </div>
        {days.map((d) => {
          const isToday = toDateOnlyString(d) === toDateOnlyString(new Date());
          return (
            <div
              key={d.toISOString()}
              className={cn(
                "border-b p-2 text-center font-medium",
                isToday ? "bg-primary/10" : "bg-muted/30",
              )}
              data-testid={`week-day-header-${toDateOnlyString(d)}`}
            >
              {formatDayHeader(d)}
            </div>
          );
        })}

        <div className="relative border-r" style={{ height: SLOT_HEIGHT_PX * TOTAL_SLOTS }}>
          {HOUR_TICKS.map((hour, i) => (
            <div
              key={hour}
              className="absolute right-1 -translate-y-1/2 text-[10px] text-muted-foreground"
              style={{ top: i * (60 / CALENDAR_SLOT_MINUTES) * SLOT_HEIGHT_PX }}
            >
              {formatHourLabel(hour, 0)}
            </div>
          ))}
        </div>

        {days.map((d) => {
          const dayKey = toDateOnlyString(d);
          const dayBookings = byDay.get(dayKey) ?? [];
          return (
            <div
              key={dayKey}
              className="relative"
              style={{ height: SLOT_HEIGHT_PX * TOTAL_SLOTS }}
              data-testid={`week-column-${dayKey}`}
            >
              {Array.from({ length: TOTAL_SLOTS }).map((_, slot) => (
                <div
                  key={slot}
                  onDragOver={(e) => {
                    if (!draggingId) return;
                    e.preventDefault();
                    setHover({ slot, dayKey });
                  }}
                  onDragLeave={() => {
                    setHover((h) => (h && h.slot === slot && h.dayKey === dayKey ? null : h));
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData("text/booking-id") || draggingId;
                    if (!id) return;
                    setDraggingId(null);
                    setHover(null);
                    dropOn(d, slot, id);
                  }}
                  className={cn(
                    "absolute right-0 left-0 border-b border-dashed border-border/50",
                    hover && hover.slot === slot && hover.dayKey === dayKey
                      ? "bg-primary/15"
                      : slot % 2 === 0
                        ? "bg-background"
                        : "bg-muted/15",
                  )}
                  style={{ top: slot * SLOT_HEIGHT_PX, height: SLOT_HEIGHT_PX }}
                />
              ))}
              {dayBookings.map((b) => {
                const top = slotIndex(new Date(b.startAt)) * SLOT_HEIGHT_PX;
                const height = durationSlots(new Date(b.startAt), new Date(b.endAt)) * SLOT_HEIGHT_PX;
                if (top < 0 || top >= TOTAL_SLOTS * SLOT_HEIGHT_PX) return null;
                return (
                  <div
                    key={b.id}
                    draggable={b.status !== "cancelled" && b.status !== "completed"}
                    onDragStart={(e) => {
                      setDraggingId(b.id);
                      e.dataTransfer.setData("text/booking-id", b.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setHover(null);
                    }}
                    className={cn(
                      "absolute right-0.5 left-0.5 rounded border px-1 py-0.5 text-[10px] leading-tight shadow-sm transition-opacity",
                      STATUS_BG[b.status],
                      draggingId === b.id ? "opacity-50" : "opacity-100",
                      pending ? "pointer-events-none" : "cursor-grab active:cursor-grabbing",
                    )}
                    style={{ top, height: Math.max(height, SLOT_HEIGHT_PX - 2) }}
                    data-testid={`cal-booking-${b.id}`}
                    data-status={b.status}
                    title={`${b.customerName} - ${b.serviceName} - ${b.staffName}`}
                  >
                    <div className="truncate font-medium">{b.customerName}</div>
                    <div className="truncate opacity-80">{b.staffName}</div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Drag a booking onto a slot to reschedule. Use Day view to also drag across staff.
      </p>
    </div>
  );
}
