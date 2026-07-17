'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import type { Prisma } from '@prisma/client';
import {
  GuestXenditFlow,
  GuestXenditStatus,
  GuestXenditRefundKind,
  GuestXenditRefundStatus,
  PaymentMethod,
  PaymentStatus,
  ServiceAvailabilityMovementType,
  ServiceBillingMode,
  ServiceRequestStatus,
} from '@prisma/client';
import { db } from '@/lib/db';
import { isNextRedirectError } from '@/lib/next-control-flow';
import { assertXenditWebhookRecoveryToken } from '@/lib/xendit-webhook-recovery-token';
import { cleanText } from '@/lib/sanitize';
import {
  cancelXenditCheckoutSessionIfActive,
  createXenditCheckoutSession,
  expireXenditCheckoutSession,
  getXenditCheckoutSession,
  getXenditGuestPaymentMethods,
  type XenditLineItem,
} from '@/lib/xendit';
import { buildGuestXenditReturnUrl } from '@/lib/xendit-guest-return';
import {
  createXenditIntentFingerprint,
  decideExistingXenditSession,
  readXenditIntentFingerprint,
} from '@/lib/xendit-session-policy';
import {
  requireOwnedGuestXenditSession,
  requireGuestXenditSecurityContext,
} from '@/lib/guest-xendit-security';
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
} from '@/lib/guest-xendit-refund';
import { notifyGuestXenditStatus } from '@/lib/xendit-dashboard-notifications';
import {
  buildXenditSplitConfiguration,
  getXenditForUserIdFromPayload,
  type XenditSplitSnapshot,
} from '@/lib/xendit-split';
import {
  getServiceRequestImageFiles,
  validateServiceRequestImageFile,
} from '@/lib/service-request-attachments';
import { triggerInventoryUpdated } from '@/lib/realtime/inventory-events';
import { triggerServiceRequestUpdated } from '@/lib/realtime/service-request-events';

export type GuestServiceXenditStatusResult = {
  ok: boolean;
  status?: GuestXenditStatus;
  requestCode?: string | null;
  requestIds?: string[];
  checkoutUrl?: string | null;
  errorMessage?: string | null;
  refundStatus?: string | null;
  refundedAmountCents?: number;
  error?: string;
};

type StoredGuestServicePayload = GuestServiceRequestInput & {
  paymentMethod: 'XENDIT';
  stagedAttachments: StagedServiceAttachment[];
  xenditSplit: XenditSplitSnapshot | null;
  paymentIntentFingerprint?: string;
  paymentIntentCoreFingerprint?: string;
  xenditExpiresAt?: string;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim()
    ? error.message.trim()
    : fallback;
}

function getPublicError(error: unknown, fallback: string) {
  const message = getErrorMessage(error, fallback);

  if (process.env.NODE_ENV !== 'production') return message;

  if (/xendit|secret key|checkout|webhook|app_url|payment id/i.test(message)) {
    return 'Unable to start or confirm the secure payment. Please try again or contact the front desk.';
  }

  return message;
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
    guestPhone: cleanText(formData.get('guestPhone'), 40),
    roomNumber: cleanText(formData.get('roomNumber'), 40),
    roomPasscode: cleanText(formData.get('roomPasscode'), 20),
    requestDestination:
      cleanText(formData.get('requestDestination'), 40) || 'CURRENT_LOCATION',
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
    payload.paymentMethod !== 'XENDIT' ||
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


function isFalseDuplicateServiceFinalizationError(
  value: string | null | undefined
) {
  return /xendit service payment was finalized by another request/i.test(
    value || ''
  );
}

async function getFinalizedServiceRequestResult(paymentSessionId: string) {
  const requests = await db.serviceRequest.findMany({
    where: {
      guestXenditSessionId: paymentSessionId,
    },
    select: {
      id: true,
      requestCode: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  if (!requests.length) {
    return null;
  }

  const requestCode = requests[0].requestCode;
  const requestIds = requests.map((request) => request.id);

  await db.guestXenditSession
    .update({
      where: {
        id: paymentSessionId,
      },
      data: {
        status: GuestXenditStatus.COMPLETED,
        serviceRequestIds: requestIds as unknown as Prisma.InputJsonValue,
        serviceRequestCodes: [requestCode] as unknown as Prisma.InputJsonValue,
        completedAt: new Date(),
        errorMessage: null,
        refundErrorMessage: null,
      },
    })
    .catch((error) => {
      console.warn(
        '[Guest Service Xendit] Unable to backfill completed service payment session.',
        error
      );
    });

  return {
    requestCode,
    requestIds,
  };
}

async function recoverFalseDuplicateServiceFinalization(paymentSessionId: string) {
  const recovered = await db.guestXenditSession.updateMany({
    where: {
      id: paymentSessionId,
      status: GuestXenditStatus.PAID_REVIEW_REQUIRED,
      serviceRequests: {
        none: {},
      },
      refundStatus: {
        in: [
          GuestXenditRefundStatus.NOT_REQUESTED,
          GuestXenditRefundStatus.FAILED,
        ],
      },
    },
    data: {
      status: GuestXenditStatus.PAID,
      refundStatus: GuestXenditRefundStatus.NOT_REQUESTED,
      refundErrorMessage: null,
      refundAmountCents: null,
      refundReason: null,
      refundNotes: null,
      refundRequestedAt: null,
      refundedAt: null,
      processingStartedAt: null,
      errorMessage:
        'Recovered from a false duplicate service finalization error. Retrying service request creation.',
    },
  });

  return recovered.count === 1;
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

function createGuestServiceCoreFingerprint(input: {
  request: GuestServiceRequestInput;
  amountCents: number;
  split: XenditSplitSnapshot | null;
}) {
  return createXenditIntentFingerprint({
    flow: 'GUEST_SERVICE_REQUEST',
    tagCode: input.request.tagCode,
    guestName: input.request.guestName || '',
    guestPhone: input.request.guestPhone || '',
    roomNumber: input.request.roomNumber || '',
    requestDestination: input.request.requestDestination || 'CURRENT_LOCATION',
    notes: input.request.notes || '',
    fulfillmentTiming: input.request.fulfillmentTiming || 'ASAP',
    scheduledFor: input.request.scheduledFor || '',
    scheduledNote: input.request.scheduledNote || '',
    services: [...input.request.services]
      .map((service) => ({
        serviceCode: service.serviceCode,
        quantity: service.quantity,
      }))
      .sort((left, right) =>
        left.serviceCode.localeCompare(right.serviceCode)
      ),
    amountCents: input.amountCents,
    split: input.split,
  });
}

function createGuestServiceIntentFingerprint(input: {
  coreFingerprint: string;
  attachments: Array<{
    originalName: string;
    mimeType: string;
    sizeBytes: number;
  }>;
}) {
  return createXenditIntentFingerprint({
    coreFingerprint: input.coreFingerprint,
    attachments: [...input.attachments]
      .map((attachment) => ({
        originalName: attachment.originalName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
      }))
      .sort((left, right) =>
        `${left.originalName}:${left.sizeBytes}`.localeCompare(
          `${right.originalName}:${right.sizeBytes}`
        )
      ),
  });
}

function getStoredGuestServiceFingerprints(
  payload: Prisma.JsonValue,
  amountCents: number
) {
  try {
    const parsed = parseStoredPayload(payload);
    const core =
      parsed.paymentIntentCoreFingerprint ||
      createGuestServiceCoreFingerprint({
        request: parsed,
        amountCents,
        split: parsed.xenditSplit,
      });
    const full =
      readXenditIntentFingerprint(payload) ||
      createGuestServiceIntentFingerprint({
        coreFingerprint: core,
        attachments: parsed.stagedAttachments,
      });

    return { core, full };
  } catch {
    return { core: null, full: null };
  }
}

async function cancelSupersededGuestServiceSession(
  session: {
    id: string;
    checkoutSessionId: string | null;
    payload: Prisma.JsonValue;
    createdAt: Date;
  },
  reason: string
) {
  if (!session.checkoutSessionId) {
    if (Date.now() - session.createdAt.getTime() < 2 * 60 * 1000) {
      throw new Error(
        'The previous Xendit checkout is still being prepared. Please try again shortly.'
      );
    }
  } else {
    const remote = await cancelXenditCheckoutSessionIfActive(
      session.checkoutSessionId,
      getXenditForUserIdFromPayload(session.payload)
    );

    if (remote.status === 'COMPLETED') {
      throw new Error(
        'The previous Xendit checkout was already paid. Wait for confirmation before changing the service request.'
      );
    }
  }

  const updated = await db.guestXenditSession.updateMany({
    where: {
      id: session.id,
      status: GuestXenditStatus.PENDING,
    },
    data: {
      status: GuestXenditStatus.CANCELLED,
      cancelledAt: new Date(),
      cancelReason: reason,
      errorMessage: null,
    },
  });

  if (!updated.count) return;
  await cleanupPaymentDraft(session);
}

export async function createGuestServiceXenditCheckout(formData: FormData) {
  let draftId: string | null = null;
  let stagedAttachments: StagedServiceAttachment[] = [];

  try {
    const input = parseCheckoutFormData(formData);
    const requestedSessionId = cleanText(
      formData.get('existingPaymentSessionId'),
      120
    );
    const attachmentFiles = getServiceRequestImageFiles(
      formData,
      'attachments'
    );

    for (const file of attachmentFiles) {
      validateServiceRequestImageFile(file);
    }

    const quote = await prepareGuestServiceRequest(input);

    if (quote.fixedPriceTotalCents <= 0) {
      return {
        ok: false as const,
        code: 'NO_PAYMENT_REQUIRED' as const,
        error:
          'No online payment is required for this request. Send it directly to the hotel team.',
      };
    }

    const fixedPriceServices = quote.services.filter(
      (service) => service.billingMode === ServiceBillingMode.FIXED_PRICE
    );

    if (!fixedPriceServices.length) {
      return {
        ok: false as const,
        code: 'NO_PAYMENT_REQUIRED' as const,
        error:
          'No online payment is required for this request. Send it directly to the hotel team.',
      };
    }

    const lineItems: XenditLineItem[] = fixedPriceServices.map((service) => ({
      name: service.name,
      description: service.description || 'CloudView guest service request',
      amount: service.unitPriceCents,
      currency: 'PHP',
      quantity: service.quantity,
    }));

    const hotelSettings = await db.hotelSettings.findUnique({
      where: { hotelId: quote.context.tag.hotelId },
    });
    const splitConfiguration = await buildXenditSplitConfiguration({
      hotelId: quote.context.tag.hotelId,
      amountCents: quote.fixedPriceTotalCents,
      settings: hotelSettings,
    });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);
    const coreFingerprint = createGuestServiceCoreFingerprint({
      request: input,
      amountCents: quote.fixedPriceTotalCents,
      split: splitConfiguration?.snapshot ?? null,
    });
    const paymentIntentFingerprint = createGuestServiceIntentFingerprint({
      coreFingerprint,
      attachments: attachmentFiles.map((file) => ({
        originalName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      })),
    });

    const pendingSessions = await db.guestXenditSession.findMany({
      where: {
        paymentProvider: 'XENDIT',
        flowType: GuestXenditFlow.SERVICE_REQUEST,
        guestSessionId: quote.context.session.id,
        status: GuestXenditStatus.PENDING,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        amountCents: true,
        checkoutSessionId: true,
        checkoutUrl: true,
        payload: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    for (const session of pendingSessions) {
      const stored = getStoredGuestServiceFingerprints(
        session.payload,
        session.amountCents
      );
      const sameFullIntent = stored.full === paymentIntentFingerprint;
      const explicitlyResumingSameCore =
        Boolean(requestedSessionId) &&
        session.id === requestedSessionId &&
        stored.core === coreFingerprint;
      const sameIntent = sameFullIntent || explicitlyResumingSameCore;
      const decision = await decideExistingXenditSession({
        checkoutSessionId: session.checkoutSessionId,
        checkoutUrl: session.checkoutUrl,
        expiresAt: session.expiresAt,
        createdAt: session.createdAt,
        forUserId: getXenditForUserIdFromPayload(session.payload),
      });

      if (decision.action === 'COMPLETED') {
        const amountMatches =
          decision.amountCents === null ||
          decision.amountCents === session.amountCents;
        const currencyMatches =
          !decision.currency || decision.currency === 'PHP';
        const nextStatus =
          amountMatches && currencyMatches
            ? GuestXenditStatus.PAID
            : GuestXenditStatus.PAID_REVIEW_REQUIRED;

        await db.guestXenditSession.update({
          where: { id: session.id },
          data: {
            status: nextStatus,
            xenditPaymentId: decision.paymentId,
            xenditPaymentRequestId: decision.paymentRequestId,
            paidAmountCents: decision.amountCents ?? session.amountCents,
            paidAt: now,
            errorMessage:
              amountMatches && currencyMatches
                ? null
                : 'The completed Xendit session amount or currency did not match the stored service request.',
          },
        });

        return {
          ok: false as const,
          existingSession: true as const,
          paymentCompleted: true as const,
          sessionId: session.id,
          checkoutUrl: buildGuestXenditReturnUrl({
            tagCode: input.tagCode,
            sessionId: session.id,
            flow: 'service',
            result: 'success',
          }),
          status: nextStatus,
          error:
            'An earlier Xendit payment was already received. CloudView is finalizing that service request; a second payment is blocked.',
        };
      }

      if (decision.action === 'CONTINUE') {
        await db.guestXenditSession.update({
          where: { id: session.id },
          data: {
            checkoutSessionId: decision.checkoutSessionId,
            checkoutUrl: decision.checkoutUrl,
            expiresAt: decision.expiresAt,
            xenditPaymentRequestId:
              decision.paymentRequestId ?? undefined,
            errorMessage: null,
          },
        });

        if (sameIntent) {
          return {
            ok: true as const,
            sessionId: session.id,
            checkoutUrl: decision.checkoutUrl,
            expiresAt:
              decision.expiresAt?.toISOString() ?? expiresAt.toISOString(),
            reusedSession: true as const,
          };
        }

        return {
          ok: false as const,
          existingSession: true as const,
          sessionId: session.id,
          checkoutUrl: decision.checkoutUrl,
          status: GuestXenditStatus.PENDING,
          error:
            'A Xendit service checkout is already active. Continue or cancel it before changing the request.',
        };
      }

      if (decision.action === 'WAIT') {
        return {
          ok: false as const,
          existingSession: true as const,
          sessionId: session.id,
          checkoutUrl: session.checkoutUrl,
          status: GuestXenditStatus.PENDING,
          error: decision.reason,
        };
      }

      await cancelSupersededGuestServiceSession(session, decision.reason);
    }

    const initialPayload: StoredGuestServicePayload = {
      ...input,
      guestName: quote.guestName,
      guestPhone: quote.guestPhone,
      roomNumber: quote.roomId ? input.roomNumber : '',
      roomPasscode: '',
      paymentMethod: 'XENDIT',
      stagedAttachments: [],
      xenditSplit: splitConfiguration?.snapshot ?? null,
      paymentIntentFingerprint,
      paymentIntentCoreFingerprint: coreFingerprint,
      xenditExpiresAt: expiresAt.toISOString(),
    };

    if (quote.guestStayId) {
      const boundSession = await db.nfcGuestSession.updateMany({
        where: {
          id: quote.context.session.id,
          hotelId: quote.context.tag.hotelId,
          tagId: quote.context.tag.id,
          endedAt: null,
        },
        data: {
          roomId: quote.roomId,
          locationId: quote.locationId,
          guestStayId: quote.guestStayId,
          guestMemberId: quote.guestMemberId,
          lastSeenAt: new Date(),
        },
      });

      if (boundSession.count !== 1) {
        throw new Error(
          'The NFC browser session ended before the room could be verified.'
        );
      }
    }

    const draft = await db.guestXenditSession.create({
      data: {
        paymentProvider: 'XENDIT',
        flowType: GuestXenditFlow.SERVICE_REQUEST,
        hotelId: quote.context.tag.hotelId,
        tagId: quote.context.tag.id,
        guestSessionId: quote.context.session.id,
        guestStayId: quote.guestStayId,
        amountCents: quote.fixedPriceTotalCents,
        currency: 'PHP',
        payload: initialPayload as unknown as Prisma.InputJsonValue,
        status: GuestXenditStatus.PENDING,
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

    await db.guestXenditSession.update({
      where: { id: draft.id },
      data: {
        payload: storedPayload as unknown as Prisma.InputJsonValue,
      },
    });

    const successUrl = buildGuestXenditReturnUrl({
      tagCode: input.tagCode,
      sessionId: draft.id,
      flow: 'service',
      result: 'success',
    });

    const cancelUrl = buildGuestXenditReturnUrl({
      tagCode: input.tagCode,
      sessionId: draft.id,
      flow: 'service',
      result: 'cancelled',
    });

    const checkout = await createXenditCheckoutSession({
      idempotencyKey: `cloudview-guest-service-${draft.id}`,
      lineItems,
      successUrl,
      cancelUrl,
      description: `${quote.hotelName} guest service request`,
      referenceNumber: draft.id,
      paymentMethods: getXenditGuestPaymentMethods(),
      metadata: {
        flow_type: 'GUEST_SERVICE_REQUEST',
        guest_payment_session_id: draft.id,
        hotel_id: quote.context.tag.hotelId,
        tag_id: quote.context.tag.id,
        guest_session_id: quote.context.session.id,
        guest_stay_id: quote.guestStayId || '',
        payment_intent: paymentIntentFingerprint.slice(0, 40),
        split_enabled: splitConfiguration ? 'true' : 'false',
        split_fee_bearer:
          splitConfiguration?.snapshot.feeBearer ?? '',
      },
      splitPayment: splitConfiguration?.splitPayment,
      expiresAt,
    });

    await db.guestXenditSession.update({
      where: { id: draft.id },
      data: {
        checkoutSessionId: checkout.id,
        checkoutUrl: checkout.checkoutUrl,
        xenditPaymentRequestId: checkout.paymentRequestId,
        expiresAt: new Date(checkout.expiresAt),
        payload: {
          ...storedPayload,
          xenditExpiresAt: checkout.expiresAt,
        } as unknown as Prisma.InputJsonValue,
        errorMessage: null,
      },
    });

    return {
      ok: true as const,
      sessionId: draft.id,
      checkoutUrl: checkout.checkoutUrl,
      expiresAt: checkout.expiresAt,
      reusedSession: false as const,
    };
  } catch (error) {
    const message = getErrorMessage(
      error,
      'Unable to create Xendit service checkout.'
    );

    if (draftId) {
      await db.guestXenditSession
        .update({
          where: { id: draftId },
          data: {
            status: GuestXenditStatus.FAILED,
            errorMessage: message.slice(0, 2000),
          },
        })
        .catch(() => undefined);
    }

    if (stagedAttachments.length) {
      await cleanupStagedGuestServiceAttachments(stagedAttachments);
    }

    console.error('[Guest Service Xendit] Create checkout failed.', error);

    return {
      ok: false as const,
      error: getPublicError(error, 'Unable to create the secure payment.'),
    };
  }
}

export async function getGuestServiceXenditStatus(input: {
  tagCode: string;
  paymentSessionId: string;
  verifyRemote?: boolean;
}): Promise<GuestServiceXenditStatusResult> {
  try {
    let { payment } = await requireOwnedGuestXenditSession({
      tagCode: input.tagCode,
      paymentSessionId: input.paymentSessionId,
      flowType: GuestXenditFlow.SERVICE_REQUEST,
    });

    if (
      input.verifyRemote &&
      payment.status === GuestXenditStatus.PENDING &&
      payment.checkoutSessionId
    ) {
      try {
        const remote = await getXenditCheckoutSession(
          payment.checkoutSessionId,
          getXenditForUserIdFromPayload(payment.payload)
        );

        if (remote.status === 'COMPLETED') {
          const amountMatches =
            remote.amountCents === null ||
            remote.amountCents === payment.amountCents;
          const currencyMatches =
            !remote.currency ||
            remote.currency.toUpperCase() === payment.currency.toUpperCase();

          await db.guestXenditSession.updateMany({
            where: {
              id: payment.id,
              status: GuestXenditStatus.PENDING,
            },
            data: {
              status:
                amountMatches && currencyMatches
                  ? GuestXenditStatus.PAID
                  : GuestXenditStatus.PAID_REVIEW_REQUIRED,
              xenditPaymentId: remote.paymentId,
              xenditPaymentRequestId: remote.paymentRequestId,
              paidAmountCents: remote.amountCents ?? payment.amountCents,
              paidAt: new Date(),
              errorMessage:
                amountMatches && currencyMatches
                  ? null
                  : 'The completed Xendit session amount or currency did not match the stored service request.',
            },
          });

          await notifyGuestXenditStatus({ sessionId: payment.id }).catch(
            (error) =>
              console.warn(
                '[Guest Service Xendit] Unable to notify remotely verified payment.',
                error
              )
          );
        } else if (
          remote.status === 'EXPIRED' ||
          remote.status === 'CANCELED'
        ) {
          const expired = remote.status === 'EXPIRED';

          await db.guestXenditSession.updateMany({
            where: {
              id: payment.id,
              status: GuestXenditStatus.PENDING,
            },
            data: expired
              ? {
                  status: GuestXenditStatus.EXPIRED,
                  checkoutExpiredAt: new Date(),
                  errorMessage:
                    'The Xendit checkout expired before payment.',
                }
              : {
                  status: GuestXenditStatus.CANCELLED,
                  cancelledAt: new Date(),
                  cancelReason: 'Xendit checkout was cancelled.',
                  errorMessage: null,
                },
          });

          await cleanupPaymentDraft(payment);

          await notifyGuestXenditStatus({ sessionId: payment.id }).catch(
            (error) =>
              console.warn(
                '[Guest Service Xendit] Unable to notify remote checkout status.',
                error
              )
          );
        }

        const latest = await db.guestXenditSession.findUnique({
          where: { id: payment.id },
        });

        if (latest) {
          payment = latest;
        }
      } catch (error) {
        // The verified webhook is still authoritative. A temporary direct
        // status-read failure must not break the guest service payment page.
        console.warn(
          '[Guest Service Xendit] Remote payment verification failed.',
          error
        );
      }
    }

    if (
      payment.status === GuestXenditStatus.PENDING &&
      payment.expiresAt &&
      payment.expiresAt <= new Date()
    ) {
      await db.guestXenditSession.updateMany({
        where: { id: payment.id, status: GuestXenditStatus.PENDING },
        data: {
          status: GuestXenditStatus.EXPIRED,
          checkoutExpiredAt: new Date(),
          errorMessage: 'The Xendit checkout expired before payment.',
        },
      });

      if (payment.checkoutSessionId) {
        await expireXenditCheckoutSession(
          payment.checkoutSessionId,
          getXenditForUserIdFromPayload(payment.payload)
        ).catch(
          () => undefined
        );
      }

      await cleanupPaymentDraft(payment);

      await notifyGuestXenditStatus({ sessionId: payment.id }).catch(
        (error) =>
          console.warn('[Guest Service Xendit] Unable to notify checkout expiry.', error)
      );

      return {
        ok: true,
        status: GuestXenditStatus.EXPIRED,
        errorMessage: 'The QR payment request expired. Please create a new one.',
        refundStatus: payment.refundStatus,
        refundedAmountCents: payment.refundedAmountCents,
      };
    }

    const finalized = await getFinalizedServiceRequestResult(payment.id);

    if (finalized) {
      return {
        ok: true,
        status: GuestXenditStatus.COMPLETED,
        requestCode: finalized.requestCode,
        requestIds: finalized.requestIds,
        checkoutUrl: payment.checkoutUrl,
        errorMessage: null,
        refundStatus: payment.refundStatus,
        refundedAmountCents: payment.refundedAmountCents,
      };
    }

    if (
      payment.status === GuestXenditStatus.PAID_REVIEW_REQUIRED &&
      isFalseDuplicateServiceFinalizationError(
        payment.errorMessage || payment.refundErrorMessage
      )
    ) {
      const recovered = await recoverFalseDuplicateServiceFinalization(
        payment.id
      );

      if (recovered) {
        return {
          ok: true,
          status: GuestXenditStatus.PAID,
          requestCode: null,
          requestIds: [],
          checkoutUrl: payment.checkoutUrl,
          errorMessage: null,
          refundStatus: GuestXenditRefundStatus.NOT_REQUESTED,
          refundedAmountCents: payment.refundedAmountCents,
        };
      }
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

export async function cancelGuestServiceXenditCheckout(input: {
  tagCode: string;
  paymentSessionId: string;
}) {
  try {
    const { payment } = await requireOwnedGuestXenditSession({
      tagCode: input.tagCode,
      paymentSessionId: input.paymentSessionId,
      flowType: GuestXenditFlow.SERVICE_REQUEST,
    });

    if (payment.status === GuestXenditStatus.CANCELLED) {
      return { ok: true as const, alreadyCancelled: true as const };
    }

    if (payment.status !== GuestXenditStatus.PENDING) {
      const paymentCompleted =
        payment.status === GuestXenditStatus.PAID ||
        payment.status === GuestXenditStatus.PROCESSING ||
        payment.status === GuestXenditStatus.COMPLETED ||
        payment.status === GuestXenditStatus.PAID_REVIEW_REQUIRED;

      return {
        ok: false as const,
        ...(paymentCompleted ? { paymentCompleted: true as const } : {}),
        error: paymentCompleted
          ? 'Payment was already received and can no longer be cancelled from checkout.'
          : 'This checkout can no longer be cancelled.',
      };
    }

    if (payment.checkoutSessionId) {
      const remote = await cancelXenditCheckoutSessionIfActive(
        payment.checkoutSessionId,
        getXenditForUserIdFromPayload(payment.payload)
      );

      if (remote.status === 'COMPLETED') {
        const amountMatches =
          remote.amountCents === null || remote.amountCents === payment.amountCents;
        const currencyMatches =
          !remote.currency || remote.currency === payment.currency.toUpperCase();

        await db.guestXenditSession.updateMany({
          where: { id: payment.id, status: GuestXenditStatus.PENDING },
          data: {
            status:
              amountMatches && currencyMatches
                ? GuestXenditStatus.PAID
                : GuestXenditStatus.PAID_REVIEW_REQUIRED,
            xenditPaymentId: remote.paymentId,
            xenditPaymentRequestId: remote.paymentRequestId,
            paidAmountCents: remote.amountCents ?? payment.amountCents,
            paidAt: new Date(),
            errorMessage:
              amountMatches && currencyMatches
                ? null
                : 'The completed Xendit session amount or currency did not match the stored service request.',
          },
        });

        await notifyGuestXenditStatus({ sessionId: payment.id }).catch(
          () => undefined
        );

        return {
          ok: false as const,
          paymentCompleted: true as const,
          error: 'Payment was already completed and can no longer be cancelled.',
        };
      }
    }

    await db.guestXenditSession.updateMany({
      where: { id: payment.id, status: GuestXenditStatus.PENDING },
      data: {
        status: GuestXenditStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: 'Guest cancelled Xendit service checkout.',
        errorMessage: null,
      },
    });

    await cleanupPaymentDraft(payment);

    await notifyGuestXenditStatus({ sessionId: payment.id }).catch(
      (error) =>
        console.warn('[Guest Service Xendit] Unable to notify checkout cancellation.', error)
    );

    return { ok: true as const, alreadyCancelled: false as const };
  } catch (error) {
    return {
      ok: false as const,
      error: getPublicError(error, 'Unable to cancel the checkout.'),
    };
  }
}

async function finalizeGuestServiceXenditSessionInternal(
  paymentSessionIdInput: string
) {
  const paymentSessionId = cleanText(paymentSessionIdInput, 120);

  if (!paymentSessionId) {
    throw new Error('Guest Xendit session is required.');
  }

  const payment = await db.guestXenditSession.findFirst({
    where: {
      id: paymentSessionId,
      paymentProvider: 'XENDIT',
      flowType: GuestXenditFlow.SERVICE_REQUEST,
    },
  });

  if (!payment) {
    throw new Error('Guest Xendit service session was not found.');
  }

const alreadyCreated = await getFinalizedServiceRequestResult(payment.id);

if (alreadyCreated) {
  return {
    ok: true as const,
    alreadyFinalized: true as const,
    requestCode: alreadyCreated.requestCode,
    requestIds: alreadyCreated.requestIds,
  };
}

const existingCodes = parseStringArray(payment.serviceRequestCodes);

if (
  payment.status === GuestXenditStatus.COMPLETED &&
  existingCodes.length
) {
  return {
    ok: true as const,
    alreadyFinalized: true as const,
    requestCode: existingCodes[0],
    requestIds: parseStringArray(payment.serviceRequestIds),
  };
}

if (
  payment.status === GuestXenditStatus.PAID_REVIEW_REQUIRED &&
  isFalseDuplicateServiceFinalizationError(
    payment.errorMessage || payment.refundErrorMessage
  )
) {
  const recovered = await recoverFalseDuplicateServiceFinalization(
    payment.id
  );

  if (!recovered) {
    return {
      ok: false as const,
      waiting: true as const,
      message:
        'This payment is being reviewed. Please refresh the request status in a moment.',
    };
  }
}

if (payment.status === GuestXenditStatus.PROCESSING) {
  const started = payment.processingStartedAt?.getTime() ?? 0;
  const stale = started < Date.now() - 5 * 60 * 1000;

  if (!stale) {
    return {
      ok: false as const,
      waiting: true as const,
      message: 'Your paid service request is already being finalized.',
    };
  }

  await db.guestXenditSession.updateMany({
    where: {
      id: payment.id,
      status: GuestXenditStatus.PROCESSING,
      serviceRequests: { none: {} },
    },
    data: {
      status: GuestXenditStatus.PAID,
      processingStartedAt: null,
      errorMessage: 'Recovered a stale service finalization attempt.',
    },
  });
}

let current = await db.guestXenditSession.findUnique({
  where: { id: payment.id },
});

if (!current) throw new Error('Guest Xendit session was not found.');

const finalizedAfterRefresh = await getFinalizedServiceRequestResult(
  current.id
);

if (finalizedAfterRefresh) {
  return {
    ok: true as const,
    alreadyFinalized: true as const,
    requestCode: finalizedAfterRefresh.requestCode,
    requestIds: finalizedAfterRefresh.requestIds,
  };
}

if (
  current.status === GuestXenditStatus.PAID_REVIEW_REQUIRED &&
  isFalseDuplicateServiceFinalizationError(
    current.errorMessage || current.refundErrorMessage
  )
) {
  const recovered = await recoverFalseDuplicateServiceFinalization(
    current.id
  );

  if (recovered) {
    current = await db.guestXenditSession.findUnique({
      where: { id: payment.id },
    });

    if (!current) {
      throw new Error('Guest Xendit session was not found.');
    }
  }
}

if (current.status !== GuestXenditStatus.PAID) {
  if (current.status === GuestXenditStatus.PENDING) {
    return {
      ok: false as const,
      waiting: true as const,
      message: 'Waiting for Xendit payment confirmation.',
    };
  }

  throw new Error(
    current.errorMessage ||
      current.refundErrorMessage ||
      `Payment cannot be finalized while status is ${current.status}.`
  );
}

const claimed = await db.guestXenditSession.updateMany({
  where: {
    id: current.id,
    status: GuestXenditStatus.PAID,
    serviceRequests: { none: {} },
  },
  data: {
    status: GuestXenditStatus.PROCESSING,
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
    paymentMethod: PaymentMethod.XENDIT,
    paymentStatus: PaymentStatus.PAID,
    guestXenditSessionId: current.id,
    createRoomCharges: false,
    stagedAttachments: payload.stagedAttachments,
    verifiedGuestStayId: current.guestStayId,
  });

  return {
    ok: true as const,
    alreadyFinalized: false as const,
    requestCode: result.requestCode,
    requestIds: result.requestIds,
  };
} catch (error) {
  const message = getErrorMessage(error, '');

  if (isFalseDuplicateServiceFinalizationError(message)) {
    await db.guestXenditSession.updateMany({
      where: {
        id: current.id,
        status: GuestXenditStatus.PROCESSING,
        serviceRequests: {
          none: {},
        },
      },
      data: {
        status: GuestXenditStatus.PAID,
        processingStartedAt: null,
        errorMessage:
          'Recovered from a false duplicate service finalization error. Please retry finalization.',
      },
    });

    throw new Error(
      'Payment was received, but the service request finalization hit a known duplicate-check bug. The payment was kept paid and can be retried safely.'
    );
  }

  if (isNextRedirectError(error)) {
    await db.guestXenditSession.updateMany({
      where: {
        id: current.id,
        status: GuestXenditStatus.PROCESSING,
        serviceRequests: {
          none: {},
        },
      },
      data: {
        status: GuestXenditStatus.PAID,
        processingStartedAt: null,
        errorMessage: null,
      },
    });

    console.warn(
      '[Guest Service Xendit] Browser-only redirect deferred finalization.',
      {
        sessionId: current.id,
      }
    );

    return {
      ok: false as const,
      waiting: true as const,
      message:
        'Payment is confirmed and is waiting for the authorized guest browser to finish the service request.',
    };
  }

  await markGuestPaymentFinalizationFailedAndRefund({
    sessionId: current.id,
    error,
  });

  await cleanupStagedGuestServiceAttachments(payload.stagedAttachments);

  throw new Error(
    `Payment was received, but the service request could not be completed. A Xendit refund was requested automatically. ${message}`.trim()
  );
}
}

/**
 * Idempotent webhook recovery for a paid service request. The request is
 * created from the immutable server-side session payload even if the guest
 * closed or backed out of the Xendit browser page.
 */
export async function finalizeGuestServiceXenditSessionById(
  paymentSessionId: string,
  recoveryToken: unknown
) {
  assertXenditWebhookRecoveryToken(recoveryToken);

  try {
    return await finalizeGuestServiceXenditSessionInternal(paymentSessionId);
  } catch (error) {
    console.error('[Guest Service Xendit] Webhook finalization failed.', error);

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

export async function finalizeGuestServiceXenditCheckout(input: {
  tagCode: string;
  paymentSessionId: string;
}) {
  try {
    const { payment } = await requireOwnedGuestXenditSession({
      tagCode: input.tagCode,
      paymentSessionId: input.paymentSessionId,
      flowType: GuestXenditFlow.SERVICE_REQUEST,
    });

    return await finalizeGuestServiceXenditSessionInternal(payment.id);
  } catch (error) {
    console.error('[Guest Service Xendit] Finalization failed.', error);

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

  const context = await requireGuestXenditSecurityContext(tagCode);
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
      guestXenditSessionId: true,
    },
  });

  if (!request) {
    redirect(`/t/${tagCode}/requests?error=request-not-found`);
  }

  // The page can become stale while it is open, or the guest can double-click
  // the cancel button. Treat those expected races as normal UI outcomes rather
  // than exposing an uncaught server-action error in the browser.
  if (request.status === ServiceRequestStatus.CANCELLED) {
    redirect(`/t/${tagCode}/requests?success=request-already-cancelled`);
  }

  if (request.status !== ServiceRequestStatus.NEW) {
    redirect(`/t/${tagCode}/requests?error=request-not-cancellable`);
  }

  const cancellationResult = await db.$transaction(async (tx) => {
    // Claim the cancellation atomically before restoring inventory. Without
    // this guard, two simultaneous cancellation requests can both restore the
    // same stock and create duplicate cancellation movements.
    const claimed = await tx.serviceRequest.updateMany({
      where: {
        id: request.id,
        status: ServiceRequestStatus.NEW,
      },
      data: {
        status: ServiceRequestStatus.CANCELLED,
        cancelledQty: request.quantity,
        cancelledAt: new Date(),
        cancelReason: reason,
        cancelledById: null,
      },
    });

    if (claimed.count !== 1) {
      const latest = await tx.serviceRequest.findUnique({
        where: { id: request.id },
        select: { status: true },
      });

      return {
        outcome:
          latest?.status === ServiceRequestStatus.CANCELLED
            ? ('ALREADY_CANCELLED' as const)
            : ('NOT_CANCELLABLE' as const),
        restoredServiceIds: [] as string[],
      };
    }

    const restoredServiceIds = await restoreServiceInventoryForRequest(
      tx,
      request
    );

    await tx.serviceRequestStatusHistory.create({
      data: {
        requestId: request.id,
        status: ServiceRequestStatus.CANCELLED,
        note: reason,
      },
    });

    if (request.paymentMethod !== PaymentMethod.XENDIT) {
      await tx.roomAddOnCharge.deleteMany({
        where: { serviceRequestId: request.id },
      });
    }

    return {
      outcome: 'CANCELLED' as const,
      restoredServiceIds,
    };
  });

  if (cancellationResult.outcome === 'ALREADY_CANCELLED') {
    revalidatePath(`/t/${tagCode}/requests`);
    redirect(`/t/${tagCode}/requests?success=request-already-cancelled`);
  }

  if (cancellationResult.outcome === 'NOT_CANCELLABLE') {
    revalidatePath(`/t/${tagCode}/requests`);
    redirect(`/t/${tagCode}/requests?error=request-not-cancellable`);
  }

  const restoredServiceIds = cancellationResult.restoredServiceIds;

  if (
    request.paymentMethod === PaymentMethod.XENDIT &&
    request.guestXenditSessionId &&
    request.amountCents > 0 &&
    (request.paymentStatus === PaymentStatus.PAID ||
      request.paymentStatus === PaymentStatus.PARTIALLY_REFUNDED ||
      request.paymentStatus === PaymentStatus.REFUND_FAILED)
  ) {
    await requestGuestServiceRequestRefund({
      serviceRequestId: request.id,
      amountCents: request.amountCents,
      reason,
      kind: GuestXenditRefundKind.PARTIAL,
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
