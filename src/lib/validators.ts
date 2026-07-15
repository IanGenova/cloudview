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

/**
 * Login must accept simple temporary passwords like "12345" or "abcde".
 * Password strength rules belong in account creation/reset, not in login.
 */
export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().trim().min(1).max(300),
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
  guestName: z.string().trim().min(2, 'Guest name is required.').max(100),
  guestPhone: z
    .string()
    .trim()
    .min(7, 'Guest phone number is required.')
    .max(40),
  notes: optionalText(1000),
  orderType: z
    .enum(['ROOM_SERVICE', 'DINE_IN', 'TAKE_OUT', 'PICK_UP'])
    .optional()
    .default('ROOM_SERVICE'),
  roomNumber: optionalText(40),
  roomPasscode: optionalText(20),
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
  guestName: z.string().trim().min(2, 'Guest name is required.').max(100),
  guestPhone: z.string().trim().min(7, 'Guest phone number is required.').max(40),
  roomNumber: optionalText(40),
  roomPasscode: optionalText(20),
  requestDestination: z
    .enum(['CURRENT_LOCATION', 'GUEST_ROOM'])
    .optional()
    .default('CURRENT_LOCATION'),
  notes: optionalText(1000),
});
