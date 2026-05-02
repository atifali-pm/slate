"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  bulkUpdateStatusAction,
  updateBookingStatusAction,
} from "@/lib/bookings/actions";
import type { FilteredBooking, OrgStaff } from "@/lib/bookings/queries";
import type { BookingStatus } from "@/db/schema";
import { EditBookingDialog } from "./edit-booking-dialog";

type Props = {
  rows: FilteredBooking[];
  staff: OrgStaff[];
};

const STATUS_VARIANT: Record<BookingStatus, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  confirmed: "default",
  completed: "outline",
  cancelled: "destructive",
};

const NEXT_ACTIONS: Record<BookingStatus, { label: string; status: BookingStatus }[]> = {
  pending: [
    { label: "Confirm", status: "confirmed" },
    { label: "Cancel", status: "cancelled" },
  ],
  confirmed: [
    { label: "Complete", status: "completed" },
    { label: "Cancel", status: "cancelled" },
  ],
  cancelled: [],
  completed: [],
};

function formatStart(date: Date) {
  return new Date(date).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRange(start: Date, end: Date) {
  const startStr = new Date(start).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const endStr = new Date(end).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${startStr} - ${endStr}`;
}

export function BookingsTable({ rows, staff }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<FilteredBooking | null>(null);

  const allSelected = useMemo(
    () => rows.length > 0 && rows.every((r) => selected.has(r.id)),
    [rows, selected],
  );

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function changeStatus(bookingId: string, status: BookingStatus) {
    setError(null);
    startTransition(async () => {
      const result = await updateBookingStatusAction({ bookingId, status });
      if (!result.ok) setError(result.error);
    });
  }

  function bulkStatus(status: BookingStatus) {
    if (selected.size === 0) return;
    setError(null);
    const ids = [...selected];
    startTransition(async () => {
      const result = await bulkUpdateStatusAction({ bookingIds: ids, status });
      if (!result.ok) setError(result.error);
      else {
        if (result.data.updated < ids.length) {
          setError(
            `Updated ${result.data.updated}; ${result.data.rejected.length} were in a terminal state and skipped.`,
          );
        }
        setSelected(new Set());
      }
    });
  }

  if (rows.length === 0) {
    return (
      <div
        className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground"
        data-testid="empty-state"
      >
        No bookings match your filters.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {selected.size > 0 ? (
        <div
          className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-3"
          data-testid="bulk-toolbar"
        >
          <span className="text-sm font-medium" data-testid="bulk-count">
            {selected.size} selected
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => bulkStatus("confirmed")}
            disabled={pending}
            data-testid="bulk-confirm"
          >
            Bulk confirm
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={() => bulkStatus("cancelled")}
            disabled={pending}
            data-testid="bulk-cancel"
          >
            Bulk cancel
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setSelected(new Set())}
            disabled={pending}
          >
            Clear
          </Button>
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-destructive" role="alert" data-testid="table-error">
          {error}
        </p>
      ) : null}

      {/* Desktop: table */}
      <div className="hidden md:block">
        <Table data-testid="bookings-table">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allSelected}
                  onChange={toggleAll}
                  data-testid="select-all"
                />
              </TableHead>
              <TableHead>When</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Service</TableHead>
              <TableHead>Staff</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-56">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((b) => (
              <TableRow key={b.id} data-testid={`booking-row-${b.id}`}>
                <TableCell>
                  <input
                    type="checkbox"
                    aria-label={`Select booking ${b.id}`}
                    checked={selected.has(b.id)}
                    onChange={() => toggleOne(b.id)}
                    data-testid={`select-${b.id}`}
                  />
                </TableCell>
                <TableCell className="font-medium">{formatRange(b.startAt, b.endAt)}</TableCell>
                <TableCell>{b.customerName}</TableCell>
                <TableCell>{b.serviceName}</TableCell>
                <TableCell>{b.staffName}</TableCell>
                <TableCell>
                  <Badge
                    variant={STATUS_VARIANT[b.status]}
                    data-testid={`status-${b.id}`}
                  >
                    {b.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {NEXT_ACTIONS[b.status].map((action) => (
                      <Button
                        key={action.status}
                        type="button"
                        size="xs"
                        variant={action.status === "cancelled" ? "destructive" : "outline"}
                        disabled={pending}
                        onClick={() => changeStatus(b.id, action.status)}
                        data-testid={`action-${action.status}-${b.id}`}
                      >
                        {action.label}
                      </Button>
                    ))}
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => setEditing(b)}
                      data-testid={`edit-${b.id}`}
                    >
                      Edit
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile: cards */}
      <div className="space-y-2 md:hidden">
        {rows.map((b) => (
          <div
            key={b.id}
            className="rounded-lg border bg-card p-3"
            data-testid={`booking-card-${b.id}`}
          >
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  aria-label={`Select booking ${b.id}`}
                  checked={selected.has(b.id)}
                  onChange={() => toggleOne(b.id)}
                />
                <span className="text-sm font-medium">{formatStart(b.startAt)}</span>
              </label>
              <Badge variant={STATUS_VARIANT[b.status]}>{b.status}</Badge>
            </div>
            <div className="mt-2 space-y-0.5 text-sm">
              <div>
                <span className="text-muted-foreground">Customer:</span> {b.customerName}
              </div>
              <div>
                <span className="text-muted-foreground">Service:</span> {b.serviceName} ({b.durationMinutes}min)
              </div>
              <div>
                <span className="text-muted-foreground">Staff:</span> {b.staffName}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
              {NEXT_ACTIONS[b.status].map((action) => (
                <Button
                  key={action.status}
                  type="button"
                  size="xs"
                  variant={action.status === "cancelled" ? "destructive" : "outline"}
                  disabled={pending}
                  onClick={() => changeStatus(b.id, action.status)}
                >
                  {action.label}
                </Button>
              ))}
              <Button
                type="button"
                size="xs"
                variant="ghost"
                disabled={pending}
                onClick={() => setEditing(b)}
              >
                Edit
              </Button>
            </div>
          </div>
        ))}
      </div>

      <EditBookingDialog
        booking={editing}
        open={!!editing}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
        staff={staff}
      />
    </div>
  );
}
