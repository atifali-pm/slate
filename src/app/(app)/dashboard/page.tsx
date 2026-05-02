import { count, eq } from "drizzle-orm";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
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
  listFilteredBookings,
  listOrgCustomers,
  listOrgServices,
  listOrgStaff,
} from "@/lib/bookings/queries";
import {
  parseFiltersFromParams,
  PAGE_SIZE,
  buildSearchString,
} from "@/lib/bookings/url-filters";
import { BookingsFilters } from "@/components/bookings/bookings-filters";
import { BookingsTable } from "@/components/bookings/bookings-table";
import { NewBookingDialog } from "@/components/bookings/new-booking-dialog";
import Link from "next/link";

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

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const scope = await requireOrgScope();
  const params = await searchParams;
  const filters = parseFiltersFromParams(params);

  const [
    bookingCountRow,
    customerCountRow,
    serviceCountRow,
    customerList,
    serviceList,
    staffList,
    filtered,
  ] = await Promise.all([
    db.select({ value: count() }).from(bookings).where(eq(bookings.orgId, scope.orgId)),
    db.select({ value: count() }).from(customers).where(eq(customers.orgId, scope.orgId)),
    db.select({ value: count() }).from(services).where(eq(services.orgId, scope.orgId)),
    listOrgCustomers(scope.orgId),
    listOrgServices(scope.orgId),
    listOrgStaff(scope.orgId),
    listFilteredBookings(
      scope.orgId,
      {
        from: filters.from,
        to: filters.to,
        status: filters.status.length > 0 ? filters.status : undefined,
        staffUserId: filters.staffUserId,
        query: filters.query,
      },
      { limit: PAGE_SIZE, offset: (filters.page - 1) * PAGE_SIZE },
    ),
  ]);

  const stats = [
    { label: "Bookings", value: bookingCountRow[0]?.value ?? 0, description: "Total in this org" },
    { label: "Customers", value: customerCountRow[0]?.value ?? 0, description: "People who have booked" },
    { label: "Services", value: serviceCountRow[0]?.value ?? 0, description: "Offerings on the menu" },
  ];

  const totalPages = Math.max(1, Math.ceil(filtered.total / PAGE_SIZE));
  const currentPage = filters.page;
  const showingFrom = filtered.rows.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const showingTo = (currentPage - 1) * PAGE_SIZE + filtered.rows.length;

  const noOrgData =
    customerList.length === 0 || serviceList.length === 0 || staffList.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{scope.orgName}</h1>
          <p className="text-sm text-muted-foreground">
            Bookings dashboard. Filter, edit inline, bulk-confirm or cancel.
          </p>
        </div>
        {!noOrgData ? (
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/calendar"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              data-testid="open-calendar"
            >
              Calendar view
            </Link>
            <NewBookingDialog
              customers={customerList}
              services={serviceList}
              staff={staffList}
              defaultStartAt={nextWeekdayAtTen()}
            />
          </div>
        ) : null}
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

      {noOrgData ? (
        <p className="text-sm text-muted-foreground">
          Add customers, services, and staff before booking. Run{" "}
          <code className="rounded bg-muted px-1 py-0.5">pnpm db:seed</code> to
          populate demo data.
        </p>
      ) : (
        <>
          <BookingsFilters filters={filters} staff={staffList} />

          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <div data-testid="bookings-summary">
              {filtered.total === 0
                ? "No bookings match your filters."
                : `Showing ${showingFrom}-${showingTo} of ${filtered.total}`}
            </div>
            {totalPages > 1 ? (
              <div className="flex items-center gap-2">
                <Pager
                  page={currentPage}
                  totalPages={totalPages}
                  filters={filters}
                />
              </div>
            ) : null}
          </div>

          <BookingsTable rows={filtered.rows} staff={staffList} />
        </>
      )}
    </div>
  );
}

function Pager({
  page,
  totalPages,
  filters,
}: {
  page: number;
  totalPages: number;
  filters: ReturnType<typeof parseFiltersFromParams>;
}) {
  const prevHref = `/dashboard${buildSearchString({ ...filters, page: Math.max(1, page - 1) })}`;
  const nextHref = `/dashboard${buildSearchString({ ...filters, page: Math.min(totalPages, page + 1) })}`;
  const linkClass = buttonVariants({ variant: "outline", size: "sm" });
  const disabledClass = "pointer-events-none opacity-50";
  return (
    <>
      <Link
        href={prevHref}
        className={`${linkClass} ${page <= 1 ? disabledClass : ""}`}
        aria-disabled={page <= 1}
        data-testid="page-prev"
      >
        Previous
      </Link>
      <span className="text-xs text-muted-foreground">
        Page {page} of {totalPages}
      </span>
      <Link
        href={nextHref}
        className={`${linkClass} ${page >= totalPages ? disabledClass : ""}`}
        aria-disabled={page >= totalPages}
        data-testid="page-next"
      >
        Next
      </Link>
    </>
  );
}
