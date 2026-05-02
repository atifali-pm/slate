import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  availabilityRules,
  bookings,
  customers,
  memberships,
  organizations,
  services,
  users,
  type BookingStatus,
  type MemberRole,
} from "./schema";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

const client = postgres(databaseUrl, { max: 1 });
const db = drizzle(client, { casing: "snake_case" });

type StaffSpec = { name: string; email: string; role: MemberRole };
type ServiceSpec = { name: string; durationMinutes: number; priceCents: number };

type OrgSpec = {
  slug: string;
  name: string;
  staff: StaffSpec[];
  services: ServiceSpec[];
  customerNames: string[];
  bookingTarget: number;
  extraMembers?: { email: string; role: MemberRole }[];
};

const BELLAS: OrgSpec = {
  slug: "bellas-salon",
  name: "Bella's Salon",
  staff: [
    { name: "Maria Reyes", email: "maria@bellas-salon.test", role: "owner" },
    { name: "Jordan Chen", email: "jordan@bellas-salon.test", role: "manager" },
    { name: "Priya Patel", email: "priya@bellas-salon.test", role: "stylist" },
  ],
  services: [
    { name: "Haircut", durationMinutes: 30, priceCents: 4000 },
    { name: "Color", durationMinutes: 90, priceCents: 12000 },
    { name: "Blowout", durationMinutes: 45, priceCents: 5000 },
    { name: "Beard Trim", durationMinutes: 20, priceCents: 2500 },
    { name: "Highlights", durationMinutes: 120, priceCents: 18000 },
  ],
  customerNames: [
    "Aaliyah Brown", "Benjamin Carter", "Chloe Davis", "Diego Martinez",
    "Eva Nguyen", "Felix Okafor", "Grace Lee", "Hugo Schmidt",
    "Isabella Rossi", "Jamal Wright", "Kira Tanaka", "Liam O'Connor",
    "Maya Singh", "Noah Goldberg", "Olivia Park", "Pedro Alvarez",
    "Quinn Bailey", "Ravi Krishnan", "Sofia Petrova", "Tobias Weber",
  ],
  bookingTarget: 60,
};

const PINECREST: OrgSpec = {
  slug: "pinecrest-clinic",
  name: "Pinecrest Clinic",
  staff: [
    { name: "Dr. Hanna Ortiz", email: "hanna@pinecrest-clinic.test", role: "owner" },
    { name: "Dr. Theo Asante", email: "theo@pinecrest-clinic.test", role: "stylist" },
  ],
  services: [
    { name: "Initial Consult", durationMinutes: 45, priceCents: 9000 },
    { name: "Follow-up", durationMinutes: 20, priceCents: 4500 },
    { name: "Annual Physical", durationMinutes: 60, priceCents: 14000 },
    { name: "Vaccination", durationMinutes: 15, priceCents: 3500 },
  ],
  customerNames: [
    "Anders Lindqvist", "Beatriz Costa", "Cyrus Mehta", "Daniela Volkov",
    "Erik Sorensen", "Fariha Ahmed", "Gianna Russo", "Henrik Olsen",
    "Imani Adebayo", "Joaquin Salas", "Kavya Iyer", "Linnea Bergstrom",
  ],
  bookingTarget: 30,
  extraMembers: [
    { email: "maria@bellas-salon.test", role: "manager" },
  ],
};

function rnd<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function rndInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/(^\.|\.$)/g, "");
}

function pickStatus(startAt: Date): BookingStatus {
  const now = Date.now();
  if (startAt.getTime() < now) {
    const r = Math.random();
    if (r < 0.75) return "completed";
    if (r < 0.9) return "cancelled";
    return "confirmed";
  }
  const r = Math.random();
  if (r < 0.55) return "confirmed";
  if (r < 0.85) return "pending";
  return "cancelled";
}

async function ensureUser(name: string, email: string, passwordHash: string) {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  if (existing[0]) return existing[0].id;
  const [row] = await db
    .insert(users)
    .values({ name, email: email.toLowerCase(), hashedPassword: passwordHash })
    .returning({ id: users.id });
  return row.id;
}

async function seedOrg(spec: OrgSpec, passwordHash: string) {
  console.log(`Seeding ${spec.name}...`);
  const [org] = await db
    .insert(organizations)
    .values({ name: spec.name, slug: spec.slug })
    .returning();

  const staffUserIds: string[] = [];
  for (const s of spec.staff) {
    const id = await ensureUser(s.name, s.email, passwordHash);
    staffUserIds.push(id);
    await db.insert(memberships).values({
      userId: id,
      orgId: org.id,
      role: s.role,
    });
  }

  if (spec.extraMembers) {
    for (const m of spec.extraMembers) {
      const found = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, m.email.toLowerCase()))
        .limit(1);
      if (!found[0]) continue;
      await db.insert(memberships).values({
        userId: found[0].id,
        orgId: org.id,
        role: m.role,
      });
    }
  }

  const insertedServices = await db
    .insert(services)
    .values(spec.services.map((s) => ({ ...s, orgId: org.id })))
    .returning();

  const insertedCustomers = await db
    .insert(customers)
    .values(
      spec.customerNames.map((name) => ({
        orgId: org.id,
        name,
        email: `${slugify(name)}@example.com`,
        phone: `+1-555-${String(rndInt(1000, 9999)).padStart(4, "0")}`,
      })),
    )
    .returning();

  const rules = [];
  for (const id of staffUserIds) {
    for (let weekday = 1; weekday <= 5; weekday++) {
      rules.push({
        orgId: org.id,
        staffUserId: id,
        weekday,
        startMinute: 9 * 60,
        endMinute: 17 * 60,
      });
    }
  }
  await db.insert(availabilityRules).values(rules);

  const slotHours = [9, 10, 11, 12, 13, 14, 15, 16];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const bookingRows: Array<typeof bookings.$inferInsert> = [];
  const used = new Set<string>();
  let attempts = 0;
  while (bookingRows.length < spec.bookingTarget && attempts < 1000) {
    attempts++;
    const dayOffset = rndInt(-30, 30);
    const date = new Date(today);
    date.setDate(date.getDate() + dayOffset);
    const dow = date.getDay();
    if (dow === 0 || dow === 6) continue;
    const staffId = rnd(staffUserIds);
    const service = rnd(insertedServices);
    const customer = rnd(insertedCustomers);
    const startAt = new Date(date);
    startAt.setHours(rnd(slotHours), [0, 15, 30, 45][rndInt(0, 3)], 0, 0);
    const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000);
    if (endAt.getHours() >= 17 && endAt.getMinutes() > 0) continue;
    const slotKey = `${staffId}|${startAt.toISOString()}`;
    if (used.has(slotKey)) continue;
    used.add(slotKey);
    bookingRows.push({
      orgId: org.id,
      customerId: customer.id,
      serviceId: service.id,
      staffUserId: staffId,
      startAt,
      endAt,
      status: pickStatus(startAt),
      notes: Math.random() < 0.2 ? "Repeat customer." : null,
    });
  }
  await db.insert(bookings).values(bookingRows);

  console.log(
    `  ${spec.slug}: staff=${spec.staff.length}+${spec.extraMembers?.length ?? 0}, services=${insertedServices.length}, customers=${insertedCustomers.length}, bookings=${bookingRows.length}`,
  );
}

async function main() {
  console.log("Resetting tables...");
  await db.delete(bookings);
  await db.delete(availabilityRules);
  await db.delete(customers);
  await db.delete(services);
  await db.delete(memberships);
  await db.delete(organizations);
  await db.delete(users);

  const passwordHash = await bcrypt.hash("demo1234", 10);
  await seedOrg(BELLAS, passwordHash);
  await seedOrg(PINECREST, passwordHash);

  console.log(
    "\nLogin examples:\n  maria@bellas-salon.test (Bella's owner + Pinecrest manager)\n  hanna@pinecrest-clinic.test (Pinecrest owner only)\n  Password: demo1234",
  );
  await client.end();
}

main().catch(async (err) => {
  console.error(err);
  await client.end();
  process.exit(1);
});
