"use client";

import { useState, useTransition } from "react";
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
import { updateBookingStatusAction } from "@/lib/bookings/actions";
import type { RecentBooking } from "@/lib/bookings/queries";
import type { BookingStatus } from "@/db/schema";

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

export function RecentBookings({ rows }: { rows: RecentBooking[] }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function changeStatus(bookingId: string, status: BookingStatus) {
    setError(null);
    startTransition(async () => {
      const result = await updateBookingStatusAction({ bookingId, status });
      if (!result.ok) setError(result.error);
    });
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No bookings yet.</p>
    );
  }

  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Service</TableHead>
            <TableHead>Staff</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-44">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((b) => (
            <TableRow key={b.id} data-testid={`booking-row-${b.id}`}>
              <TableCell className="font-medium">{formatStart(b.startAt)}</TableCell>
              <TableCell>{b.customerName}</TableCell>
              <TableCell>{b.serviceName}</TableCell>
              <TableCell>{b.staffName}</TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[b.status]} data-testid={`status-${b.id}`}>
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
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {error ? (
        <p className="text-sm text-destructive" role="alert" data-testid="status-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
