import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

export const guestCartItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1).max(20),
  notes: z.string().max(300).optional().nullable()
});

export const createGuestOrderSchema = z.object({
  tagCode: z.string().min(2),
  guestName: z.string().max(100).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  paymentMethod: z.enum(['ROOM_CHARGE', 'PAY_AT_COUNTER', 'CASH', 'POS']),
  items: z.array(guestCartItemSchema).min(1).max(30)
});

export const createServiceRequestSchema = z.object({
  tagCode: z.string().min(2),
  type: z.string().min(2).max(80),
  guestName: z.string().max(100).optional().nullable(),
  notes: z.string().max(1000).optional().nullable()
});
