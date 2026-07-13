'use server';

import { redirect } from 'next/navigation';
import { PaymentMethod, PaymentStatus } from '@prisma/client';
import { createGuestOrderSchema } from '@/lib/validators';
import { cleanText } from '@/lib/sanitize';
import { createGuestFoodOrder } from '@/lib/guest-food-order';
import {
  createGuestServiceRequests,
  GuestServiceRequestError,
  prepareGuestServiceRequest,
  type GuestServiceSelection,
} from '@/lib/guest-service-order';
import {
  getServiceRequestImageFiles,
  validateServiceRequestImageFile,
} from '@/lib/service-request-attachments';

export async function createGuestOrder(input: unknown) {
  const parsed = createGuestOrderSchema.parse(input);

  if (String(parsed.paymentMethod) === 'XENDIT') {
    throw new Error(
      'Xendit orders must be completed through the secure Xendit checkout.'
    );
  }

  return createGuestFoodOrder(
    {
      tagCode: parsed.tagCode,
      guestName: parsed.guestName,
      notes: parsed.notes,
      paymentMethod: parsed.paymentMethod as PaymentMethod,
      fulfillmentTiming: parsed.fulfillmentTiming,
      scheduledFor: parsed.scheduledFor,
      scheduledNote: parsed.scheduledNote,
      items: parsed.items,
    },
    { paymentStatus: PaymentStatus.UNPAID }
  );
}

function redirectToService(
  tagCode: string,
  params: { error?: string; success?: string; count?: number }
): never {
  const query = new URLSearchParams();

  if (params.error) query.set('error', params.error);
  if (params.success) query.set('success', params.success);
  if (params.count) query.set('count', String(params.count));

  redirect(`/t/${tagCode}/service?${query.toString()}`);
}

function parseServiceSelections(formData: FormData): GuestServiceSelection[] {
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
    quantity: Number(formData.get(`quantity_${serviceCode}`)),
  }));
}

export async function createServiceRequestAction(formData: FormData) {
  const tagCode = cleanText(formData.get('tagCode'), 160) || '';

  if (!tagCode) redirect('/t');

  // Treat this as a client preference only. The server decides whether
  // payment is actually required after recalculating the live catalog quote.
  const requestedPaymentMethod =
    cleanText(formData.get('paymentMethod'), 40) || 'ROOM_CHARGE';

  const input = {
    tagCode,
    guestName: cleanText(formData.get('guestName'), 100),
    notes: cleanText(formData.get('notes'), 1000),
    fulfillmentTiming:
      cleanText(formData.get('fulfillmentTiming'), 40) || 'ASAP',
    scheduledFor: cleanText(formData.get('scheduledFor'), 80),
    scheduledNote: cleanText(formData.get('scheduledNote'), 300),
    services: parseServiceSelections(formData),
  };

  const attachmentFiles = getServiceRequestImageFiles(
    formData,
    'attachments'
  );

  try {
    for (const file of attachmentFiles) {
      validateServiceRequestImageFile(file);
    }
  } catch {
    redirectToService(tagCode, { error: 'invalid_attachment' });
  }

  let prepared: Awaited<ReturnType<typeof prepareGuestServiceRequest>>;

  try {
    prepared = await prepareGuestServiceRequest(input);
  } catch (error) {
    if (error instanceof GuestServiceRequestError) {
      redirectToService(tagCode, { error: error.code });
    }

    console.error('[Guest Service] Request validation failed.', error);
    redirectToService(tagCode, { error: 'request_failed' });
  }

  const hasFixedPrice = prepared.fixedPriceTotalCents > 0;

  // A stale browser draft may still say XENDIT even when the current cart
  // contains only complimentary or price-on-confirmation services. In that
  // case, ignore the stale value and submit normally with no payment.
  if (requestedPaymentMethod === 'XENDIT' && hasFixedPrice) {
    redirectToService(tagCode, { error: 'xendit_checkout_required' });
  }

  if (hasFixedPrice && formData.get('chargeConsent') !== 'true') {
    redirectToService(tagCode, { error: 'consent_required' });
  }

  let result: Awaited<ReturnType<typeof createGuestServiceRequests>>;

  try {
    result = await createGuestServiceRequests(input, {
      paymentMethod: hasFixedPrice ? PaymentMethod.ROOM_CHARGE : null,
      paymentStatus: PaymentStatus.UNPAID,
      createRoomCharges: hasFixedPrice,
      attachmentFiles,
    });
  } catch (error) {
    if (error instanceof GuestServiceRequestError) {
      redirectToService(tagCode, { error: error.code });
    }

    console.error('[Guest Service] Request creation failed.', error);
    redirectToService(tagCode, { error: 'request_failed' });
  }

  const thanksQuery = new URLSearchParams({
    code: result.requestCode,
  });

  redirect(
    `/t/${encodeURIComponent(tagCode)}/service/thanks?${thanksQuery.toString()}`
  );
}
