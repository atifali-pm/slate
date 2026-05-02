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

export default async function DashboardPage() {
  const scope = await requireOrgScope();
  const [bookingCountRow, customerCountRow, serviceCountRow] =
    await Promise.all([
      db
        .select({ value: count() })
        .from(bookings)
        .where(eq(bookings.orgId, scope.orgId)),
      db
        .select({ value: count() })
        .from(customers)
        .where(eq(customers.orgId, scope.orgId)),
      db
        .select({ value: count() })
        .from(services)
        .where(eq(services.orgId, scope.orgId)),
    ]);
  const stats = [
    {
      label: "Bookings",
      value: bookingCountRow[0]?.value ?? 0,
      description: "Total bookings tracked",
    },
    {
      label: "Customers",
      value: customerCountRow[0]?.value ?? 0,
      description: "People who have booked",
    },
    {
      label: "Services",
      value: serviceCountRow[0]?.value ?? 0,
      description: "Offerings on the menu",
    },
  ];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {scope.orgName}
        </h1>
        <p className="text-sm text-muted-foreground">
          Phase 1 placeholder. The bookings dashboard with filters and inline
          actions arrives in Phase 3.
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
              <p className="text-sm text-muted-foreground">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
