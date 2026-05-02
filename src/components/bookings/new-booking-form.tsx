"use client";

import { useState, useTransition } from "react";
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

export function NewBookingForm({
  customers,
  services,
  staff,
  defaultStartAt,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    setOkMsg(null);
    const payload = {
      customerId: String(formData.get("customerId") ?? ""),
      serviceId: String(formData.get("serviceId") ?? ""),
      staffUserId: String(formData.get("staffUserId") ?? ""),
      startAt: new Date(String(formData.get("startAt") ?? "")).toISOString(),
      notes: String(formData.get("notes") ?? "") || null,
    };
    startTransition(async () => {
      const result = await createBookingAction(payload);
      if (result.ok) setOkMsg(`Booked. id=${result.data.id.slice(0, 8)}...`);
      else setError(result.error);
    });
  }

  return (
    <form
      action={onSubmit}
      className="grid grid-cols-1 gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2"
      data-testid="new-booking-form"
    >
      <div className="space-y-1.5 sm:col-span-2">
        <h2 className="text-base font-semibold">New booking</h2>
        <p className="text-xs text-muted-foreground">
          Phase 2 placeholder form. Phase 3 replaces this with the real
          bookings list and inline create.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="customerId">Customer</Label>
        <select
          id="customerId"
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
        <Label htmlFor="serviceId">Service</Label>
        <select
          id="serviceId"
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
        <Label htmlFor="staffUserId">Staff</Label>
        <select
          id="staffUserId"
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
        <Label htmlFor="startAt">Start time</Label>
        <Input
          id="startAt"
          name="startAt"
          type="datetime-local"
          required
          defaultValue={defaultStartAt}
        />
      </div>

      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="notes">Notes</Label>
        <Input id="notes" name="notes" maxLength={500} placeholder="(optional)" />
      </div>

      {error ? (
        <p
          className="text-sm text-destructive sm:col-span-2"
          role="alert"
          data-testid="booking-error"
        >
          {error}
        </p>
      ) : null}
      {okMsg ? (
        <p
          className="text-sm text-emerald-600 sm:col-span-2"
          data-testid="booking-success"
        >
          {okMsg}
        </p>
      ) : null}

      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Booking..." : "Book appointment"}
        </Button>
      </div>
    </form>
  );
}
