import { z } from 'zod';

const MAX_GUEST_ORDER_ITEM_QTY = 999;
const MAX_GUEST_ORDER_ITEMS = 30;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const guestCartItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce
    .number()
    .int('Quantity must be a whole number.')
    .min(1, 'Quantity must be at least 1.')
    .max(
      MAX_GUEST_ORDER_ITEM_QTY,
      `Quantity cannot exceed ${MAX_GUEST_ORDER_ITEM_QTY} per item.`
    ),
  notes: z.string().max(300).optional().nullable(),
});

export const createGuestOrderSchema = z.object({
  tagCode: z.string().min(2),
  guestName: z.string().max(100).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  paymentMethod: z.enum(['ROOM_CHARGE', 'PAY_AT_COUNTER', 'CASH', 'POS']),
  items: z
    .array(guestCartItemSchema)
    .min(1, 'Please select at least one item.')
    .max(MAX_GUEST_ORDER_ITEMS, `You can order up to ${MAX_GUEST_ORDER_ITEMS} different items only.`),
});

export const createServiceRequestSchema = z.object({
  tagCode: z.string().min(2),
  type: z.string().min(2).max(80),
  guestName: z.string().max(100).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});