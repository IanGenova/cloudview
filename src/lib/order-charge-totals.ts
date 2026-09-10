/**
 * An order's service charge and tax, recomputed after a line is cancelled.
 *
 * The rule lived twice -- in `orders/actions.ts` and again in the guest
 * tracking page -- and both copies reverse-engineered the rates from money
 * that had already been rounded:
 *
 *   const taxRate = order.taxCents / order.subtotalCents;
 *
 * Those two columns are themselves rewritten on every cancellation, so each
 * step derived its rate from the previous step's rounding error and rounded
 * again. The error compounded upward instead of tracking the rate the hotel
 * actually charges. On a 12% hotel with an order of 100 items at one centavo,
 * cancelling them one at a time left the stored tax pinned at 12 all the way
 * down to a subtotal of 23 -- where 12% is 3, and the guest was being charged
 * an effective 52.2% VAT. Every intermediate refund was short by the same
 * drift.
 *
 * So the rates are passed in from `HotelSettings` rather than inferred.
 *
 * That is not perfect: an order placed before a rate change is recomputed at
 * today's rate. It is bounded and rare, where the old behaviour was unbounded
 * and happened on every cancellation. Capturing the rate on the order at
 * placement is the real fix and needs a migration.
 */

type OrderChargeLine = {
  id: string;
  quantity: number;
  unitPriceCents: number;
  cancelledQty: number;
};

/*
 * A rate that is negative, NaN or infinite is a misconfiguration, and the safe
 * reading of a misconfigured charge is zero -- never a credit, and never an
 * unbounded amount applied to a guest's bill.
 */
function safeRate(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function recalculateOrderTotals(input: {
  items: OrderChargeLine[];
  /** Treated as fully cancelled, for the line being cancelled right now. */
  cancelledItemId?: string;
  serviceChargeRate: number;
  taxRate: number;
}) {
  const serviceChargeRate = safeRate(input.serviceChargeRate);
  const taxRate = safeRate(input.taxRate);

  const subtotalCents = input.items.reduce((sum, item) => {
    const cancelledQty =
      item.id === input.cancelledItemId ? item.quantity : item.cancelledQty;

    const activeQty = Math.max(item.quantity - cancelledQty, 0);

    return sum + activeQty * item.unitPriceCents;
  }, 0);

  /*
   * Both charges are computed on the goods, matching how the order was priced
   * at placement in guest-food-order.ts -- tax is not charged on the service
   * charge.
   */
  const serviceChargeCents = Math.round(subtotalCents * serviceChargeRate);
  const taxCents = Math.round(subtotalCents * taxRate);

  return {
    subtotalCents,
    serviceChargeCents,
    taxCents,
    totalCents: subtotalCents + serviceChargeCents + taxCents,
  };
}
