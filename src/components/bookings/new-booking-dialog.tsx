"use client";

import { useState, useTransition } from "react";
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
import { createBookingAction } from "@/lib/bookings/actions";
import type {
  OrgCustomer,
  OrgService,
  OrgStaff,
} from "@/lib/bookings/queries";

type Props = {
  customers: OrgCustomer[];
  services: OrgService[];
  staff: OrgStaff[];
  defaultStartAt: string;
};

export function NewBookingDialog({ customers, services, staff, defaultStartAt }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    const payload = {
      customerId: String(formData.get("customerId") ?? ""),
      serviceId: String(formData.get("serviceId") ?? ""),
      staffUserId: String(formData.get("staffUserId") ?? ""),
      startAt: new Date(String(formData.get("startAt") ?? "")).toISOString(),
      notes: String(formData.get("notes") ?? "") || null,
    };
    startTransition(async () => {
      const result = await createBookingAction(payload);
      if (!result.ok) setError(result.error);
      else setOpen(false);
    });
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        data-testid="open-new-booking"
      >
        + New booking
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg" data-testid="new-booking-dialog">
          <DialogHeader>
            <DialogTitle>New booking</DialogTitle>
            <DialogDescription>
              Times outside working hours and overlapping bookings are rejected
              by the server.
            </DialogDescription>
          </DialogHeader>
          <form
            action={onSubmit}
            className="space-y-4"
            data-testid="new-booking-form"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="new-customer">Customer</Label>
                <select
                  id="new-customer"
                  name="customerId"
                  required
                  defaultValue=""
                  className="border-input bg-background flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs"
                >
                  <option value="" disabled>
                    Pick customer
                  </option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-service">Service</Label>
                <select
                  id="new-service"
                  name="serviceId"
                  required
                  defaultValue=""
                  className="border-input bg-background flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs"
                >
                  <option value="" disabled>
                    Pick service
                  </option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.durationMinutes}min)
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-staff">Staff</Label>
                <select
                  id="new-staff"
                  name="staffUserId"
                  required
                  defaultValue=""
                  className="border-input bg-background flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs"
                >
                  <option value="" disabled>
                    Pick staff
                  </option>
                  {staff.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-start">Start time</Label>
                <Input
                  id="new-start"
                  name="startAt"
                  type="datetime-local"
                  required
                  defaultValue={defaultStartAt}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-notes">Notes</Label>
              <Input id="new-notes" name="notes" maxLength={500} placeholder="(optional)" />
            </div>
            {error ? (
              <p
                className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive"
                role="alert"
                data-testid="new-booking-error"
              >
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <DialogClose
                render={
                  <Button type="button" variant="ghost" size="sm" disabled={pending}>
                    Cancel
                  </Button>
                }
              />
              <Button
                type="submit"
                size="sm"
                disabled={pending}
                data-testid="new-booking-submit"
              >
                {pending ? "Booking..." : "Book appointment"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
