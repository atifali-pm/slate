"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import {
  CALENDAR_HOUR_END,
  CALENDAR_HOUR_START,
  CALENDAR_SLOT_MINUTES,
  formatHourLabel,
  toDateOnlyString,
} from "@/lib/calendar/dates";
import { rescheduleBookingAction } from "@/lib/bookings/actions";
import type { FilteredBooking, OrgStaff } from "@/lib/bookings/queries";
import type { BookingStatus } from "@/db/schema";

type Props = {
  date: Date;
  staff: OrgStaff[];
  bookings: FilteredBooking[];
};

const STATUS_BG: Record<BookingStatus, string> = {
  pending: "bg-amber-200/80 border-amber-400 text-amber-950",
  confirmed: "bg-emerald-200/80 border-emerald-400 text-emerald-950",
  completed: "bg-slate-200/80 border-slate-400 text-slate-700",
  cancelled: "bg-red-200/70 border-red-400 text-red-950 line-through opacity-70",
};

const SLOT_HEIGHT_PX = 32;

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

export function DayGrid({ date, staff, bookings }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hover, setHover] = useState<{ slot: number; staffId: string } | null>(null);

  const byStaff = new Map<string, FilteredBooking[]>();
  for (const s of staff) byStaff.set(s.id, []);
  for (const b of bookings) {
    const list = byStaff.get(b.staffUserId);
    if (list) list.push(b);
  }

  function dropOnSlot(staffId: string, slot: number, bookingId: string) {
    const newStart = new Date(date);
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
        staffUserId: staffId,
      });
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-2" data-testid="day-grid" data-date={toDateOnlyString(date)}>
      {error ? (
        <p className="text-sm text-destructive" role="alert" data-testid="cal-error">
          {error}
        </p>
      ) : null}
      <div
        className="grid overflow-hidden rounded-lg border bg-card text-xs"
        style={{
          gridTemplateColumns: `64px repeat(${staff.length}, minmax(140px, 1fr))`,
        }}
      >
        <div className="border-b border-r bg-muted/30 p-2 text-right text-muted-foreground">
          Time
        </div>
        {staff.map((s) => (
          <div
            key={s.id}
            className="border-b bg-muted/30 p-2 text-center font-medium"
            data-testid={`cal-staff-header-${s.id}`}
          >
            {s.name}
          </div>
        ))}

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

        {staff.map((s) => (
          <div
            key={s.id}
            className="relative"
            style={{ height: SLOT_HEIGHT_PX * TOTAL_SLOTS }}
            data-testid={`cal-column-${s.id}`}
          >
            {Array.from({ length: TOTAL_SLOTS }).map((_, slot) => (
              <div
                key={slot}
                role="presentation"
                onDragOver={(e) => {
                  if (!draggingId) return;
                  e.preventDefault();
                  setHover({ slot, staffId: s.id });
                }}
                onDragLeave={() => {
                  setHover((h) => (h && h.slot === slot && h.staffId === s.id ? null : h));
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/booking-id") || draggingId;
                  if (!id) return;
                  setDraggingId(null);
                  setHover(null);
                  dropOnSlot(s.id, slot, id);
                }}
                className={cn(
                  "absolute right-0 left-0 border-b border-dashed border-border/50",
                  hover && hover.slot === slot && hover.staffId === s.id
                    ? "bg-primary/15"
                    : slot % 2 === 0
                      ? "bg-background"
                      : "bg-muted/15",
                )}
                style={{
                  top: slot * SLOT_HEIGHT_PX,
                  height: SLOT_HEIGHT_PX,
                }}
                data-testid={`cal-slot-${s.id}-${slot}`}
              />
            ))}
            {(byStaff.get(s.id) ?? []).map((b) => {
              const top = slotIndex(new Date(b.startAt)) * SLOT_HEIGHT_PX;
              const height =
                durationSlots(new Date(b.startAt), new Date(b.endAt)) * SLOT_HEIGHT_PX;
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
                    "absolute right-1 left-1 rounded border px-1.5 py-1 text-[11px] leading-tight shadow-sm transition-opacity",
                    STATUS_BG[b.status],
                    draggingId === b.id ? "opacity-50" : "opacity-100",
                    pending ? "pointer-events-none" : "cursor-grab active:cursor-grabbing",
                  )}
                  style={{ top, height: Math.max(height, SLOT_HEIGHT_PX - 4) }}
                  data-testid={`cal-booking-${b.id}`}
                  data-status={b.status}
                  title={`${b.customerName} - ${b.serviceName} (${b.status})`}
                >
                  <div className="truncate font-medium">{b.customerName}</div>
                  <div className="truncate text-[10px] opacity-80">{b.serviceName}</div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Drag a booking onto a slot to reschedule. Conflicts and out-of-hours slots are
        rejected by the server.
      </p>
    </div>
  );
}
