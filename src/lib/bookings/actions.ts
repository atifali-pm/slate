"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, customers, services, memberships } from "@/db/schema";
import type { BookingStatus } from "@/db/schema";
import { requireOrgScope } from "@/lib/auth/scope";
import {
  assertSlotIsBookable,
  describeConflict,
  endAtFor,
  loadServiceForOrg,
} from "./availability";
import {
  createBookingSchema,
  rescheduleBookingSchema,
  updateStatusSchema,
  deleteBookingSchema,
} from "./validation";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function ensureCustomerInOrg(orgId: string, customerId: string) {
  const rows = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.orgId, orgId)))
    .limit(1);
  return rows.length > 0;
}

async function ensureStaffInOrg(orgId: string, staffUserId: string) {
  const rows = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, staffUserId),
        eq(memberships.orgId, orgId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

async function loadBookingForOrg(orgId: string, bookingId: string) {
  const rows = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.id, bookingId), eq(bookings.orgId, orgId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createBookingAction(
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createBookingSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const scope = await requireOrgScope();
  const { customerId, serviceId, staffUserId, startAt: startStr, notes } =
    parsed.data;

  const [okCustomer, okStaff, service] = await Promise.all([
    ensureCustomerInOrg(scope.orgId, customerId),
    ensureStaffInOrg(scope.orgId, staffUserId),
    loadServiceForOrg(scope.orgId, serviceId),
  ]);
  if (!okCustomer) return { ok: false, error: "Unknown customer." };
  if (!okStaff) return { ok: false, error: "Staff is not a member of this organization." };
  if (!service) return { ok: false, error: "Unknown service." };

  const startAt = new Date(startStr);
  const endAt = endAtFor(startAt, service.durationMinutes);

  const conflict = await assertSlotIsBookable(
    scope.orgId,
    staffUserId,
    startAt,
    endAt,
  );
  if (conflict) return { ok: false, error: describeConflict(conflict) };

  const [row] = await db
    .insert(bookings)
    .values({
      orgId: scope.orgId,
      customerId,
      serviceId,
      staffUserId,
      startAt,
      endAt,
      status: "pending",
      notes: notes ?? null,
    })
    .returning({ id: bookings.id });

  revalidatePath("/dashboard");
  return { ok: true, data: { id: row.id } };
}

export async function rescheduleBookingAction(
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = rescheduleBookingSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const scope = await requireOrgScope();
  const existing = await loadBookingForOrg(scope.orgId, parsed.data.bookingId);
  if (!existing) return { ok: false, error: "Booking not found." };

  const newStaffUserId = parsed.data.staffUserId ?? existing.staffUserId;
  if (newStaffUserId !== existing.staffUserId) {
    const okStaff = await ensureStaffInOrg(scope.orgId, newStaffUserId);
    if (!okStaff) return { ok: false, error: "Staff is not a member of this organization." };
  }
  const service = await loadServiceForOrg(scope.orgId, existing.serviceId);
  if (!service) return { ok: false, error: "Underlying service is missing." };

  const startAt = new Date(parsed.data.startAt);
  const endAt = endAtFor(startAt, service.durationMinutes);
  const conflict = await assertSlotIsBookable(
    scope.orgId,
    newStaffUserId,
    startAt,
    endAt,
    existing.id,
  );
  if (conflict) return { ok: false, error: describeConflict(conflict) };

  await db
    .update(bookings)
    .set({ startAt, endAt, staffUserId: newStaffUserId, updatedAt: new Date() })
    .where(and(eq(bookings.id, existing.id), eq(bookings.orgId, scope.orgId)));

  revalidatePath("/dashboard");
  return { ok: true, data: { id: existing.id } };
}

const ALLOWED_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["completed", "cancelled"],
  cancelled: [],
  completed: [],
};

export async function updateBookingStatusAction(
  raw: unknown,
): Promise<ActionResult<{ id: string; status: BookingStatus }>> {
  const parsed = updateStatusSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const scope = await requireOrgScope();
  const existing = await loadBookingForOrg(scope.orgId, parsed.data.bookingId);
  if (!existing) return { ok: false, error: "Booking not found." };
  const allowed = ALLOWED_TRANSITIONS[existing.status];
  if (!allowed.includes(parsed.data.status)) {
    return {
      ok: false,
      error: `Cannot move booking from ${existing.status} to ${parsed.data.status}.`,
    };
  }
  await db
    .update(bookings)
    .set({ status: parsed.data.status, updatedAt: new Date() })
    .where(and(eq(bookings.id, existing.id), eq(bookings.orgId, scope.orgId)));
  revalidatePath("/dashboard");
  return { ok: true, data: { id: existing.id, status: parsed.data.status } };
}

export async function deleteBookingAction(
  raw: unknown,
): Promise<ActionResult> {
  const parsed = deleteBookingSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const scope = await requireOrgScope();
  const result = await db
    .delete(bookings)
    .where(
      and(eq(bookings.id, parsed.data.bookingId), eq(bookings.orgId, scope.orgId)),
    )
    .returning({ id: bookings.id });
  if (result.length === 0) return { ok: false, error: "Booking not found." };
  revalidatePath("/dashboard");
  return { ok: true, data: undefined };
}
