import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import bcrypt from "bcryptjs";
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
} from "./schema";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

const client = postgres(databaseUrl, { max: 1 });
const db = drizzle(client, { casing: "snake_case" });

const STAFF = [
  { name: "Maria Reyes", email: "maria@bellas-salon.test", role: "owner" as const },
  { name: "Jordan Chen", email: "jordan@bellas-salon.test", role: "manager" as const },
  { name: "Priya Patel", email: "priya@bellas-salon.test", role: "stylist" as const },
];

const SERVICES = [
  { name: "Haircut", durationMinutes: 30, priceCents: 4000 },
  { name: "Color", durationMinutes: 90, priceCents: 12000 },
  { name: "Blowout", durationMinutes: 45, priceCents: 5000 },
  { name: "Beard Trim", durationMinutes: 20, priceCents: 2500 },
  { name: "Highlights", durationMinutes: 120, priceCents: 18000 },
];

const CUSTOMER_NAMES = [
  "Aaliyah Brown", "Benjamin Carter", "Chloe Davis", "Diego Martinez",
  "Eva Nguyen", "Felix Okafor", "Grace Lee", "Hugo Schmidt",
  "Isabella Rossi", "Jamal Wright", "Kira Tanaka", "Liam O'Connor",
  "Maya Singh", "Noah Goldberg", "Olivia Park", "Pedro Alvarez",
  "Quinn Bailey", "Ravi Krishnan", "Sofia Petrova", "Tobias Weber",
];

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

async function main() {
  console.log("Resetting tables...");
  await db.delete(bookings);
  await db.delete(availabilityRules);
  await db.delete(customers);
  await db.delete(services);
  await db.delete(memberships);
  await db.delete(organizations);
  await db.delete(users);

  console.log("Inserting org...");
  const [org] = await db
    .insert(organizations)
    .values({ name: "Bella's Salon", slug: "bellas-salon" })
    .returning();

  console.log("Inserting users...");
  const passwordHash = await bcrypt.hash("demo1234", 10);
  const insertedUsers = await db
    .insert(users)
    .values(
      STAFF.map((s) => ({
        name: s.name,
        email: s.email.toLowerCase(),
        hashedPassword: passwordHash,
      })),
    )
    .returning();

  console.log("Inserting memberships...");
  await db.insert(memberships).values(
    insertedUsers.map((u, i) => ({
      userId: u.id,
      orgId: org.id,
      role: STAFF[i].role,
    })),
  );

  console.log("Inserting services...");
  const insertedServices = await db
    .insert(services)
    .values(SERVICES.map((s) => ({ ...s, orgId: org.id })))
    .returning();

  console.log("Inserting customers...");
  const insertedCustomers = await db
    .insert(customers)
    .values(
      CUSTOMER_NAMES.map((name) => ({
        orgId: org.id,
        name,
        email: `${slugify(name)}@example.com`,
        phone: `+1-555-${String(rndInt(1000, 9999)).padStart(4, "0")}`,
      })),
    )
    .returning();

  console.log("Inserting availability rules (M-F 9-5 for all staff)...");
  const rules = [];
  for (const u of insertedUsers) {
    for (let weekday = 1; weekday <= 5; weekday++) {
      rules.push({
        orgId: org.id,
        staffUserId: u.id,
        weekday,
        startMinute: 9 * 60,
        endMinute: 17 * 60,
      });
    }
  }
  await db.insert(availabilityRules).values(rules);

  console.log("Inserting 60 bookings...");
  const slotMinutes = [9, 10, 11, 12, 13, 14, 15, 16];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const bookingRows: Array<typeof bookings.$inferInsert> = [];
  let attempts = 0;
  const used = new Set<string>();
  while (bookingRows.length < 60 && attempts < 600) {
    attempts++;
    const dayOffset = rndInt(-30, 30);
    const date = new Date(today);
    date.setDate(date.getDate() + dayOffset);
    const dow = date.getDay();
    if (dow === 0 || dow === 6) continue;
    const staff = rnd(insertedUsers);
    const service = rnd(insertedServices);
    const customer = rnd(insertedCustomers);
    const startHour = rnd(slotMinutes);
    const startAt = new Date(date);
    startAt.setHours(startHour, [0, 15, 30, 45][rndInt(0, 3)], 0, 0);
    const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000);
    if (endAt.getHours() >= 17 && endAt.getMinutes() > 0) continue;
    const slotKey = `${staff.id}|${startAt.toISOString()}`;
    if (used.has(slotKey)) continue;
    used.add(slotKey);
    bookingRows.push({
      orgId: org.id,
      customerId: customer.id,
      serviceId: service.id,
      staffUserId: staff.id,
      startAt,
      endAt,
      status: pickStatus(startAt),
      notes: Math.random() < 0.2 ? "Repeat customer." : null,
    });
  }
  await db.insert(bookings).values(bookingRows);

  console.log(
    `Done. Org=${org.slug}, staff=${insertedUsers.length}, services=${insertedServices.length}, customers=${insertedCustomers.length}, bookings=${bookingRows.length}.`,
  );
  console.log("Login with: maria@bellas-salon.test / demo1234");
  await client.end();
}

main().catch(async (err) => {
  console.error(err);
  await client.end();
  process.exit(1);
});
