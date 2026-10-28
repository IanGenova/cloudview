export function getPOSCashSettlement(
  totalCents: number,
  cashTenderedCents: number | undefined
) {
  if (
    !Number.isSafeInteger(totalCents) ||
    totalCents < 0 ||
    !Number.isSafeInteger(cashTenderedCents) ||
    (cashTenderedCents ?? -1) < totalCents
  ) {
    throw new Error('Enter cash received that covers the full sale total.');
  }

  const tenderedCents = cashTenderedCents as number;
  return {
    totalCents,
    tenderedCents,
    changeCents: tenderedCents - totalCents,
  };
}
