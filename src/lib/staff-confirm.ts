import { money } from './money';

/**
 * Which staff actions stop and ask, and what they say when they do.
 *
 * Two of the five blockers in the 2 October audit live here.
 *
 * On the kitchen tablet, Reject fired `updateOrderStatusAction(CANCELLED)`
 * from a bare onClick — no dialog, no reason, no undo — eight pixels from
 * Accept and the same size, while the identical action on the desk screen was
 * correctly gated behind a modal demanding a reason. A cook with wet hands
 * moving past a wall-mounted tablet could cancel a guest's dinner and nobody
 * would know until the guest asked where it was.
 *
 * And Mark Paid, which declares that cash has been collected, moved ₱707.60
 * on a single click — on four cards that read identically apart from their
 * order code.
 *
 * The decision lives here, once, because the audit's finding was precisely
 * that it had been made four different ways in four places.
 */

export const STAFF_ACTIONS = [
  'accept',
  'start',
  'ready',
  'deliver',
  'reject',
  'cancel-order',
  'cancel-item',
  'mark-paid',
  'clear-sale',
] as const;

export type StaffAction = (typeof STAFF_ACTIONS)[number];

export type ConfirmContext = {
  code: string;
  totalCents: number;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  /** Set when one line is being cancelled rather than the whole order. */
  itemName?: string | null;
  itemTotalCents?: number | null;
};

export type StaffConfirm = {
  title: string;
  body: string;
  confirmLabel: string;
};

/** Moving an order along its own pipeline costs nothing and asks nothing. */
const FORWARD = new Set<string>(['accept', 'start', 'ready', 'deliver']);

const METHOD_WORDS: Record<string, string> = {
  PAY_AT_COUNTER: 'at the counter',
  CASH: 'in cash',
  ROOM_CHARGE: 'on the room bill',
  POS: 'at the POS terminal',
  PAYMONGO: 'through PayMongo',
  XENDIT: 'through Xendit',
};

/* Money already collected has to go back by hand on every method but Xendit. */
const COLLECTED = new Set(['PAID', 'PARTIALLY_REFUNDED', 'REFUND_FAILED']);

export function confirmFor(
  action: StaffAction,
  context: ConfirmContext
): StaffConfirm | null {
  if (FORWARD.has(action)) {
    return null;
  }

  const total = money(context.totalCents);
  const method = METHOD_WORDS[String(context.paymentMethod ?? '')] ?? 'by the method on the order';

  if (action === 'mark-paid') {
    return {
      title: `Record payment for ${context.code}?`,
      body: `This says the hotel has ${total} for order ${context.code}, paid ${method}. It is how the order stops being chased, so only do it once the money is in hand.`,
      confirmLabel: `Record ${total} received`,
    };
  }

  if (action === 'clear-sale') {
    if (!context.totalCents || context.totalCents <= 0) {
      return null;
    }

    return {
      title: `Clear this sale?`,
      body: `Everything rung up on ${context.code} — ${total} — is discarded and has to be keyed in again. Nothing is recorded.`,
      confirmLabel: 'Discard the sale',
    };
  }

  if (action === 'cancel-item') {
    const line = context.itemName ?? 'this line';
    const lineTotal = money(context.itemTotalCents ?? context.totalCents);
    const owed = COLLECTED.has(String(context.paymentStatus ?? ''))
      ? ` The guest has already paid, so ${lineTotal} goes back to them.`
      : '';

    return {
      title: `Cancel ${line} from ${context.code}?`,
      body: `${line} — ${lineTotal} — comes off order ${context.code} and its ingredients go back to stock.${owed}`,
      confirmLabel: 'Cancel this item',
    };
  }

  /*
   * Everything else — reject, cancel-order, and any action added later that
   * this rule has not been taught — is treated as destructive. An unknown
   * action asking one unnecessary question is a much cheaper mistake than an
   * unknown action cancelling an order silently.
   */
  const owed = COLLECTED.has(String(context.paymentStatus ?? ''))
    ? ` The guest has already paid, so ${total} has to go back to them.`
    : '';

  return {
    title: `Cancel order ${context.code}?`,
    body: `The whole order — ${total} — is cancelled, the guest is told, and its ingredients go back to stock. This cannot be undone from here.${owed}`,
    confirmLabel: 'Cancel the order',
  };
}

/** The question as one string, for a native confirm dialog. */
export function confirmMessage(action: StaffAction, context: ConfirmContext) {
  const c = confirmFor(action, context);

  return c ? `${c.title}\n\n${c.body}` : null;
}
