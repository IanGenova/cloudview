'use server';

import {
  cancelGuestFoodPayMongoCheckout,
  finalizeGuestFoodPayMongoCheckout,
  getGuestFoodPayMongoStatus,
} from '@/app/t/[tagCode]/food-paymongo-actions';
import {
  cancelGuestServicePayMongoCheckout,
  finalizeGuestServicePayMongoCheckout,
  getGuestServicePayMongoStatus,
} from '@/app/t/[tagCode]/service-paymongo-actions';

export type GuestPaymentFlow = 'FOOD_ORDER' | 'SERVICE_REQUEST';

export type GuestPaymentStatusValue =
  | 'PENDING'
  | 'PAID'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'FAILED'
  | 'PAID_REVIEW_REQUIRED'
  | 'REFUND_PENDING'
  | 'REFUNDED'
  | 'REFUND_FAILED';

type GuestPaymentActionInput = {
  tagCode: string;
  paymentSessionId: string;
  flow: GuestPaymentFlow;
};

export type NormalizedGuestPaymentResult = {
  ok: boolean;
  status?: GuestPaymentStatusValue;
  referenceCode?: string | null;
  checkoutUrl?: string | null;
  errorMessage?: string | null;
  refundStatus?: string | null;
  refundedAmountCents?: number;
  waiting?: boolean;
  message?: string;
  error?: string;
};

function normalizeFlow(flow: GuestPaymentFlow) {
  if (flow !== 'FOOD_ORDER' && flow !== 'SERVICE_REQUEST') {
    throw new Error('Unsupported guest payment flow.');
  }

  return flow;
}

export async function getGuestPaymentStatusAction(
  input: GuestPaymentActionInput
): Promise<NormalizedGuestPaymentResult> {
  const flow = normalizeFlow(input.flow);

  if (flow === 'FOOD_ORDER') {
    const result = await getGuestFoodPayMongoStatus({
      tagCode: input.tagCode,
      paymentSessionId: input.paymentSessionId,
    });

    return {
      ...result,
      status: result.status as GuestPaymentStatusValue | undefined,
      referenceCode: result.orderCode ?? null,
    };
  }

  const result = await getGuestServicePayMongoStatus({
    tagCode: input.tagCode,
    paymentSessionId: input.paymentSessionId,
  });

  return {
    ...result,
    status: result.status as GuestPaymentStatusValue | undefined,
    referenceCode: result.requestCode ?? null,
  };
}

export async function finalizeGuestPaymentAction(
  input: GuestPaymentActionInput
): Promise<NormalizedGuestPaymentResult> {
  const flow = normalizeFlow(input.flow);

  if (flow === 'FOOD_ORDER') {
    const result = await finalizeGuestFoodPayMongoCheckout({
      tagCode: input.tagCode,
      paymentSessionId: input.paymentSessionId,
    });

    return {
      ...result,
      referenceCode: 'orderCode' in result ? result.orderCode : null,
    };
  }

  const result = await finalizeGuestServicePayMongoCheckout({
    tagCode: input.tagCode,
    paymentSessionId: input.paymentSessionId,
  });

  return {
    ...result,
    referenceCode: 'requestCode' in result ? result.requestCode : null,
  };
}

export async function cancelGuestPaymentAction(
  input: GuestPaymentActionInput
): Promise<NormalizedGuestPaymentResult> {
  const flow = normalizeFlow(input.flow);

  if (flow === 'FOOD_ORDER') {
    return cancelGuestFoodPayMongoCheckout({
      tagCode: input.tagCode,
      paymentSessionId: input.paymentSessionId,
    });
  }

  return cancelGuestServicePayMongoCheckout({
    tagCode: input.tagCode,
    paymentSessionId: input.paymentSessionId,
  });
}
