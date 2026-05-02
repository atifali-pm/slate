import { z } from "zod";
import { bookingStatusEnum } from "@/db/schema";

const isoDateTime = z
  .string()
  .min(1)
  .refine((s) => !Number.isNaN(Date.parse(s)), {
    message: "Must be an ISO datetime string.",
  });

export const createBookingSchema = z.object({
  customerId: z.string().uuid(),
  serviceId: z.string().uuid(),
  staffUserId: z.string().uuid(),
  startAt: isoDateTime,
  notes: z.string().max(500).optional().nullable(),
});

export const rescheduleBookingSchema = z.object({
  bookingId: z.string().uuid(),
  startAt: isoDateTime,
  staffUserId: z.string().uuid().optional(),
});

export const updateStatusSchema = z.object({
  bookingId: z.string().uuid(),
  status: z.enum(bookingStatusEnum.enumValues),
});

export const bulkStatusSchema = z.object({
  bookingIds: z.array(z.string().uuid()).min(1).max(100),
  status: z.enum(bookingStatusEnum.enumValues),
});

export const updateNotesSchema = z.object({
  bookingId: z.string().uuid(),
  notes: z.string().max(500).nullable(),
});

export const deleteBookingSchema = z.object({
  bookingId: z.string().uuid(),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type RescheduleBookingInput = z.infer<typeof rescheduleBookingSchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
