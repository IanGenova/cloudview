/**
 * What a guest still owes on a food order when their stay is checked out.
 *
 * One home for the rule, because it had two. `guest-stays/actions.ts` billed
 * the folio with it and `guest-stays/page.tsx` previewed the folio with a
 * byte-identical copy, so the screen and the charge agreed with each other and
 * both were wrong the same two ways:
 *
 *   1. Only PAID short-circuited to zero. A PARTIALLY_REFUNDED order -- the
 *      shape produced whenever a guest cancels one item of a paid Xendit order
 *      -- fell through and was billed a second time on top of the payment they
 *      had already made and the refund they had already received.
 *
 *   2. It prorated `order.totalCents` by active/original item subtotal. Both
 *      cancel paths already rewrite totalCents when an item is cancelled
 *      (orders/actions.ts recalculateOrderTotalsAfterItemCancellation, and the
 *      guest track page's equivalent), so the reduction was applied twice and
 *      the hotel billed about half of what it was owed.
 *
 * Taking strings rather than the Prisma enums keeps this testable without a
 * database or a generated client; the enums are string unions at runtime, so
 * call sites pass their columns straight through.
 */

/*
 * Anything that is not UNPAID has been settled, or is being settled, somewhere
 * that is not this folio. Billing it here charges the guest twice.
 *
 * This is deliberately an allowlist of one. The previous denylist -- "not
 * PAID" -- is exactly what let three refund statuses through, and a denylist
 * grows a new hole every time a payment status is added.
 */
const BILLABLE_PAYMENT_STATUS = 'UNPAID';

/*
 * Only food that actually reached the guest belongs on their bill. An order
 * still in the kitchen when the stay closes is a front-desk problem, not a
 * folio line.
 */
const BILLABLE_ORDER_STATUSES = new Set(['READY', 'DELIVERED']);

export type FolioChargeableOrder = {
  totalCents: number;
  paymentStatus: string;
  status: string;
  items: Array<{
    quantity: number;
    unitPriceCents: number;
    cancelledQty: number;
    status: string;
  }>;
};

export function getOrderOutstandingCents(order: FolioChargeableOrder) {
  if (order.paymentStatus !== BILLABLE_PAYMENT_STATUS) {
    return 0;
  }

  if (!BILLABLE_ORDER_STATUSES.has(order.status)) {
    return 0;
  }

  /*
   * Whole-order cancellation via updateOrderStatusAction leaves totalCents
   * untouched, while item-by-item cancellation zeroes it. Checking the items
   * catches both, and catches an order whose every line was cancelled without
   * the order itself ever moving to CANCELLED.
   */
  const hasDeliverableItem = order.items.some(
    (item) =>
      item.status !== 'CANCELLED' &&
      Math.max(item.quantity - item.cancelledQty, 0) > 0
  );

  if (!hasDeliverableItem) {
    return 0;
  }

  /*
   * `totalCents` is already authoritative: it carries this order's own service
   * charge and tax at the rates that applied when it was placed, and it has
   * already been reduced for any cancelled item. Re-deriving anything from the
   * item subtotals here is what produced the double discount.
   */
  return Math.max(order.totalCents, 0);
}
