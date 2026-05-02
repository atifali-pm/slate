export type CalendarView = "week" | "day";

export const CALENDAR_HOUR_START = 9;
export const CALENDAR_HOUR_END = 18;
export const CALENDAR_SLOT_MINUTES = 30;

export function parseCalendarParams(params: {
  view?: string | string[];
  date?: string | string[];
}) {
  const rawView = Array.isArray(params.view) ? params.view[0] : params.view;
  const rawDate = Array.isArray(params.date) ? params.date[0] : params.date;
  const view: CalendarView = rawView === "day" ? "day" : "week";
  let date = new Date();
  if (rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    date = new Date(rawDate + "T00:00:00");
  }
  date.setHours(0, 0, 0, 0);
  return { view, date };
}

export function startOfWeek(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  // Monday start
  const dow = out.getDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  out.setDate(out.getDate() + offset);
  return out;
}

export function endOfWeek(d: Date): Date {
  const start = startOfWeek(d);
  const out = new Date(start);
  out.setDate(out.getDate() + 6);
  out.setHours(23, 59, 59, 999);
  return out;
}

export function endOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(23, 59, 59, 999);
  return out;
}

export function rangeForView(view: CalendarView, anchor: Date): { from: Date; to: Date } {
  if (view === "day") return { from: anchor, to: endOfDay(anchor) };
  return { from: startOfWeek(anchor), to: endOfWeek(anchor) };
}

export function shiftDate(view: CalendarView, anchor: Date, dir: -1 | 1): Date {
  const out = new Date(anchor);
  if (view === "day") out.setDate(out.getDate() + dir);
  else out.setDate(out.getDate() + dir * 7);
  return out;
}

export function toDateOnlyString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function buildCalendarHref(view: CalendarView, date: Date): string {
  return `/dashboard/calendar?view=${view}&date=${toDateOnlyString(date)}`;
}

export function formatHourLabel(hour: number, minute: number): string {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: minute === 0 ? undefined : "2-digit" });
}

export function formatDayHeader(d: Date, includeWeekday = true): string {
  return d.toLocaleDateString(undefined, {
    weekday: includeWeekday ? "short" : undefined,
    month: "short",
    day: "numeric",
  });
}

export function formatRangeLabel(view: CalendarView, anchor: Date): string {
  if (view === "day") {
    return anchor.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }
  const start = startOfWeek(anchor);
  const end = endOfWeek(anchor);
  const sameMonth = start.getMonth() === end.getMonth();
  const startStr = start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const endStr = sameMonth
    ? end.toLocaleDateString(undefined, { day: "numeric", year: "numeric" })
    : end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return `${startStr} - ${endStr}`;
}

export function listDaysOfWeek(anchor: Date): Date[] {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

export type SlotKey = string;

export function slotKeyFromDate(d: Date): SlotKey {
  return `${toDateOnlyString(d)}T${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}

export function dateFromSlotKey(key: SlotKey): Date {
  return new Date(key + ":00");
}
