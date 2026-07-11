'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import type { Prisma } from '@prisma/client';
import {
  GuestPayMongoFlow,
  GuestPayMongoStatus,
  GuestPayMongoRefundKind,
  PaymentMethod,
  PaymentStatus,
  ServiceAvailabilityMovementType,
  ServiceBillingMode,
  ServiceRequestStatus,
} from '@prisma/client';
import { db } from '@/lib/db';
import { cleanText } from '@/lib/sanitize';
import {
  createPayMongoCheckoutSession,
  expirePayMongoCheckoutSession,
  getPayMongoGuestPaymentMethods,
  type PayMongoLineItem,
} from '@/lib/paymongo';
import {
  requireOwnedGuestPayMongoSession,
  requireGuestPayMongoSecurityContext,
} from '@/lib/guest-paymongo-security';
import {
  cleanupStagedGuestServiceAttachments,
  createGuestServiceRequests,
  prepareGuestServiceRequest,
  stageGuestServiceAttachments,
  type GuestServiceRequestInput,
  type StagedServiceAttachment,
} from '@/lib/guest-service-order';
import {
  markGuestPaymentFinalizationFailedAndRefund,
  requestGuestServiceRequestRefund,
} from '@/lib/guest-paymongo-refund';
import { notifyGuestPayMongoStatus } from '@/lib/paymongo-dashboard-notifications';
import {
  getServiceRequestImageFiles,
  validateServiceRequestImageFile,
} from '@/lib/service-request-attachments';
import { triggerInventoryUpdated } from '@/lib/realtime/inventory-events';
import { triggerServiceRequestUpdated } from '@/lib/realtime/service-request-events';

export type GuestServicePayMongoStatusResult = {
  ok: boolean;
  status?: GuestPayMongoStatus;
  requestCode?: string | null;
  requestIds?: string[];
  checkoutUrl?: string | null;
  errorMessage?: string | null;
  refundStatus?: string | null;
  refundedAmountCents?: number;
  error?: string;
};

type StoredGuestServicePayload = GuestServiceRequestInput & {
  paymentMethod: 'PAYMONGO';
  stagedAttachments: StagedServiceAttachment[];
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim()
    ? error.message.trim()
    : fallback;
}

function getPublicError(error: unknown, fallback: string) {
  const message = getErrorMessage(error, fallback);

  if (process.env.NODE_ENV !== 'production') return message;

  if (/paymongo|secret key|checkout|webhook|app_url|payment id/i.test(message)) {
    return 'Unable to start or confirm the secure payment. Please try again or contact the front desk.';
  }

  return message;
}

function getAppUrl() {
  const value = (
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    ''
  ).replace(/\/$/, '');

  if (!value) throw new Error('APP_URL is not configured.');

  const url = new URL(value);

  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new Error('APP_URL must use HTTPS in production.');
  }

  return url.toString().replace(/\/$/, '');
}

function parseSelections(formData: FormData) {
  const codes = Array.from(
    new Set(
      formData
        .getAll('serviceCodes')
        .map((value) =>
          typeof value === 'string' ? cleanText(value, 80) : null
        )
        .filter((value): value is string => Boolean(value))
    )
  );

  return codes.map((serviceCode) => ({
    serviceCode,
    quantity: Math.min(
      Math.max(Number(formData.get(`quantity_${serviceCode}`)) || 0, 0),
      20
    ),
  }));
}

function parseCheckoutFormData(formData: FormData): GuestServiceRequestInput {
  const tagCode = cleanText(formData.get('tagCode'), 160);

  if (!tagCode) throw new Error('Guest NFC tag is required.');

  return {
    tagCode,
    guestName: cleanText(formData.get('guestName'), 100),
    notes: cleanText(formData.get('notes'), 1000),
    fulfillmentTiming:
      cleanText(formData.get('fulfillmentTiming'), 40) || 'ASAP',
    scheduledFor: cleanText(formData.get('scheduledFor'), 80),
    scheduledNote: cleanText(formData.get('scheduledNote'), 300),
    services: parseSelections(formData),
  };
}

function parseStoredPayload(value: Prisma.JsonValue) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Stored guest service checkout data is invalid.');
  }

  const payload = value as unknown as StoredGuestServicePayload;

  if (
    typeof payload.tagCode !== 'string' ||
    !Array.isArray(payload.services) ||
    payload.paymentMethod !== 'PAYMONGO' ||
    !Array.isArray(payload.stagedAttachments)
  ) {
    throw new Error('Stored guest service checkout data is incomplete.');
  }

  return payload;
}

function parseStringArray(value: Prisma.JsonValue | null) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

async function cleanupPaymentDraft(payment: {
  payload: Prisma.JsonValue;
}) {
  try {
    const payload = parseStoredPayload(payment.payload);
    await cleanupStagedGuestServiceAttachments(payload.stagedAttachments);
  } catch {
    // Older or incomplete drafts may not contain staged attachments.
  }
}

export async function createGuestServicePayMongoCheckout(formData: FormData) {
  let draftId: string | null = null;
  let stagedAttachments: StagedServiceAttachment[] = [];

  try {
    const input = parseCheckoutFormData(formData);
    const attachmentFiles = getServiceRequestImageFiles(
      formData,
      'attachments'
    );

    for (const file of attachmentFiles) {
      validateServiceRequestImageFile(file);
    }

    const quote = await prepareGuestServiceRequest(input);

    if (quote.fixedPriceTotalCents <= 0) {
      throw new Error(
        'This request has no fixed-price amount. Submit it without PayMongo.'
      );
    }

    const fixedPriceServices = quote.services.filter(
      (service) => service.billingMode === ServiceBillingMode.FIXED_PRICE
    );

    const lineItems: PayMongoLineItem[] = fixedPriceServices.map((service) => ({
      name: service.name,
      description: service.description || 'CloudView guest service request',
      amount: service.unitPriceCents,
      currency: 'PHP',
      quantity: service.quantity,
    }));

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);

    const olderSessions = await db.guestPayMongoSession.findMany({
      where: {
        flowType: GuestPayMongoFlow.SERVICE_REQUEST,
        guestSessionId: quote.context.session.id,
        status: GuestPayMongoStatus.PENDING,
      },
      select: {
        id: true,
        checkoutSessionId: true,
        payload: true,
      },
    });

    if (olderSessions.length) {
      await db.guestPayMongoSession.updateMany({
        where: { id: { in: olderSessions.map((session) => session.id) } },
        data: {
          status: GuestPayMongoStatus.CANCELLED,
          cancelledAt: now,
          cancelReason: 'Replaced by a newer guest service checkout.',
        },
      });

      await Promise.allSettled(
        olderSessions.map(async (session) => {
          await cleanupPaymentDraft(session);

          if (session.checkoutSessionId) {
            await expirePayMongoCheckoutSession(session.checkoutSessionId);
          }
        })
      );
    }

    const initialPayload: StoredGuestServicePayload = {
      ...input,
      paymentMethod: 'PAYMONGO',
      stagedAttachments: [],
    };

    const draft = await db.guestPayMongoSession.create({
      data: {
        flowType: GuestPayMongoFlow.SERVICE_REQUEST,
        hotelId: quote.context.tag.hotelId,
        tagId: quote.context.tag.id,
        guestSessionId: quote.context.session.id,
        guestStayId: quote.context.guestStayId,
        amountCents: quote.fixedPriceTotalCents,
        currency: 'PHP',
        payload: initialPayload as unknown as Prisma.InputJsonValue,
        status: GuestPayMongoStatus.PENDING,
        automaticRefundEnabled: true,
        expiresAt,
      },
      select: { id: true },
    });

    draftId = draft.id;
    stagedAttachments = await stageGuestServiceAttachments({
      paymentSessionId: draft.id,
      files: attachmentFiles,
    });

    const storedPayload: StoredGuestServicePayload = {
      ...initialPayload,
      stagedAttachments,
    };

    await db.guestPayMongoSession.update({
      where: { id: draft.id },
      data: {
        payload: storedPayload as unknown as Prisma.InputJsonValue,
      },
    });

    const appUrl = getAppUrl();
    const basePath = `/t/${encodeURIComponent(input.tagCode)}/payment`;
    const successQuery = new URLSearchParams({
      session: draft.id,
      flow: 'service',
      result: 'success',
    });
    const cancelQuery = new URLSearchParams({
      session: draft.id,
      flow: 'service',
      result: 'cancelled',
    });
    const successUrl = `${appUrl}${basePath}?${successQuery.toString()}`;
    const cancelUrl = `${appUrl}${basePath}?${cancelQuery.toString()}`;

    const checkout = await createPayMongoCheckoutSession({
      idempotencyKey: `cloudview-guest-service-${draft.id}`,
      lineItems,
      successUrl,
      cancelUrl,
      description: `${quote.hotelName} guest service request`,
      referenceNumber: draft.id,
      paymentMethods: getPayMongoGuestPaymentMethods(),
      metadata: {
        flow_type: 'GUEST_SERVICE_REQUEST',
        guest_payment_session_id: draft.id,
        hotel_id: quote.context.tag.hotelId,
        tag_id: quote.context.tag.id,
        guest_session_id: quote.context.session.id,
        guest_stay_id: quote.context.guestStayId || '',
      },
    });

    await db.guestPayMongoSession.update({
      where: { id: draft.id },
      data: {
        checkoutSessionId: checkout.id,
        checkoutUrl: checkout.checkoutUrl,
        errorMessage: null,
      },
    });

    return {
      ok: true as const,
      sessionId: draft.id,
      checkoutUrl: checkout.checkoutUrl,
      expiresAt: expiresAt.toISOString(),
    };
  } catch (error) {
    const message = getErrorMessage(
      error,
      'Unable to create PayMongo service checkout.'
    );

    if (draftId) {
      await db.guestPayMongoSession
        .update({
          where: { id: draftId },
          data: {
            status: GuestPayMongoStatus.FAILED,
            errorMessage: message.slice(0, 2000),
          },
        })
        .catch(() => undefined);
    }

    if (stagedAttachments.length) {
      await cleanupStagedGuestServiceAttachments(stagedAttachments);
    }

    console.error('[Guest Service PayMongo] Create checkout failed.', error);

    return {
      ok: false as const,
      error: getPublicError(error, 'Unable to create the secure payment.'),
    };
  }
}

export async function getGuestServicePayMongoStatus(input: {
  tagCode: string;
  paymentSessionId: string;
}): Promise<GuestServicePayMongoStatusResult> {
  try {
    const { payment } = await requireOwnedGuestPayMongoSession({
      tagCode: input.tagCode,
      paymentSessionId: input.paymentSessionId,
      flowType: GuestPayMongoFlow.SERVICE_REQUEST,
    });

    if (
      payment.status === GuestPayMongoStatus.PENDING &&
      payment.expiresAt &&
      payment.expiresAt <= new Date()
    ) {
      await db.guestPayMongoSession.updateMany({
        where: { id: payment.id, status: GuestPayMongoStatus.PENDING },
        data: {
          status: GuestPayMongoStatus.EXPIRED,
          checkoutExpiredAt: new Date(),
          errorMessage: 'The PayMongo checkout expired before payment.',
        },
      });

      if (payment.checkoutSessionId) {
        await expirePayMongoCheckoutSession(payment.checkoutSessionId).catch(
          () => undefined
        );
      }

      await cleanupPaymentDraft(payment);

      await notifyGuestPayMongoStatus({ sessionId: payment.id }).catch(
        (error) =>
          console.warn('[Guest Service PayMongo] Unable to notify checkout expiry.', error)
      );

      return {
        ok: true,
        status: GuestPayMongoStatus.EXPIRED,
        errorMessage: 'The QR payment request expired. Please create a new one.',
        refundStatus: payment.refundStatus,
        refundedAmountCents: payment.refundedAmountCents,
      };
    }

    return {
      ok: true,
      status: payment.status,
      requestCode: parseStringArray(payment.serviceRequestCodes)[0] || null,
      requestIds: parseStringArray(payment.serviceRequestIds),
      checkoutUrl: payment.checkoutUrl,
      errorMessage: payment.errorMessage || payment.refundErrorMessage,
      refundStatus: payment.refundStatus,
      refundedAmountCents: payment.refundedAmountCents,
    };
  } catch (error) {
    return {
      ok: false,
      error: getPublicError(error, 'Unable to read the payment status.'),
    };
  }
}

export async function cancelGuestServicePayMongoCheckout(input: {
  tagCode: string;
  paymentSessionId: string;
}) {
  try {
    const { payment } = await requireOwnedGuestPayMongoSession({
      tagCode: input.tagCode,
      paymentSessionId: input.paymentSessionId,
      flowType: GuestPayMongoFlow.SERVICE_REQUEST,
    });

    if (payment.status === GuestPayMongoStatus.CANCELLED) {
      return { ok: true as const, alreadyCancelled: true as const };
    }

    if (payment.status !== GuestPayMongoStatus.PENDING) {
      return {
        ok: false as const,
        error:
          payment.status === GuestPayMongoStatus.PAID ||
          payment.status === GuestPayMongoStatus.PROCESSING ||
          payment.status === GuestPayMongoStatus.COMPLETED
            ? 'Payment was already received and can no longer be cancelled from checkout.'
            : 'This checkout can no longer be cancelled.',
      };
    }

    await db.guestPayMongoSession.update({
      where: { id: payment.id },
      data: {
        status: GuestPayMongoStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: 'Guest cancelled PayMongo service checkout.',
        errorMessage: null,
      },
    });

    if (payment.checkoutSessionId) {
      await expirePayMongoCheckoutSession(payment.checkoutSessionId).catch(
        () => undefined
      );
    }

    await cleanupPaymentDraft(payment);

    await notifyGuestPayMongoStatus({ sessionId: payment.id }).catch(
      (error) =>
        console.warn('[Guest Service PayMongo] Unable to notify checkout cancellation.', error)
    );

    return { ok: true as const, alreadyCancelled: false as const };
  } catch (error) {
    return {
      ok: false as const,
      error: getPublicError(error, 'Unable to cancel the checkout.'),
    };
  }
}

export async function finalizeGuestServicePayMongoCheckout(input: {
  tagCode: string;
  paymentSessionId: string;
}) {
  try {
    const { payment } = await requireOwnedGuestPayMongoSession({
      tagCode: input.tagCode,
      paymentSessionId: input.paymentSessionId,
      flowType: GuestPayMongoFlow.SERVICE_REQUEST,
    });

    const existingCodes = parseStringArray(payment.serviceRequestCodes);

    if (
      payment.status === GuestPayMongoStatus.COMPLETED &&
      existingCodes.length
    ) {
      return {
        ok: true as const,
        alreadyFinalized: true as const,
        requestCode: existingCodes[0],
        requestIds: parseStringArray(payment.serviceRequestIds),
      };
    }

    if (payment.status === GuestPayMongoStatus.PROCESSING) {
      const started = payment.processingStartedAt?.getTime() ?? 0;
      const stale = started < Date.now() - 5 * 60 * 1000;

      if (!stale) {
        return {
          ok: false as const,
          waiting: true as const,
          message: 'Your paid service request is already being finalized.',
        };
      }

      await db.guestPayMongoSession.updateMany({
        where: {
          id: payment.id,
          status: GuestPayMongoStatus.PROCESSING,
          serviceRequests: { none: {} },
        },
        data: {
          status: GuestPayMongoStatus.PAID,
          processingStartedAt: null,
          errorMessage: 'Recovered a stale service finalization attempt.',
        },
      });
    }

    const current = await db.guestPayMongoSession.findUnique({
      where: { id: payment.id },
    });

    if (!current) throw new Error('Guest PayMongo session was not found.');

    if (current.status !== GuestPayMongoStatus.PAID) {
      if (current.status === GuestPayMongoStatus.PENDING) {
        return {
          ok: false as const,
          waiting: true as const,
          message: 'Waiting for PayMongo payment confirmation.',
        };
      }

      throw new Error(
        current.errorMessage ||
          current.refundErrorMessage ||
          `Payment cannot be finalized while status is ${current.status}.`
      );
    }

    const claimed = await db.guestPayMongoSession.updateMany({
      where: {
        id: current.id,
        status: GuestPayMongoStatus.PAID,
        serviceRequests: { none: {} },
      },
      data: {
        status: GuestPayMongoStatus.PROCESSING,
        processingStartedAt: new Date(),
        errorMessage: null,
      },
    });

    if (claimed.count !== 1) {
      return {
        ok: false as const,
        waiting: true as const,
        message: 'The payment is already being finalized.',
      };
    }

    const payload = parseStoredPayload(current.payload);

    try {
      const result = await createGuestServiceRequests(payload, {
        paymentMethod: PaymentMethod.PAYMONGO,
        paymentStatus: PaymentStatus.PAID,
        guestPayMongoSessionId: current.id,
        createRoomCharges: false,
        stagedAttachments: payload.stagedAttachments,
      });

      return {
        ok: true as const,
        alreadyFinalized: false as const,
        requestCode: result.requestCode,
        requestIds: result.requestIds,
      };
    } catch (error) {
      await markGuestPaymentFinalizationFailedAndRefund({
        sessionId: current.id,
        error,
      });

      await cleanupStagedGuestServiceAttachments(payload.stagedAttachments);

      throw new Error(
        `Payment was received, but the service request could not be completed. A PayMongo refund was requested automatically. ${getErrorMessage(
          error,
          ''
        )}`.trim()
      );
    }
  } catch (error) {
    console.error('[Guest Service PayMongo] Finalization failed.', error);

    return {
      ok: false as const,
      waiting: false as const,
      error: getPublicError(
        error,
        'Unable to finalize the paid service request.'
      ),
    };
  }
}

async function restoreServiceInventoryForRequest(
  tx: Prisma.TransactionClient,
  request: {
    id: string;
    hotelId: string;
    requestCode: string;
    type: string;
  }
) {
  const deductions = await tx.serviceAvailabilityMovement.findMany({
    where: {
      hotelId: request.hotelId,
      serviceRequestId: request.id,
      type: ServiceAvailabilityMovementType.REQUEST_DEDUCTION,
    },
    select: { serviceId: true, quantity: true },
  });

  const restoredServiceIds: string[] = [];

  for (const deduction of deductions) {
    const exists = await tx.serviceAvailabilityMovement.findFirst({
      where: {
        hotelId: request.hotelId,
        serviceId: deduction.serviceId,
        serviceRequestId: request.id,
        type: ServiceAvailabilityMovementType.CANCEL_RESTORE,
      },
      select: { id: true },
    });

    if (exists) continue;

    const stock = await tx.serviceAvailabilityStock.findUnique({
      where: {
        hotelId_serviceId: {
          hotelId: request.hotelId,
          serviceId: deduction.serviceId,
        },
      },
    });

    if (!stock) continue;

    const restored = await tx.serviceAvailabilityStock.update({
      where: { id: stock.id },
      data: {
        availableQty: { increment: deduction.quantity },
        usedQty: { decrement: Math.min(stock.usedQty, deduction.quantity) },
        isSoldOut: false,
      },
      select: { availableQty: true },
    });

    await tx.serviceAvailabilityMovement.create({
      data: {
        hotelId: request.hotelId,
        serviceId: deduction.serviceId,
        stockId: stock.id,
        type: ServiceAvailabilityMovementType.CANCEL_RESTORE,
        quantity: deduction.quantity,
        balanceAfter: restored.availableQty,
        reason: `Guest cancelled service item ${request.type} from request ${request.requestCode}`,
        userId: null,
        serviceRequestId: request.id,
      },
    });

    restoredServiceIds.push(deduction.serviceId);
  }

  return restoredServiceIds;
}

export async function cancelGuestServiceRequestItemAction(
  formData: FormData
) {
  const tagCode = cleanText(formData.get('tagCode'), 160);
  const requestId = cleanText(formData.get('requestId'));
  const reason =
    cleanText(formData.get('reason'), 300) || 'Guest cancelled this service.';

  if (!tagCode || !requestId) {
    throw new Error('Service cancellation details are incomplete.');
  }

  const context = await requireGuestPayMongoSecurityContext(tagCode);
  const request = await db.serviceRequest.findFirst({
    where: {
      id: requestId,
      hotelId: context.tag.hotelId,
      tagId: context.tag.id,
      guestSessionId: context.session.id,
    },
    select: {
      id: true,
      hotelId: true,
      requestCode: true,
      type: true,
      status: true,
      quantity: true,
      amountCents: true,
      paymentMethod: true,
      paymentStatus: true,
      guestPayMongoSessionId: true,
    },
  });

  if (!request) throw new Error('Service request was not found.');

  if (request.status !== ServiceRequestStatus.NEW) {
    throw new Error('Only new service requests can be cancelled.');
  }

  let restoredServiceIds: string[] = [];

  await db.$transaction(async (tx) => {
    restoredServiceIds = await restoreServiceInventoryForRequest(tx, request);

    await tx.serviceRequest.update({
      where: { id: request.id },
      data: {
        status: ServiceRequestStatus.CANCELLED,
        cancelledQty: request.quantity,
        cancelledAt: new Date(),
        cancelReason: reason,
        cancelledById: null,
      },
    });

    await tx.serviceRequestStatusHistory.create({
      data: {
        requestId: request.id,
        status: ServiceRequestStatus.CANCELLED,
        note: reason,
      },
    });

    if (request.paymentMethod !== PaymentMethod.PAYMONGO) {
      await tx.roomAddOnCharge.deleteMany({
        where: { serviceRequestId: request.id },
      });
    }
  });

  if (
    request.paymentMethod === PaymentMethod.PAYMONGO &&
    request.guestPayMongoSessionId &&
    request.amountCents > 0 &&
    (request.paymentStatus === PaymentStatus.PAID ||
      request.paymentStatus === PaymentStatus.PARTIALLY_REFUNDED ||
      request.paymentStatus === PaymentStatus.REFUND_FAILED)
  ) {
    await requestGuestServiceRequestRefund({
      serviceRequestId: request.id,
      amountCents: request.amountCents,
      reason,
      kind: GuestPayMongoRefundKind.PARTIAL,
      idempotencySuffix: `guest-service-${request.id}`,
    });
  }

  await triggerServiceRequestUpdated({
    hotelId: request.hotelId,
    requestId: request.id,
    requestCode: request.requestCode,
    status: ServiceRequestStatus.CANCELLED,
    billed: false,
  }).catch(() => undefined);

  if (restoredServiceIds.length) {
    await triggerInventoryUpdated({
      hotelId: request.hotelId,
      productIds: Array.from(new Set(restoredServiceIds)),
      source: 'GUEST_PORTAL',
    }).catch(() => undefined);
  }

  revalidatePath(`/t/${tagCode}/requests`);
  revalidatePath(`/t/${tagCode}/service`);
  revalidatePath('/dashboard/service-requests');
  revalidatePath('/dashboard/inventory');

  redirect(`/t/${tagCode}/requests?success=request-cancelled`);
}
