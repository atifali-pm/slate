import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  type SQL,
} from "drizzle-orm";
import { db } from "@/db";
import {
  bookings,
  customers,
  memberships,
  services,
  users,
} from "@/db/schema";
import type { BookingStatus, MemberRole } from "@/db/schema";

export type OrgCustomer = { id: string; name: string };
export type OrgService = {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
};
export type OrgStaff = { id: string; name: string; role: MemberRole };

export async function listOrgCustomers(orgId: string): Promise<OrgCustomer[]> {
  const rows = await db
    .select({ id: customers.id, name: customers.name })
    .from(customers)
    .where(eq(customers.orgId, orgId))
    .orderBy(asc(customers.name));
  return rows;
}

export async function listOrgServices(orgId: string): Promise<OrgService[]> {
  const rows = await db
    .select({
      id: services.id,
      name: services.name,
      durationMinutes: services.durationMinutes,
      priceCents: services.priceCents,
    })
    .from(services)
    .where(eq(services.orgId, orgId))
    .orderBy(asc(services.name));
  return rows;
}

export async function listOrgStaff(orgId: string): Promise<OrgStaff[]> {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.orgId, orgId))
    .orderBy(asc(users.name));
  return rows;
}

export type RecentBooking = {
  id: string;
  startAt: Date;
  endAt: Date;
  status: BookingStatus;
  customerName: string;
  serviceName: string;
  staffName: string;
};

export async function listRecentBookings(
  orgId: string,
  limit = 10,
): Promise<RecentBooking[]> {
  const rows = await db
    .select({
      id: bookings.id,
      startAt: bookings.startAt,
      endAt: bookings.endAt,
      status: bookings.status,
      customerName: customers.name,
      serviceName: services.name,
      staffName: users.name,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .innerJoin(users, eq(users.id, bookings.staffUserId))
    .where(eq(bookings.orgId, orgId))
    .orderBy(desc(bookings.startAt))
    .limit(limit);
  return rows;
}

export type BookingFilters = {
  from?: Date;
  to?: Date;
  status?: BookingStatus[];
  staffUserId?: string;
  query?: string;
};

export type FilteredBooking = RecentBooking & {
  notes: string | null;
  customerId: string;
  serviceId: string;
  staffUserId: string;
  durationMinutes: number;
};

export async function listFilteredBookings(
  orgId: string,
  filters: BookingFilters,
  pagination: { limit: number; offset: number } = { limit: 50, offset: 0 },
): Promise<{ rows: FilteredBooking[]; total: number }> {
  const conditions: SQL[] = [eq(bookings.orgId, orgId)];
  if (filters.from) conditions.push(gte(bookings.startAt, filters.from));
  if (filters.to) conditions.push(lte(bookings.startAt, filters.to));
  if (filters.status && filters.status.length > 0) {
    conditions.push(inArray(bookings.status, filters.status));
  }
  if (filters.staffUserId) {
    conditions.push(eq(bookings.staffUserId, filters.staffUserId));
  }
  if (filters.query && filters.query.trim().length > 0) {
    conditions.push(ilike(customers.name, `%${filters.query.trim()}%`));
  }

  const where = and(...conditions);
  const [rows, totalRow] = await Promise.all([
    db
      .select({
        id: bookings.id,
        startAt: bookings.startAt,
        endAt: bookings.endAt,
        status: bookings.status,
        notes: bookings.notes,
        customerId: bookings.customerId,
        serviceId: bookings.serviceId,
        staffUserId: bookings.staffUserId,
        customerName: customers.name,
        serviceName: services.name,
        staffName: users.name,
        durationMinutes: services.durationMinutes,
      })
      .from(bookings)
      .innerJoin(customers, eq(customers.id, bookings.customerId))
      .innerJoin(services, eq(services.id, bookings.serviceId))
      .innerJoin(users, eq(users.id, bookings.staffUserId))
      .where(where)
      .orderBy(asc(bookings.startAt))
      .limit(pagination.limit)
      .offset(pagination.offset),
    db
      .select({ value: bookings.id })
      .from(bookings)
      .innerJoin(customers, eq(customers.id, bookings.customerId))
      .where(where),
  ]);

  return { rows, total: totalRow.length };
}
