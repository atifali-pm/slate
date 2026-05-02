import { and, asc, count, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  availabilityRules,
  bookings,
  memberships,
  services,
  users,
} from "@/db/schema";
import type { BookingStatus } from "@/db/schema";

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(23, 59, 59, 999);
  return d;
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

export type StatusBreakdown = Record<BookingStatus, number>;

function emptyBreakdown(): StatusBreakdown {
  return { pending: 0, confirmed: 0, cancelled: 0, completed: 0 };
}

async function statusBreakdownInRange(
  orgId: string,
  from: Date,
  to: Date,
): Promise<StatusBreakdown> {
  const rows = await db
    .select({ status: bookings.status, value: count() })
    .from(bookings)
    .where(
      and(
        eq(bookings.orgId, orgId),
        gte(bookings.startAt, from),
        lte(bookings.startAt, to),
      ),
    )
    .groupBy(bookings.status);
  const out = emptyBreakdown();
  for (const row of rows) out[row.status] = Number(row.value);
  return out;
}

export type AnalyticsSummary = {
  today: { total: number; breakdown: StatusBreakdown };
  next7Days: { total: number; breakdown: StatusBreakdown };
  last30Days: {
    total: number;
    breakdown: StatusBreakdown;
    cancellationRate: number;
  };
};

export async function loadAnalyticsSummary(
  orgId: string,
): Promise<AnalyticsSummary> {
  const [today, next7, last30] = await Promise.all([
    statusBreakdownInRange(orgId, startOfToday(), endOfToday()),
    statusBreakdownInRange(orgId, startOfToday(), daysFromNow(7)),
    statusBreakdownInRange(orgId, daysAgo(30), endOfToday()),
  ]);
  const totalToday = sum(today);
  const totalNext = sum(next7);
  const totalLast = sum(last30);
  const denom = last30.cancelled + last30.completed;
  const cancellationRate = denom === 0 ? 0 : last30.cancelled / denom;
  return {
    today: { total: totalToday, breakdown: today },
    next7Days: { total: totalNext, breakdown: next7 },
    last30Days: { total: totalLast, breakdown: last30, cancellationRate },
  };
}

function sum(b: StatusBreakdown) {
  return b.pending + b.confirmed + b.cancelled + b.completed;
}

export type TopService = {
  serviceId: string;
  name: string;
  durationMinutes: number;
  bookingsCount: number;
  revenueCents: number;
};

export async function loadTopServices(
  orgId: string,
  from: Date,
  to: Date,
  limit = 5,
): Promise<TopService[]> {
  const rows = await db
    .select({
      serviceId: services.id,
      name: services.name,
      durationMinutes: services.durationMinutes,
      bookingsCount: count(bookings.id),
      revenueCents: sql<number>`coalesce(sum(${services.priceCents}) filter (where ${bookings.status} in ('confirmed','completed')), 0)`,
    })
    .from(bookings)
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .where(
      and(
        eq(bookings.orgId, orgId),
        gte(bookings.startAt, from),
        lte(bookings.startAt, to),
      ),
    )
    .groupBy(services.id, services.name, services.durationMinutes)
    .orderBy(desc(count(bookings.id)))
    .limit(limit);
  return rows.map((r) => ({ ...r, bookingsCount: Number(r.bookingsCount), revenueCents: Number(r.revenueCents) }));
}

export type StaffUtilization = {
  staffUserId: string;
  name: string;
  bookedMinutes: number;
  availableMinutes: number;
  utilization: number;
};

export async function loadStaffUtilization(
  orgId: string,
  from: Date,
  to: Date,
): Promise<StaffUtilization[]> {
  const staff = await db
    .select({ id: users.id, name: users.name })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.orgId, orgId))
    .orderBy(asc(users.name));

  if (staff.length === 0) return [];

  const bookedRows = await db
    .select({
      staffUserId: bookings.staffUserId,
      bookedMinutes: sql<number>`coalesce(sum(extract(epoch from (${bookings.endAt} - ${bookings.startAt})) / 60), 0)`,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.orgId, orgId),
        gte(bookings.startAt, from),
        lte(bookings.startAt, to),
        sql`${bookings.status} in ('confirmed','completed')`,
      ),
    )
    .groupBy(bookings.staffUserId);

  const bookedMap = new Map<string, number>();
  for (const row of bookedRows) {
    bookedMap.set(row.staffUserId, Math.round(Number(row.bookedMinutes)));
  }

  const ruleRows = await db
    .select({
      staffUserId: availabilityRules.staffUserId,
      weekday: availabilityRules.weekday,
      minutes: sql<number>`(${availabilityRules.endMinute} - ${availabilityRules.startMinute})`,
    })
    .from(availabilityRules)
    .where(eq(availabilityRules.orgId, orgId));

  const weekdayMinutes = new Map<string, Map<number, number>>();
  for (const row of ruleRows) {
    if (!weekdayMinutes.has(row.staffUserId))
      weekdayMinutes.set(row.staffUserId, new Map());
    const m = weekdayMinutes.get(row.staffUserId)!;
    m.set(row.weekday, (m.get(row.weekday) ?? 0) + Number(row.minutes));
  }

  const dayCountByWeekday = new Map<number, number>();
  const ms = 24 * 60 * 60 * 1000;
  for (let t = from.getTime(); t <= to.getTime(); t += ms) {
    const d = new Date(t);
    const w = d.getDay();
    dayCountByWeekday.set(w, (dayCountByWeekday.get(w) ?? 0) + 1);
  }

  return staff.map((s) => {
    const wd = weekdayMinutes.get(s.id) ?? new Map<number, number>();
    let availableMinutes = 0;
    for (const [weekday, perDay] of wd) {
      availableMinutes += perDay * (dayCountByWeekday.get(weekday) ?? 0);
    }
    const bookedMinutes = bookedMap.get(s.id) ?? 0;
    const utilization =
      availableMinutes === 0 ? 0 : bookedMinutes / availableMinutes;
    return {
      staffUserId: s.id,
      name: s.name,
      bookedMinutes,
      availableMinutes,
      utilization,
    };
  });
}

export function rangeForLast(days: number): { from: Date; to: Date } {
  return { from: daysAgo(days), to: endOfToday() };
}

export function rangeForNext(days: number): { from: Date; to: Date } {
  return { from: startOfToday(), to: daysFromNow(days) };
}
