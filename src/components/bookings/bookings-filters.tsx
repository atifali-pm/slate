"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { bookingStatusEnum } from "@/db/schema";
import type { BookingStatus } from "@/db/schema";
import type { OrgStaff } from "@/lib/bookings/queries";
import { buildSearchString, type ParsedFilters } from "@/lib/bookings/url-filters";

type Props = {
  filters: ParsedFilters;
  staff: OrgStaff[];
};

const ALL_STATUSES: BookingStatus[] = [...bookingStatusEnum.enumValues];

function toDateInput(d: Date | undefined): string {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function BookingsFilters({ filters, staff }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [from, setFrom] = useState(toDateInput(filters.from));
  const [to, setTo] = useState(toDateInput(filters.to));
  const [statuses, setStatuses] = useState<BookingStatus[]>(filters.status);
  const [staffUserId, setStaffUserId] = useState<string>(filters.staffUserId ?? "");
  const [query, setQuery] = useState(filters.query);

  function apply(next: Partial<ParsedFilters>) {
    const merged: Partial<ParsedFilters> = {
      from: from ? new Date(from + "T00:00:00") : undefined,
      to: to ? new Date(to + "T23:59:59") : undefined,
      status: statuses,
      staffUserId: staffUserId || undefined,
      query,
      page: 1,
      ...next,
    };
    startTransition(() => router.push(`/dashboard${buildSearchString(merged)}`));
  }

  function toggleStatus(status: BookingStatus) {
    setStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status],
    );
  }

  function setQuickRange(days: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    const end = new Date(today);
    if (days < 0) start.setDate(start.getDate() + days);
    else end.setDate(end.getDate() + days);
    setFrom(toDateInput(start));
    setTo(toDateInput(end));
    apply({
      from: start,
      to: new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59),
    });
  }

  function reset() {
    setFrom("");
    setTo("");
    setStatuses([]);
    setStaffUserId("");
    setQuery("");
    startTransition(() => router.push("/dashboard"));
  }

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4" data-testid="bookings-filters">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="filter-from">From</Label>
          <Input
            id="filter-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            data-testid="filter-from"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="filter-to">To</Label>
          <Input
            id="filter-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            data-testid="filter-to"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="filter-staff">Staff</Label>
          <select
            id="filter-staff"
            value={staffUserId}
            onChange={(e) => setStaffUserId(e.target.value)}
            className="border-input bg-background flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs"
            data-testid="filter-staff"
          >
            <option value="">All staff</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="filter-q">Search customer</Label>
          <Input
            id="filter-q"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name contains..."
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                apply({});
              }
            }}
            data-testid="filter-q"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Status:</span>
        {ALL_STATUSES.map((status) => {
          const active = statuses.includes(status);
          return (
            <button
              key={status}
              type="button"
              onClick={() => toggleStatus(status)}
              data-testid={`filter-status-${status}`}
              data-active={active}
              className={
                "rounded-md border px-2 py-0.5 text-xs uppercase tracking-wide transition-colors " +
                (active
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background text-muted-foreground hover:bg-muted")
              }
            >
              {status}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={() => apply({})} disabled={pending} data-testid="filter-apply">
          Apply filters
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setQuickRange(0)} disabled={pending}>
          Today
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setQuickRange(7)} disabled={pending}>
          Next 7 days
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setQuickRange(-7)} disabled={pending}>
          Last 7 days
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={reset} disabled={pending} data-testid="filter-reset">
          Reset
        </Button>
      </div>
    </div>
  );
}
