import { count, eq } from "drizzle-orm";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/db";
import { bookings, customers, services } from "@/db/schema";
import { requireOrgScope } from "@/lib/auth/scope";
import {
  listOrgCustomers,
  listOrgServices,
  listOrgStaff,
  listRecentBookings,
} from "@/lib/bookings/queries";
import { NewBookingForm } from "@/components/bookings/new-booking-form";
import { RecentBookings } from "@/components/bookings/recent-bookings";

function nextWeekdayAtTen() {
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMinutes(0);
  d.setHours(10);
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function DashboardPage() {
  const scope = await requireOrgScope();
  const [
    bookingCountRow,
    customerCountRow,
    serviceCountRow,
    customerList,
    serviceList,
    staffList,
    recent,
  ] = await Promise.all([
    db.select({ value: count() }).from(bookings).where(eq(bookings.orgId, scope.orgId)),
    db.select({ value: count() }).from(customers).where(eq(customers.orgId, scope.orgId)),
    db.select({ value: count() }).from(services).where(eq(services.orgId, scope.orgId)),
    listOrgCustomers(scope.orgId),
    listOrgServices(scope.orgId),
    listOrgStaff(scope.orgId),
    listRecentBookings(scope.orgId, 10),
  ]);

  const stats = [
    { label: "Bookings", value: bookingCountRow[0]?.value ?? 0, description: "Total bookings tracked" },
    { label: "Customers", value: customerCountRow[0]?.value ?? 0, description: "People who have booked" },
    { label: "Services", value: serviceCountRow[0]?.value ?? 0, description: "Offerings on the menu" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{scope.orgName}</h1>
        <p className="text-sm text-muted-foreground">
          Phase 2 placeholder. Phase 3 replaces this with the real bookings list,
          filters, and inline edit.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="pb-2">
              <CardDescription>{stat.label}</CardDescription>
              <CardTitle className="text-3xl">{stat.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {customerList.length === 0 || serviceList.length === 0 || staffList.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Add customers, services, and staff before booking. Run{" "}
          <code className="rounded bg-muted px-1 py-0.5">pnpm db:seed</code> to
          populate demo data.
        </p>
      ) : (
        <NewBookingForm
          customers={customerList}
          services={serviceList}
          staff={staffList}
          defaultStartAt={nextWeekdayAtTen()}
        />
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Recent bookings</h2>
        <RecentBookings rows={recent} />
      </section>
    </div>
  );
}
