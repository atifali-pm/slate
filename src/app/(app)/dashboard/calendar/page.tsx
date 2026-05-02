import { requireOrgScope } from "@/lib/auth/scope";
import {
  listFilteredBookings,
  listOrgStaff,
} from "@/lib/bookings/queries";
import {
  parseCalendarParams,
  rangeForView,
} from "@/lib/calendar/dates";
import { CalendarToolbar } from "@/components/calendar/calendar-toolbar";
import { DayGrid } from "@/components/calendar/day-grid";
import { WeekGrid } from "@/components/calendar/week-grid";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const scope = await requireOrgScope();
  const params = await searchParams;
  const { view, date } = parseCalendarParams(params);
  const range = rangeForView(view, date);

  const [staff, filtered] = await Promise.all([
    listOrgStaff(scope.orgId),
    listFilteredBookings(
      scope.orgId,
      { from: range.from, to: range.to },
      { limit: 500, offset: 0 },
    ),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{scope.orgName}</h1>
        <p className="text-sm text-muted-foreground">
          Calendar view. Drag a booking to reschedule.
        </p>
      </div>
      <CalendarToolbar view={view} date={date} />
      {view === "day" ? (
        <DayGrid date={date} staff={staff} bookings={filtered.rows} />
      ) : (
        <WeekGrid anchor={date} bookings={filtered.rows} />
      )}
    </div>
  );
}
