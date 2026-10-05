import { money } from './money';

/**
 * What the desk needs to know about money before it sends an order to the
 * kitchen — one line, and a true one.
 *
 * CP-12 in the 2 October audit: the order-detail modal carried a "Staff
 * Review Checklist" of three rows, each with a green READY pill, directly
 * above Mark Paid. The first read "Payment verification — READY — PAY AT
 * COUNTER follows the hotel collection workflow" on an order badged UNPAID in
 * red three hundred pixels above it. None of the three rows could show any
 * other value for that order; the other two restated the item list and the
 * button beneath them. A clerk scanning three greens reads "payment is fine"
 * and sends food to a guest who has paid nothing.
 *
 * This replaces all three with the one fact that changes: where the money is.
 * `blocksKitchen` stays separate from the tone on purpose — a counter order is
 * unpaid *and* perfectly fine to cook, which is exactly the distinction the
 * three green pills destroyed.
 */

export type PaymentReadinessTone = 'live' | 'wait' | 'stop' | 'done';

export type PaymentReadiness = {
  tone: PaymentReadinessTone;
  label: string;
  detail: string;
  /** True only when the kitchen must not start until the money is verified. */
  blocksKitchen: boolean;
};

const SETTLED = new Set(['PAID', 'PARTIALLY_REFUNDED']);

const COLLECTED_HOW: Record<string, string> = {
  PAY_AT_COUNTER: 'at the counter when the guest collects',
  CASH: 'in cash on delivery',
  POS: 'at the POS terminal',
  ROOM_CHARGE: 'on the room bill at checkout',
};

export function paymentReadiness(order: {
  paymentMethod: string;
  paymentStatus: string;
  totalCents: number;
}): PaymentReadiness {
  const total = money(order.totalCents);

  if (order.paymentStatus === 'REFUND_PENDING' || order.paymentStatus === 'REFUND_FAILED') {
    return {
      tone: 'wait',
      label: 'Refund owed',
      detail: `${total} is owed back to the guest and has not been returned yet.`,
      blocksKitchen: false,
    };
  }

  if (order.paymentStatus === 'REFUNDED') {
    return {
      tone: 'done',
      label: 'Refunded',
      detail: `${total} has gone back to the guest. Nothing is outstanding.`,
      blocksKitchen: false,
    };
  }

  /*
   * Xendit is the one method the kitchen waits for, because the money arrives
   * through a webhook rather than through a person who can see it.
   */
  if (order.paymentMethod === 'XENDIT') {
    if (SETTLED.has(order.paymentStatus)) {
      return {
        tone: 'live',
        label: 'Paid through Xendit',
        detail: `${total} verified. The kitchen can start.`,
        blocksKitchen: false,
      };
    }

    return {
      tone: 'stop',
      label: 'Payment not verified',
      detail: `Wait for Xendit to confirm ${total} before preparing this order.`,
      blocksKitchen: true,
    };
  }

  if (SETTLED.has(order.paymentStatus)) {
    return {
      tone: 'live',
      label: 'Paid',
      detail: `${total} is in. Nothing is outstanding on this order.`,
      blocksKitchen: false,
    };
  }

  const how = COLLECTED_HOW[order.paymentMethod] ?? 'by the method on the order';

  return {
    tone: 'wait',
    label: 'To collect',
    detail: `${total} to collect ${how}. The kitchen can start now.`,
    blocksKitchen: false,
  };
}
