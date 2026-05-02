"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  rescheduleBookingAction,
  updateBookingNotesAction,
  deleteBookingAction,
} from "@/lib/bookings/actions";
import type { FilteredBooking } from "@/lib/bookings/queries";
import type { OrgStaff } from "@/lib/bookings/queries";

type Props = {
  booking: FilteredBooking | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: OrgStaff[];
};

function toDateTimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EditBookingDialog({ booking, open, onOpenChange, staff }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [startAt, setStartAt] = useState("");
  const [staffUserId, setStaffUserId] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (booking) {
      setError(null);
      setStartAt(toDateTimeLocal(new Date(booking.startAt)));
      setStaffUserId(booking.staffUserId);
      setNotes(booking.notes ?? "");
    }
  }, [booking]);

  if (!booking) return null;

  function reschedule() {
    if (!booking) return;
    setError(null);
    const isoStart = new Date(startAt).toISOString();
    const newStaff = staffUserId === booking.staffUserId ? undefined : staffUserId;
    startTransition(async () => {
      const result = await rescheduleBookingAction({
        bookingId: booking.id,
        startAt: isoStart,
        staffUserId: newStaff,
      });
      if (!result.ok) setError(result.error);
      else onOpenChange(false);
    });
  }

  function saveNotes() {
    if (!booking) return;
    setError(null);
    startTransition(async () => {
      const result = await updateBookingNotesAction({
        bookingId: booking.id,
        notes: notes.trim() ? notes : null,
      });
      if (!result.ok) setError(result.error);
      else onOpenChange(false);
    });
  }

  function remove() {
    if (!booking) return;
    if (!confirm("Delete this booking? This cannot be undone.")) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteBookingAction({ bookingId: booking.id });
      if (!result.ok) setError(result.error);
      else onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="edit-booking-dialog">
        <DialogHeader>
          <DialogTitle>Edit booking</DialogTitle>
          <DialogDescription>
            {booking.customerName} - {booking.serviceName} ({booking.durationMinutes} min)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-start">Start time</Label>
              <Input
                id="edit-start"
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                data-testid="edit-start"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-staff">Staff</Label>
              <select
                id="edit-staff"
                value={staffUserId}
                onChange={(e) => setStaffUserId(e.target.value)}
                className="border-input bg-background flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs"
                data-testid="edit-staff"
              >
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-notes">Notes</Label>
            <Input
              id="edit-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
              placeholder="(optional)"
              data-testid="edit-notes"
            />
          </div>

          {error ? (
            <p
              className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive"
              role="alert"
              data-testid="edit-error"
            >
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter className="flex flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={remove}
            disabled={pending}
            data-testid="edit-delete"
          >
            Delete
          </Button>
          <div className="flex flex-wrap gap-2">
            <DialogClose
              render={
                <Button type="button" variant="ghost" size="sm" disabled={pending}>
                  Close
                </Button>
              }
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={saveNotes}
              disabled={pending}
              data-testid="edit-save-notes"
            >
              Save notes
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={reschedule}
              disabled={pending}
              data-testid="edit-reschedule"
            >
              Reschedule
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
