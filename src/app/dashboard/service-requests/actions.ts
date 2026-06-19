'use server';

import {
  Prisma,
  ServiceAvailabilityMovementType,
  ServiceRequestStatus,
} from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { assertHotelScope } from '@/lib/access';
import { cleanText } from '@/lib/sanitize';
import { triggerServiceRequestUpdated } from '@/lib/realtime/service-request-events';
import { triggerInventoryUpdated } from '@/lib/realtime/inventory-events';
import {
  syncServiceRequestPoints,
  voidSyncedServiceRequestPoints,
} from '@/lib/guest-point-sync';

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

function redirectWithMessage({
  success,
  error,
}: {
  success?: string;
  error?: string;
}): never {
  const params = new URLSearchParams();

  if (success) {
    params.set('success', success);
  }

  if (error) {
    params.set('error', error);
  }

  redirect(
    params.toString()
      ? `/dashboard/service-requests?${params.toString()}`
      : '/dashboard/service-requests'
  );
}

function redirectWithError(error: string): never {
  redirectWithMessage({ error });
}

function redirectToServiceRequests(success = 'request-updated'): never {
  redirectWithMessage({ success });
}

function revalidateServiceRequestPaths() {
  revalidatePath('/dashboard/service-requests');
  revalidatePath('/dashboard/inventory');
  revalidatePath('/t/[tagCode]/service', 'page');
  revalidatePath('/t/[tagCode]/requests', 'page');
}

async function safelySyncServiceRequestPoints(serviceRequestId: string) {
  try {
    const result = await syncServiceRequestPoints(serviceRequestId);

    if (process.env.NODE_ENV !== 'production') {
      console.info('Service request point sync result:', {
        serviceRequestId,
        result,
      });
    }
  } catch (error) {
    console.warn('Failed to sync service request reward points:', error);
  }
}

async function safelyVoidSyncedServiceRequestPoints(serviceRequestId: string) {
  try {
    const result = await voidSyncedServiceRequestPoints(serviceRequestId);

    if (process.env.NODE_ENV !== 'production') {
      console.info('Service request point void result:', {
        serviceRequestId,
        result,
      });
    }
  } catch (error) {
    console.warn('Failed to void service request reward points:', error);
  }
}

type ServiceRequestForRestore = {
  id: string;
  hotelId: string;
  requestCode: string;
  type: string;
};

async function restoreServiceInventoryForCancelledRequests({
  tx,
  requests,
  hotelId,
  userId,
}: {
  tx: Prisma.TransactionClient;
  requests: ServiceRequestForRestore[];
  hotelId: string;
  userId: string;
}) {
  const restoredServiceIds: string[] = [];

  for (const request of requests) {
    const deductionMovements = await tx.serviceAvailabilityMovement.findMany({
      where: {
        hotelId,
        serviceRequestId: request.id,
        type: ServiceAvailabilityMovementType.REQUEST_DEDUCTION,
      },
      select: {
        serviceId: true,
        quantity: true,
      },
    });

    if (!deductionMovements.length) {
      continue;
    }

    const quantityByServiceId = new Map<string, number>();

    for (const movement of deductionMovements) {
      quantityByServiceId.set(
        movement.serviceId,
        (quantityByServiceId.get(movement.serviceId) ?? 0) + movement.quantity
      );
    }

    for (const [serviceId, deductedQuantity] of quantityByServiceId.entries()) {
      const existingRestore = await tx.serviceAvailabilityMovement.findFirst({
        where: {
          hotelId,
          serviceId,
          serviceRequestId: request.id,
          type: ServiceAvailabilityMovementType.CANCEL_RESTORE,
        },
        select: {
          id: true,
        },
      });

      if (existingRestore) {
        continue;
      }

      const stock = await tx.serviceAvailabilityStock.findUnique({
        where: {
          hotelId_serviceId: {
            hotelId,
            serviceId,
          },
        },
        select: {
          id: true,
          availableQty: true,
          usedQty: true,
        },
      });

      if (!stock) {
        continue;
      }

      const restoreQuantity = Math.max(deductedQuantity, 0);

      if (restoreQuantity <= 0) {
        continue;
      }

      const updatedStock = await tx.serviceAvailabilityStock.update({
        where: {
          id: stock.id,
        },
        data: {
          availableQty: {
            increment: restoreQuantity,
          },
          usedQty: {
            decrement: Math.min(stock.usedQty, restoreQuantity),
          },
          isSoldOut: false,
        },
        select: {
          availableQty: true,
        },
      });

      await tx.serviceAvailabilityMovement.create({
        data: {
          hotelId,
          serviceId,
          stockId: stock.id,
          type: ServiceAvailabilityMovementType.CANCEL_RESTORE,
          quantity: restoreQuantity,
          balanceAfter: updatedStock.availableQty,
          reason: `Cancelled service item ${request.type} from request order ${request.requestCode} stock restored`,
          userId,
          serviceRequestId: request.id,
        },
      });

      restoredServiceIds.push(serviceId);
    }
  }

  return Array.from(new Set(restoredServiceIds));
}

export async function updateServiceRequestAction(formData: FormData) {
  const user = await requireUser();

  const requestId = cleanText(formData.get('requestId'));
  const requestCode = cleanText(formData.get('requestCode'));
  const hotelIdFromForm = cleanText(formData.get('hotelId'));
  const status = formData.get('status') as ServiceRequestStatus;
  const assignedToId = cleanText(formData.get('assignedToId'));
  const note = cleanText(formData.get('note'), 300);

  const shouldPostCharge = formData.get('postCharge') === 'true';

  if (
    (!requestId && !requestCode) ||
    !Object.values(ServiceRequestStatus).includes(status)
  ) {
    redirectWithError('invalid-request-update');
  }

  const requestWhere: Prisma.ServiceRequestWhereInput = requestCode
    ? {
        requestCode,
        ...(hotelIdFromForm
          ? {
              hotelId: hotelIdFromForm,
            }
          : user.role === 'SUPER_ADMIN'
            ? {}
            : {
                hotelId: user.hotelId!,
              }),
      }
    : {
        id: requestId,
      };

  const requests = await db.serviceRequest.findMany({
    where: requestWhere,
    select: {
      id: true,
      hotelId: true,
      roomId: true,
      requestCode: true,
      type: true,
      status: true,
      quantity: true,
      cancelledQty: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  if (!requests.length) {
    redirectWithError('request-not-found');
  }

  const hotelId = requests[0].hotelId;

  assertHotelScope(user, hotelId);

  const invalidHotelScope = requests.some(
    (request) => request.hotelId !== hotelId
  );

  if (invalidHotelScope) {
    redirectWithError('invalid-request-update');
  }

  const requestIds = requests.map((request) => request.id);

  const chargeRequestIds = formData
    .getAll('chargeRequestId')
    .map((value) => cleanText(value))
    .filter(Boolean);

  const shouldRestoreInventory =
    status === ServiceRequestStatus.CANCELLED &&
    requests.some(
      (request) =>
        request.status !== ServiceRequestStatus.CANCELLED &&
        request.status !== ServiceRequestStatus.COMPLETED
    );

  if (shouldPostCharge) {
    const idsToCharge = chargeRequestIds.length
      ? chargeRequestIds
      : requestId
        ? [requestId]
        : requestIds;

    for (const id of idsToCharge) {
      const request = requests.find((item) => item.id === id);

      if (!request) {
        redirectWithError('invalid-charge-request');
      }

      if (!request.roomId) {
        redirectWithError('no-room');
      }

      const chargeItemName = cleanText(
        formData.get(`chargeItemName_${id}`) ?? formData.get('chargeItemName'),
        160
      );
      const chargeQuantity = parsePositiveInteger(
        formData.get(`chargeQuantity_${id}`) ?? formData.get('chargeQuantity')
      );
      const chargeUnitPrice = parsePositiveMoney(
        formData.get(`chargeUnitPrice_${id}`) ?? formData.get('chargeUnitPrice')
      );

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
  }

  let restoredServiceIds: string[] = [];

  await db.$transaction(async (tx) => {
    for (const request of requests) {
      await tx.serviceRequest.update({
        where: {
          id: request.id,
        },
        data: {
          status,
          assignedToId: assignedToId || null,
          ...(status === ServiceRequestStatus.CANCELLED
            ? {
                cancelledQty: request.quantity,
                cancelledAt: new Date(),
                cancelReason: note || 'Cancelled from dashboard',
                cancelledById: user.id,
              }
            : {}),
        },
      });
    }

    await Promise.all(
      requestIds.map((id) =>
        tx.serviceRequestStatusHistory.create({
          data: {
            requestId: id,
            status,
            userId: user.id,
            note: note || null,
          },
        })
      )
    );

    if (shouldRestoreInventory) {
      restoredServiceIds = await restoreServiceInventoryForCancelledRequests({
        tx,
        requests,
        hotelId,
        userId: user.id,
      });
    }

    if (!shouldPostCharge) {
      return;
    }

    const idsToCharge = (
  chargeRequestIds.length
    ? chargeRequestIds
    : requestId
      ? [requestId]
      : requestIds
).filter((id): id is string => Boolean(id));

for (const id of idsToCharge) {
  const serviceRequestId = id;

  const request = requests.find((item) => item.id === serviceRequestId);

  if (!request?.roomId) {
    continue;
  }

      const chargeItemName = cleanText(
        formData.get(`chargeItemName_${id}`) ?? formData.get('chargeItemName'),
        160
      );
      const chargeDescription = cleanText(
       formData.get(`chargeDescription_${serviceRequestId}`)??
          formData.get('chargeDescription'),
        300
      );
      const chargeQuantity = parsePositiveInteger(
        formData.get(`chargeQuantity_${serviceRequestId}`) ?? formData.get('chargeQuantity')
      );
      const chargeUnitPrice = parsePositiveMoney(
        formData.get(`chargeUnitPrice_${serviceRequestId}`) ?? formData.get('chargeUnitPrice')
      );

      if (!chargeItemName || !chargeQuantity || !chargeUnitPrice) {
        continue;
      }

      const totalAmount = chargeQuantity * chargeUnitPrice;

      await tx.roomAddOnCharge.upsert({
        where: {
          serviceRequestId,
        },
        update: {
          itemName: chargeItemName,
          description: chargeDescription || null,
          quantity: chargeQuantity,
          unitPrice: chargeUnitPrice.toFixed(2),
          totalAmount: totalAmount.toFixed(2),
          postedById: user.id,
        },
        create: {
          chargeCode: generateChargeCode(),
          hotelId: request.hotelId,
          roomId: request.roomId,
          serviceRequestId,
          itemName: chargeItemName,
          description: chargeDescription || null,
          quantity: chargeQuantity,
          unitPrice: chargeUnitPrice.toFixed(2),
          totalAmount: totalAmount.toFixed(2),
          postedById: user.id,
        },
      });
    }
  });

  revalidateServiceRequestPaths();

  await Promise.allSettled(
    requests.map((request) =>
      triggerServiceRequestUpdated({
        hotelId: request.hotelId,
        requestId: request.id,
        requestCode: request.requestCode,
        status,
        billed: shouldPostCharge,
      })
    )
  );

  if (restoredServiceIds.length > 0) {
    await triggerInventoryUpdated({
      hotelId,
      productIds: restoredServiceIds,
      source: 'DASHBOARD',
    });
  }

  if (status === ServiceRequestStatus.IN_PROGRESS) {
    redirectToServiceRequests('request-started');
  }

  if (status === ServiceRequestStatus.COMPLETED) {
    await Promise.allSettled(
      requestIds.map((id: string) => safelySyncServiceRequestPoints(id))
    );

    redirectToServiceRequests('request-completed');
  }

  if (status === ServiceRequestStatus.CANCELLED) {
    await Promise.allSettled(
      requestIds.map((id: string) => safelyVoidSyncedServiceRequestPoints(id))
    );

    redirectToServiceRequests('request-cancelled');
  }

  if (shouldPostCharge) {
    redirectToServiceRequests('charge-updated');
  }

  redirectToServiceRequests('request-updated');
}

export async function cancelServiceRequestItemAction(formData: FormData) {
  const user = await requireUser();

  const requestId = cleanText(formData.get('requestId'));
  const reason = cleanText(formData.get('reason'), 300);

  if (!requestId) {
    redirectWithError('request-required');
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
      status: true,
      quantity: true,
    },
  });

  if (!request) {
    redirectWithError('request-not-found');
  }

  assertHotelScope(user, request.hotelId);

  if (request.status !== ServiceRequestStatus.NEW) {
    redirectWithError('request-item-not-cancellable');
  }

  let restoredServiceIds: string[] = [];

  await db.$transaction(async (tx) => {
    await tx.serviceRequest.update({
      where: {
        id: request.id,
      },
      data: {
        status: ServiceRequestStatus.CANCELLED,
        cancelledQty: request.quantity,
        cancelledAt: new Date(),
        cancelReason: reason || 'Cancelled from dashboard',
        cancelledById: user.id,
      },
    });

    await tx.serviceRequestStatusHistory.create({
      data: {
        requestId: request.id,
        status: ServiceRequestStatus.CANCELLED,
        userId: user.id,
        note: reason
          ? `Cancelled service item: ${reason}`
          : 'Cancelled service item from dashboard',
      },
    });

    await tx.roomAddOnCharge.deleteMany({
      where: {
        serviceRequestId: request.id,
      },
    });

    restoredServiceIds = await restoreServiceInventoryForCancelledRequests({
      tx,
      requests: [request],
      hotelId: request.hotelId,
      userId: user.id,
    });
  });

  revalidateServiceRequestPaths();

  await triggerServiceRequestUpdated({
    hotelId: request.hotelId,
    requestId: request.id,
    requestCode: request.requestCode,
    status: ServiceRequestStatus.CANCELLED,
    billed: false,
  });

  if (restoredServiceIds.length > 0) {
    await triggerInventoryUpdated({
      hotelId: request.hotelId,
      productIds: restoredServiceIds,
      source: 'DASHBOARD',
    });
  }

  redirectToServiceRequests('request-item-cancelled');
}