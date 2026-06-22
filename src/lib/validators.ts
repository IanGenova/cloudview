import { z } from 'zod';

const MAX_GUEST_ORDER_ITEM_QTY = 999;
const MAX_GUEST_ORDER_ITEMS = 30;

function optionalText(maxLength: number) {
  return z.preprocess(
    (value) => {
      if (value === null || value === undefined) {
        return '';
      }

      return value;
    },
    z.string().trim().max(maxLength)
  );
}

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
  notes: optionalText(300),
});

export const createGuestOrderSchema = z.object({
  tagCode: z.string().trim().min(2),
  /**
   * Important:
   * Guest name is optional because ROOM guests can be auto-filled from GuestStay.
   * Public-area guests may still manually type their name.
   */
  guestName: optionalText(100),
  notes: optionalText(1000),
  paymentMethod: z.enum(['ROOM_CHARGE', 'PAY_AT_COUNTER', 'CASH', 'POS']),
  fulfillmentTiming: z.enum(['ASAP', 'SCHEDULED']).optional().default('ASAP'),
  scheduledFor: z.string().trim().max(120).optional().default(''),
  scheduledNote: z.string().trim().max(300).optional().default(''),
    items: z
    .array(guestCartItemSchema)
    .min(1, 'Please select at least one item.')
    .max(
      MAX_GUEST_ORDER_ITEMS,
      `You can order up to ${MAX_GUEST_ORDER_ITEMS} different items only.`
    ),
});

export const createServiceRequestSchema = z.object({
  tagCode: z.string().trim().min(2),
  type: z.string().trim().min(2).max(80),
  /**
   * Also optional because service requests can use GuestStay guest name.
   */
  guestName: optionalText(100),
  notes: optionalText(1000),
});