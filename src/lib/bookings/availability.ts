import { and, eq, lt, gt, ne } from "drizzle-orm";
import { db } from "@/db";
import { availabilityRules, bookings, services } from "@/db/schema";

export type ConflictReason =
  | { kind: "overlap"; bookingId: string; startAt: Date; endAt: Date }
  | { kind: "outside_availability" }
  | { kind: "no_availability_rule" };

export type ServiceLite = { id: string; durationMinutes: number };

export function endAtFor(startAt: Date, durationMinutes: number): Date {
  return new Date(startAt.getTime() + durationMinutes * 60_000);
}

function minutesIntoDay(d: Date) {
  return d.getHours() * 60 + d.getMinutes();
}

export async function loadServiceForOrg(orgId: string, serviceId: string) {
  const rows = await db
    .select({ id: services.id, durationMinutes: services.durationMinutes })
    .from(services)
    .where(and(eq(services.id, serviceId), eq(services.orgId, orgId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function checkAvailability(
  orgId: string,
  staffUserId: string,
  startAt: Date,
  endAt: Date,
): Promise<ConflictReason | null> {
  if (!(startAt < endAt)) return { kind: "outside_availability" };
  const sameDay =
    startAt.getFullYear() === endAt.getFullYear() &&
    startAt.getMonth() === endAt.getMonth() &&
    startAt.getDate() === endAt.getDate();
  if (!sameDay) return { kind: "outside_availability" };

  const weekday = startAt.getDay();
  const startMin = minutesIntoDay(startAt);
  const endMin = minutesIntoDay(endAt);

  const rules = await db
    .select({
      startMinute: availabilityRules.startMinute,
      endMinute: availabilityRules.endMinute,
    })
    .from(availabilityRules)
    .where(
      and(
        eq(availabilityRules.orgId, orgId),
        eq(availabilityRules.staffUserId, staffUserId),
        eq(availabilityRules.weekday, weekday),
      ),
    );
  if (rules.length === 0) return { kind: "no_availability_rule" };
  const covered = rules.some(
    (r) => r.startMinute <= startMin && endMin <= r.endMinute,
  );
  if (!covered) return { kind: "outside_availability" };
  return null;
}

export async function findOverlappingBooking(
  orgId: string,
  staffUserId: string,
  startAt: Date,
  endAt: Date,
  excludeBookingId?: string,
): Promise<ConflictReason | null> {
  const filters = [
    eq(bookings.orgId, orgId),
    eq(bookings.staffUserId, staffUserId),
    lt(bookings.startAt, endAt),
    gt(bookings.endAt, startAt),
    ne(bookings.status, "cancelled"),
  ];
  if (excludeBookingId) filters.push(ne(bookings.id, excludeBookingId));
  const rows = await db
    .select({
      id: bookings.id,
      startAt: bookings.startAt,
      endAt: bookings.endAt,
    })
    .from(bookings)
    .where(and(...filters))
    .limit(1);
  const hit = rows[0];
  if (!hit) return null;
  return {
    kind: "overlap",
    bookingId: hit.id,
    startAt: hit.startAt,
    endAt: hit.endAt,
  };
}

export async function assertSlotIsBookable(
  orgId: string,
  staffUserId: string,
  startAt: Date,
  endAt: Date,
  excludeBookingId?: string,
): Promise<ConflictReason | null> {
  const availability = await checkAvailability(orgId, staffUserId, startAt, endAt);
  if (availability) return availability;
  const overlap = await findOverlappingBooking(
    orgId,
    staffUserId,
    startAt,
    endAt,
    excludeBookingId,
  );
  if (overlap) return overlap;
  return null;
}

export function describeConflict(reason: ConflictReason): string {
  switch (reason.kind) {
    case "overlap":
      return `Conflicts with an existing booking ${reason.startAt.toISOString()} -> ${reason.endAt.toISOString()}.`;
    case "outside_availability":
      return "Outside this staff member's working hours.";
    case "no_availability_rule":
      return "No availability rule for this weekday. Add one before booking.";
  }
}
