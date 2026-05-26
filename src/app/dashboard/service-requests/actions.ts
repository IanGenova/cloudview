'use server';

import { ServiceRequestStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { assertHotelScope } from '@/lib/access';
import { cleanText } from '@/lib/sanitize';

function generateChargeCode() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();

  return `ADD-${timestamp}-${random}`;
}

function parsePositiveInteger(value: FormDataEntryValue | null) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return null;
  }

  return parsed;
}

function parsePositiveMoney(value: FormDataEntryValue | null) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.round(parsed * 100) / 100;
}

function redirectWithError(error: string) {
  redirect(`/dashboard/service-requests?error=${error}`);
}

export async function updateServiceRequestAction(formData: FormData) {
  const user = await requireUser();

  const requestId = cleanText(formData.get('requestId'));
  const status = formData.get('status') as ServiceRequestStatus;
  const assignedToId = cleanText(formData.get('assignedToId'));
  const note = cleanText(formData.get('note'), 300);

  const shouldPostCharge = formData.get('postCharge') === 'true';

  const chargeItemName = cleanText(formData.get('chargeItemName'), 160);
  const chargeDescription = cleanText(formData.get('chargeDescription'), 300);
  const chargeQuantity = parsePositiveInteger(formData.get('chargeQuantity'));
  const chargeUnitPrice = parsePositiveMoney(formData.get('chargeUnitPrice'));

  if (!requestId || !Object.values(ServiceRequestStatus).includes(status)) {
    redirectWithError('invalid-request-update');
  }

  const request = await db.serviceRequest.findUnique({
    where: {
      id: requestId,
    },
    select: {
      id: true,
      hotelId: true,
      roomId: true,
      requestCode: true,
      type: true,
    },
  });

  if (!request) {
    redirectWithError('request-not-found');
  }

  assertHotelScope(user, request.hotelId);

  if (shouldPostCharge) {
    if (!request.roomId) {
      redirectWithError('no-room');
    }

    if (!chargeItemName) {
      redirectWithError('item-required');
    }

    if (!chargeQuantity) {
      redirectWithError('quantity-required');
    }

    if (!chargeUnitPrice) {
      redirectWithError('unit-price-required');
    }
  }

  await db.$transaction(async (tx) => {
    await tx.serviceRequest.update({
      where: {
        id: request.id,
      },
      data: {
        status,
        assignedToId: assignedToId || null,
      },
    });

    await tx.serviceRequestStatusHistory.create({
      data: {
        requestId: request.id,
        status,
        userId: user.id,
        note: note || null,
      },
    });

    if (!shouldPostCharge) {
      return;
    }

    const totalAmount = chargeQuantity! * chargeUnitPrice!;

    await tx.roomAddOnCharge.upsert({
      where: {
        serviceRequestId: request.id,
      },
      update: {
        itemName: chargeItemName,
        description: chargeDescription || null,
        quantity: chargeQuantity!,
        unitPrice: chargeUnitPrice!.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
        postedById: user.id,
      },
      create: {
        chargeCode: generateChargeCode(),
        hotelId: request.hotelId,
        roomId: request.roomId!,
        serviceRequestId: request.id,
        itemName: chargeItemName,
        description: chargeDescription || null,
        quantity: chargeQuantity!,
        unitPrice: chargeUnitPrice!.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
        postedById: user.id,
      },
    });
  });

  revalidatePath('/dashboard/service-requests');
  redirect('/dashboard/service-requests');
}