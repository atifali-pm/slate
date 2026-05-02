import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  AnalyticsSummary,
  StaffUtilization,
  TopService,
} from "@/lib/analytics/queries";

type Props = {
  summary: AnalyticsSummary;
  topServices: TopService[];
  utilization: StaffUtilization[];
};

function pct(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

function formatMoneyCents(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

function formatMinutes(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r === 0 ? `${h}h` : `${h}h ${r}m`;
}

export function AnalyticsCards({ summary, topServices, utilization }: Props) {
  const todayConfirmed = summary.today.breakdown.confirmed + summary.today.breakdown.pending;
  const todayCompleted = summary.today.breakdown.completed;
  const todayCancelled = summary.today.breakdown.cancelled;

  const nextConfirmed =
    summary.next7Days.breakdown.confirmed + summary.next7Days.breakdown.pending;

  const maxBookingsTopService = Math.max(1, ...topServices.map((s) => s.bookingsCount));
  const totalRevenue = topServices.reduce((acc, s) => acc + s.revenueCents, 0);

  return (
    <div className="space-y-6" data-testid="analytics-cards">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Today"
          value={String(summary.today.total)}
          description={`${todayConfirmed} on the books, ${todayCompleted} completed, ${todayCancelled} cancelled`}
          testId="kpi-today"
        />
        <KpiCard
          label="Next 7 days"
          value={String(summary.next7Days.total)}
          description={`${nextConfirmed} confirmed or pending`}
          testId="kpi-next7"
        />
        <KpiCard
          label="Cancellation rate"
          value={pct(summary.last30Days.cancellationRate, 1)}
          description="Last 30 days, cancelled / (cancelled + completed)"
          testId="kpi-cancel-rate"
        />
        <KpiCard
          label="30-day volume"
          value={String(summary.last30Days.total)}
          description={`${summary.last30Days.breakdown.completed} completed`}
          testId="kpi-30day"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card data-testid="top-services-card">
          <CardHeader className="pb-2">
            <CardDescription>Top services</CardDescription>
            <CardTitle className="text-base">Last 30 days</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {topServices.length === 0 ? (
              <p className="text-sm text-muted-foreground">No bookings in this window.</p>
            ) : (
              <>
                {topServices.map((s) => {
                  const ratio = s.bookingsCount / maxBookingsTopService;
                  return (
                    <div key={s.serviceId} className="space-y-1" data-testid={`top-service-${s.serviceId}`}>
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="font-medium">{s.name}</span>
                        <span className="text-muted-foreground">
                          {s.bookingsCount} bookings - {formatMoneyCents(s.revenueCents)}
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-foreground/80"
                          style={{ width: `${Math.max(4, ratio * 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {totalRevenue > 0 ? (
                  <p className="pt-1 text-xs text-muted-foreground">
                    Revenue across these top services: {formatMoneyCents(totalRevenue)}.
                  </p>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="utilization-card">
          <CardHeader className="pb-2">
            <CardDescription>Staff utilization</CardDescription>
            <CardTitle className="text-base">Last 30 days</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {utilization.length === 0 ? (
              <p className="text-sm text-muted-foreground">No staff to report on yet.</p>
            ) : (
              utilization.map((u) => {
                const ratio = Math.min(1, u.utilization);
                return (
                  <div key={u.staffUserId} className="space-y-1" data-testid={`util-${u.staffUserId}`}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="font-medium">{u.name}</span>
                      <span className="text-muted-foreground">
                        {pct(u.utilization, 0)} - {formatMinutes(u.bookedMinutes)} of {formatMinutes(u.availableMinutes)}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-foreground/80"
                        style={{ width: `${Math.max(4, ratio * 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  description,
  testId,
}: {
  label: string;
  value: string;
  description: string;
  testId: string;
}) {
  return (
    <Card data-testid={testId}>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
