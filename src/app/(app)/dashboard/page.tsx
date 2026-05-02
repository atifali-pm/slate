import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
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
import {
  loadAnalyticsSummary,
  loadStaffUtilization,
  loadTopServices,
  rangeForLast,
} from "@/lib/analytics/queries";
import { BookingsFilters } from "@/components/bookings/bookings-filters";
import { BookingsTable } from "@/components/bookings/bookings-table";
import { NewBookingDialog } from "@/components/bookings/new-booking-dialog";
import { AnalyticsCards } from "@/components/analytics/analytics-cards";
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

  const last30 = rangeForLast(30);
  const [
    customerList,
    serviceList,
    staffList,
    filtered,
    summary,
    topServices,
    utilization,
  ] = await Promise.all([
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
    loadAnalyticsSummary(scope.orgId),
    loadTopServices(scope.orgId, last30.from, last30.to),
    loadStaffUtilization(scope.orgId, last30.from, last30.to),
  ]);

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

      {!noOrgData ? (
        <AnalyticsCards
          summary={summary}
          topServices={topServices}
          utilization={utilization}
        />
      ) : null}

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
