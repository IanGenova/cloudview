export type XenditCommissionType = 'PERCENTAGE_NET' | 'FIXED';
export type XenditFeeBearer = 'HOTEL' | 'CLOUDVIEW';

export type XenditSplitRoute = {
  routeType: 'PERCENT' | 'FLAT';
  routeValue: number;
};

function centsToPhp(cents: number) {
  return Number((cents / 100).toFixed(2));
}

/**
 * Calculates the single xenPlatform route used by CloudView.
 *
 * HOTEL fee bearer: the hotel sub-account receives the original payment and
 * routes CloudView's commission to the master account.
 * CLOUDVIEW fee bearer: the master account receives the original payment and
 * routes the hotel's share to the hotel sub-account.
 */
export function calculateXenditSplitRoute(input: {
  amountCents: number;
  commissionType: XenditCommissionType;
  commissionValue: number;
  feeBearer: XenditFeeBearer;
}): XenditSplitRoute {
  const amountCents = Number(input.amountCents);
  const commissionValue = Number(input.commissionValue);

  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new Error('A positive checkout amount is required for Xendit splitting.');
  }
  if (!Number.isSafeInteger(commissionValue) || commissionValue <= 0) {
    throw new Error('The Xendit commission must be greater than zero when splitting is enabled.');
  }
  if (input.commissionType === 'PERCENTAGE_NET' && commissionValue >= 10_000) {
    throw new Error('The Xendit platform commission must be below 100%.');
  }
  if (
    input.commissionType === 'FIXED' &&
    (commissionValue <= 0 || commissionValue >= amountCents)
  ) {
    throw new Error(
      'The fixed Xendit commission must be greater than zero and below the checkout amount.'
    );
  }

  let routeType: XenditSplitRoute['routeType'];
  let routeValue: number;

  if (input.feeBearer === 'HOTEL') {
    routeType = input.commissionType === 'FIXED' ? 'FLAT' : 'PERCENT';
    routeValue =
      input.commissionType === 'FIXED'
        ? centsToPhp(commissionValue)
        : Number((commissionValue / 100).toFixed(2));
  } else if (input.commissionType === 'PERCENTAGE_NET') {
    routeType = 'PERCENT';
    routeValue = Number(((10_000 - commissionValue) / 100).toFixed(2));
  } else {
    routeType = 'FLAT';
    routeValue = centsToPhp(amountCents - commissionValue);
  }

  if (!Number.isFinite(routeValue) || routeValue <= 0) {
    throw new Error('The Xendit split route amount must be greater than zero.');
  }

  return { routeType, routeValue };
}
