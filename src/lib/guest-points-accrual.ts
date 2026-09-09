/**
 * The loyalty accrual rule. One home for it.
 *
 * Two things were wrong before this module existed.
 *
 * It accrued on `order.totalCents`, so a hotel paid points on the 12% VAT it
 * remits to the BIR and on the 10% service charge — a ₱260 basket earned three
 * points against two points of actual revenue. The parameter was called
 * `totalCents`, which is fair warning about how the mistake happened: the name
 * told call sites to hand over the total.
 *
 * And the rule was written twice — here, and inlined again in
 * guest-point-sync.ts, which never called this function. Two copies of a money
 * rule drift, and which one a guest got depended on which code path awarded the
 * order.
 *
 * The reason it was reimplemented rather than reused is worth keeping in view:
 * guest-point-sync reports *why* it skipped, and a function returning a bare
 * number cannot say that. So this returns the reason too. A shared rule only
 * stays shared if it serves every caller's real needs.
 */

export type PointsSkipReason =
  | 'below_minimum_spend'
  | 'invalid_spend_rate';

export type PointsAccrual = {
  points: number;
  skipReason: PointsSkipReason | null;
};

export function calculateEarnedPoints(params: {
  /**
   * The spend points accrue against: the goods, before service charge and tax.
   *
   * Named for the decision rather than for a column, so a future call site has
   * to think about what it is passing instead of reaching for `totalCents`.
   */
  qualifyingSpendCents: number;
  spendCentsPerPoint: number;
  minimumSpendCents: number;
}): PointsAccrual {
  const spend = Math.max(
    Math.floor(Number(params.qualifyingSpendCents) || 0),
    0
  );

  /*
   * Minimum spend is checked first, and deliberately. When a hotel has both
   * misconfigured its rate and the guest is under the threshold, the guest is
   * genuinely under the threshold — reporting that is honest, where surfacing
   * an internal configuration fault as a spending one is not.
   */
  if (spend < params.minimumSpendCents) {
    return { points: 0, skipReason: 'below_minimum_spend' };
  }

  if (params.spendCentsPerPoint <= 0) {
    return { points: 0, skipReason: 'invalid_spend_rate' };
  }

  return {
    points: Math.floor(spend / params.spendCentsPerPoint),
    skipReason: null,
  };
}
