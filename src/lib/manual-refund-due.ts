/**
 * When a cancellation leaves money the hotel must hand back by hand.
 *
 * A Xendit order cancelled after payment gets a GuestXenditRefund row and an
 * automatic refund. Every other method -- cash, the counter, the POS terminal,
 * a room charge settled on the folio at checkout -- is collected by a person,
 * and nothing automates giving it back. The second ultra inspection marked a
 * PAY_AT_COUNTER order PAID, cancelled it from the tracking page and read the
 * row: paymentStatus PAID, totalCents 0. The till held 317.20 pesos that
 * belonged to the guest and nothing anywhere said so.
 *
 * The marker is the existing REFUND_PENDING status -- the dashboard already
 * renders it amber as "Refund pending" and the reports already count it as
 * settled money -- plus a history note naming the amount and how it was paid,
 * so the person clearing it knows what to hand over. Clearing it is a later
 * phase; recording it is this one.
 */

import { money } from './money';

/*
 * The methods with an automatic refund path. A denylist on purpose: a payment
 * method added without refund automation must land on the manual marker, not
 * silently vanish the way cash did. An allowlist of manual methods would
 * forget the next one.
 */
const AUTOMATED_REFUND_PAYMENT_METHODS = new Set(['XENDIT']);

/*
 * Statuses under which the money has been collected and not yet returned. A
 * second cancellation on an order already marked REFUND_PENDING adds another
 * note with its own amount; the status does not move.
 */
const COLLECTED_PAYMENT_STATUSES = new Set(['PAID', 'REFUND_PENDING']);

const PAID_HOW: Record<string, string> = {
  CASH: 'in cash',
  PAY_AT_COUNTER: 'at the counter',
  POS: 'at the POS terminal',
  ROOM_CHARGE: 'on the room bill',
  PAYMONGO: 'through PayMongo',
};

export type ManualRefundDue = {
  paymentStatus: 'REFUND_PENDING';
  amountCents: number;
  note: string;
};

export function manualRefundDue(input: {
  paymentMethod: string;
  paymentStatus: string;
  refundAmountCents: number;
}): ManualRefundDue | null {
  if (AUTOMATED_REFUND_PAYMENT_METHODS.has(input.paymentMethod)) {
    return null;
  }

  if (!COLLECTED_PAYMENT_STATUSES.has(input.paymentStatus)) {
    return null;
  }

  const amountCents = Math.round(input.refundAmountCents);

  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return null;
  }

  const paidHow = PAID_HOW[input.paymentMethod] ?? `via ${input.paymentMethod}`;

  return {
    paymentStatus: 'REFUND_PENDING',
    amountCents,
    note: `Refund due: ${money(amountCents)} paid ${paidHow} is owed back to the guest and must be returned by hand.`,
  };
}
