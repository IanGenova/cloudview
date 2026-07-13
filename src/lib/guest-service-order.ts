import 'server-only';

import crypto from 'crypto';
import { mkdir, rm, writeFile } from 'fs/promises';
import path from 'path';
import type { Prisma } from '@prisma/client';
import {
  FulfillmentTiming,
  GuestXenditFlow,
  GuestXenditStatus,
  PaymentMethod,
  PaymentStatus,
  ServiceAvailabilityMovementType,
  ServiceBillingMode,
  ServiceRequestAttachmentType,
  ServiceRequestStatus,
  SeriesCodeType,
} from '@prisma/client';
import { db } from '@/lib/db';
import { cleanText } from '@/lib/sanitize';
import { randomCode } from '@/lib/utils';
import { logActivity } from '@/lib/activity';
import { triggerInventoryUpdated } from '@/lib/realtime/inventory-events';
import { triggerServiceRequestCreated } from '@/lib/realtime/service-request-events';
import { createDashboardNotification } from '@/lib/dashboard-notifications';
import { notifyGuestXenditStatus } from '@/lib/xendit-dashboard-notifications';
import { generateSeriesCode } from '@/lib/series-code';
import {
  buildScheduledFulfillment,
  parseFulfillmentTiming,
  parseScheduledDate,
} from '@/lib/scheduled-fulfillment';
import {
  saveServiceRequestImageFiles,
  validateServiceRequestImageFile,
} from '@/lib/service-request-attachments';
import { requireGuestXenditSecurityContext } from '@/lib/guest-xendit-security';

export type GuestServiceSelection = {
  serviceCode: string;
  quantity: number;
};

export type StagedServiceAttachment = {
  imageUrl: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
};

export type GuestServiceRequestInput = {
  tagCode: string;
  guestName?: string | null;
  notes?: string | null;
  fulfillmentTiming?: string | null;
  scheduledFor?: string | null;
  scheduledNote?: string | null;
  services: GuestServiceSelection[];
};

export type GuestServiceRequestOptions = {
  paymentMethod?: PaymentMethod | null;
  paymentStatus?: PaymentStatus;
  guestXenditSessionId?: string | null;
  createRoomCharges?: boolean;
  attachmentFiles?: File[];
  stagedAttachments?: StagedServiceAttachment[];
};

type PreparedService = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  billingMode: ServiceBillingMode;
  unitPriceCents: number;
  inventoryTracked: boolean;
  quantity: number;
};

type PreparedGuestServiceRequest = {
  context: Awaited<ReturnType<typeof requireGuestXenditSecurityContext>>;
  hotelName: string;
  guestName: string;
  notes: string;
  schedule: ReturnType<typeof buildScheduledFulfillment>;
  services: PreparedService[];
  fixedPriceTotalCents: number;
};

export class GuestServiceRequestError extends Error {
  constructor(
    public code:
      | 'invalid_service'
      | 'quantity_required'
      | 'service_stock_unavailable'
      | 'invalid_schedule'
      | 'room_required'
      | 'request_failed',
    message: string
  ) {
    super(message);
    this.name = 'GuestServiceRequestError';
  }
}

function normalizeSelections(values: GuestServiceSelection[]) {
  const quantities = new Map<string, number>();

  for (const value of values ?? []) {
    const serviceCode = cleanText(value.serviceCode, 80);
    const quantity = Number(value.quantity);

    if (!serviceCode || !Number.isInteger(quantity) || quantity <= 0) {
      throw new GuestServiceRequestError(
        'quantity_required',
        'Each selected service requires a valid quantity.'
      );
    }

    quantities.set(
      serviceCode,
      Math.min((quantities.get(serviceCode) ?? 0) + quantity, 20)
    );
  }

  const normalized = Array.from(quantities.entries()).map(
    ([serviceCode, quantity]) => ({ serviceCode, quantity })
  );

  if (!normalized.length) {
    throw new GuestServiceRequestError(
      'invalid_service',
      'Please select at least one service.'
    );
  }

  return normalized;
}

export async function prepareGuestServiceRequest(
  input: GuestServiceRequestInput
): Promise<PreparedGuestServiceRequest> {
  const context = await requireGuestXenditSecurityContext(input.tagCode);
  const selections = normalizeSelections(input.services);
  const serviceCodes = selections.map((item) => item.serviceCode);

  let schedule: ReturnType<typeof buildScheduledFulfillment>;

  try {
    schedule = buildScheduledFulfillment({
      fulfillmentTiming: parseFulfillmentTiming(
        cleanText(input.fulfillmentTiming || 'ASAP', 40) || 'ASAP'
      ),
      scheduledFor: parseScheduledDate(
        cleanText(input.scheduledFor || '', 80) || ''
      ),
      scheduledNote: cleanText(input.scheduledNote || '', 300) || '',
      releaseBufferMinutes: 15,
    });
  } catch (error) {
    throw new GuestServiceRequestError(
      'invalid_schedule',
      error instanceof Error
        ? error.message
        : 'Please select a valid future service date and time.'
    );
  }

  const [hotel, records] = await Promise.all([
    db.hotel.findUnique({
      where: { id: context.tag.hotelId },
      select: { id: true, name: true, isActive: true },
    }),
    db.serviceCatalogItem.findMany({
      where: {
        hotelId: context.tag.hotelId,
        code: { in: serviceCodes },
        isActive: true,
      },
      include: { availabilityStock: true },
    }),
  ]);

  if (!hotel?.isActive) {
    throw new GuestServiceRequestError(
      'request_failed',
      'The hotel is currently unavailable.'
    );
  }

  if (records.length !== serviceCodes.length) {
    throw new GuestServiceRequestError(
      'invalid_service',
      'One or more services are no longer available.'
    );
  }

  const recordMap = new Map(records.map((record) => [record.code, record]));
  const preparedServices: PreparedService[] = selections.map((selection) => {
    const service = recordMap.get(selection.serviceCode);

    if (!service) {
      throw new GuestServiceRequestError(
        'invalid_service',
        'One or more services are no longer available.'
      );
    }

    if (service.inventoryTracked) {
      const stock = service.availabilityStock;

      if (
        !stock ||
        stock.isSoldOut ||
        stock.availableQty < selection.quantity
      ) {
        throw new GuestServiceRequestError(
          'service_stock_unavailable',
          `${service.name} only has ${Math.max(
            stock?.availableQty ?? 0,
            0
          )} available.`
        );
      }
    }

    const unitPriceCents =
      service.billingMode === ServiceBillingMode.FIXED_PRICE
        ? Math.round(Number(service.unitPrice || 0) * 100)
        : 0;

    if (
      service.billingMode === ServiceBillingMode.FIXED_PRICE &&
      unitPriceCents <= 0
    ) {
      throw new GuestServiceRequestError(
        'invalid_service',
        `${service.name} does not have a valid fixed price.`
      );
    }

    return {
      id: service.id,
      code: service.code,
      name: service.name,
      description: service.description,
      billingMode: service.billingMode,
      unitPriceCents,
      inventoryTracked: service.inventoryTracked,
      quantity: selection.quantity,
    };
  });

  const fixedPriceTotalCents = preparedServices.reduce(
    (sum, service) =>
      sum +
      (service.billingMode === ServiceBillingMode.FIXED_PRICE
        ? service.unitPriceCents * service.quantity
        : 0),
    0
  );

  return {
    context,
    hotelName: hotel.name,
    guestName:
      cleanText(input.guestName || context.guestName || '', 100) || 'Guest',
    notes: cleanText(input.notes || '', 1000) || '',
    schedule,
    services: preparedServices,
    fixedPriceTotalCents,
  };
}

function extensionForMime(mimeType: string) {
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'image/webp') return '.webp';
  return '.jpg';
}

function publicPathFromImageUrl(imageUrl: string) {
  const relative = imageUrl.replace(/^\/+/, '');
  return path.join(process.cwd(), 'public', ...relative.split('/'));
}

export async function stageGuestServiceAttachments(input: {
  paymentSessionId: string;
  files: File[];
}) {
  if (!input.files.length) {
    return [] satisfies StagedServiceAttachment[];
  }

  const root = path.join(
    process.cwd(),
    'public',
    'uploads',
    'service-request-xendit',
    input.paymentSessionId
  );

  await mkdir(root, { recursive: true });

  const staged: StagedServiceAttachment[] = [];

  try {
    for (const file of input.files) {
      validateServiceRequestImageFile(file);

      const filename = `${crypto.randomUUID()}${extensionForMime(file.type)}`;
      const imageUrl = `/uploads/service-request-xendit/${input.paymentSessionId}/${filename}`;
      const buffer = Buffer.from(await file.arrayBuffer());

      await writeFile(path.join(root, filename), buffer, { flag: 'wx' });

      staged.push({
        imageUrl,
        originalName: cleanText(file.name, 191) || 'guest-upload',
        mimeType: file.type,
        sizeBytes: file.size,
      });
    }

    return staged;
  } catch (error) {
    await rm(root, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

export async function cleanupStagedGuestServiceAttachments(
  attachments: StagedServiceAttachment[]
) {
  const directories = new Set<string>();

  for (const attachment of attachments) {
    const filePath = publicPathFromImageUrl(attachment.imageUrl);
    directories.add(path.dirname(filePath));
  }

  await Promise.allSettled(
    Array.from(directories).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
}

export async function createGuestServiceRequests(
  input: GuestServiceRequestInput,
  options: GuestServiceRequestOptions = {}
) {
  const prepared = await prepareGuestServiceRequest(input);
  const xenditSessionId =
    cleanText(options.guestXenditSessionId || '') || null;
  const requestedPaymentMethod = options.paymentMethod ?? null;
  const paymentStatus = options.paymentStatus ?? PaymentStatus.UNPAID;
  const createRoomCharges = Boolean(options.createRoomCharges);
  const hasPayableFixedPrice = prepared.fixedPriceTotalCents > 0;
  const paymentMethod = hasPayableFixedPrice
    ? requestedPaymentMethod
    : null;

  if (xenditSessionId && !hasPayableFixedPrice) {
    throw new GuestServiceRequestError(
      'request_failed',
      'A Xendit session cannot be attached to a request with no payable amount.'
    );
  }

  if (xenditSessionId && paymentMethod !== PaymentMethod.XENDIT) {
    throw new GuestServiceRequestError(
      'request_failed',
      'The paid service request has an invalid payment method.'
    );
  }

  if (paymentMethod === PaymentMethod.XENDIT && !xenditSessionId) {
    throw new GuestServiceRequestError(
      'request_failed',
      'A Xendit service request requires a verified payment session.'
    );
  }

  if (createRoomCharges && paymentMethod !== PaymentMethod.ROOM_CHARGE) {
    throw new GuestServiceRequestError(
      'request_failed',
      'Room add-on charges require the room-charge payment method.'
    );
  }

  if (hasPayableFixedPrice && !paymentMethod) {
    throw new GuestServiceRequestError(
      'request_failed',
      'A payment method is required for fixed-price service requests.'
    );
  }

  if (
    createRoomCharges &&
    hasPayableFixedPrice &&
    !prepared.context.tag.roomId
  ) {
    throw new GuestServiceRequestError(
      'room_required',
      'A room is required before posting room add-on charges.'
    );
  }

  const created = await db.$transaction(
    async (tx: Prisma.TransactionClient) => {
      const stockByServiceId = new Map<
        string,
        { id: string; availableQty: number; isSoldOut: boolean }
      >();

      for (const service of prepared.services) {
        if (!service.inventoryTracked) continue;

        const stock = await tx.serviceAvailabilityStock.findUnique({
          where: {
            hotelId_serviceId: {
              hotelId: prepared.context.tag.hotelId,
              serviceId: service.id,
            },
          },
          select: { id: true, availableQty: true, isSoldOut: true },
        });

        if (
          !stock ||
          stock.isSoldOut ||
          stock.availableQty < service.quantity
        ) {
          throw new GuestServiceRequestError(
            'service_stock_unavailable',
            `${service.name} no longer has enough availability.`
          );
        }

        stockByServiceId.set(service.id, stock);
      }

      if (xenditSessionId) {
        const session = await tx.guestXenditSession.findFirst({
          where: {
            id: xenditSessionId,
            flowType: GuestXenditFlow.SERVICE_REQUEST,
            hotelId: prepared.context.tag.hotelId,
            tagId: prepared.context.tag.id,
            guestSessionId: prepared.context.session.id,
            status: GuestXenditStatus.PROCESSING,
            serviceRequests: { none: {} },
          },
          select: { id: true, amountCents: true },
        });

        if (!session) {
          throw new Error('Paid Guest Xendit session is no longer claimable.');
        }

        if (session.amountCents !== prepared.fixedPriceTotalCents) {
          throw new Error(
            'The current fixed-price service total no longer matches the Xendit payment.'
          );
        }
      }

      const requestCode = await generateSeriesCode(tx, {
        hotelName: prepared.hotelName,
        type: SeriesCodeType.SERVICE,
      });

      const requests: Array<{
        id: string;
        requestCode: string;
        amountCents: number;
        paymentMethod: PaymentMethod | null;
      }> = [];

      for (const service of prepared.services) {
        const amountCents =
          service.billingMode === ServiceBillingMode.FIXED_PRICE
            ? service.unitPriceCents * service.quantity
            : 0;
        const itemPaymentMethod =
          amountCents > 0 ? paymentMethod : null;
        const itemPaymentStatus =
          amountCents > 0 ? paymentStatus : PaymentStatus.UNPAID;

        const request = await tx.serviceRequest.create({
          data: {
            hotelId: prepared.context.tag.hotelId,
            roomId: prepared.context.tag.roomId,
            locationId: prepared.context.tag.locationId,
            tagId: prepared.context.tag.id,
            guestSessionId: prepared.context.session.id,
            guestStayId: prepared.context.guestStayId,
            guestMemberId: prepared.context.guestMemberId,
            guestXenditSessionId: xenditSessionId,
            requestCode,
            type: service.name,
            serviceCodeSnapshot: service.code,
            billingModeSnapshot: service.billingMode,
            unitPriceCents: service.unitPriceCents,
            amountCents,
            paymentMethod: itemPaymentMethod,
            paymentStatus: itemPaymentStatus,
            quantity: service.quantity,
            guestName: prepared.guestName,
            fulfillmentTiming: prepared.schedule.fulfillmentTiming,
            scheduledFor: prepared.schedule.scheduledFor,
            scheduledWindowStart: prepared.schedule.scheduledWindowStart,
            scheduledWindowEnd: prepared.schedule.scheduledWindowEnd,
            releaseAt: prepared.schedule.releaseAt,
            releasedAt: prepared.schedule.releasedAt,
            scheduledReleaseStatus: prepared.schedule.scheduledReleaseStatus,
            scheduledNote: prepared.schedule.scheduledNote,
            notes:
              [
                `Grouped service request order ${requestCode}.`,
                prepared.notes || null,
                service.inventoryTracked
                  ? `Inventory-tracked service. Quantity: ${service.quantity}.`
                  : null,
                service.billingMode === ServiceBillingMode.FIXED_PRICE
                  ? `${
                      xenditSessionId
                        ? 'Paid through Xendit'
                        : 'Room add-on selected'
                    }. Quantity: ${service.quantity}.`
                  : null,
                service.billingMode === ServiceBillingMode.PRICE_ON_CONFIRMATION
                  ? 'Price requires staff confirmation before billing.'
                  : null,
              ]
                .filter(Boolean)
                .join('\n') || null,
            statusHistory: {
              create: {
                status: ServiceRequestStatus.NEW,
                note: xenditSessionId
                  ? `Xendit payment confirmed; grouped service request ${requestCode} created from NFC portal`
                  : `Guest submitted grouped service request order ${requestCode} from NFC portal`,
              },
            },
          },
          select: {
            id: true,
            requestCode: true,
            amountCents: true,
            paymentMethod: true,
          },
        });

        if (service.inventoryTracked) {
          const stock = stockByServiceId.get(service.id)!;
          const updated = await tx.serviceAvailabilityStock.updateMany({
            where: {
              id: stock.id,
              isSoldOut: false,
              availableQty: { gte: service.quantity },
            },
            data: {
              availableQty: { decrement: service.quantity },
              usedQty: { increment: service.quantity },
            },
          });

          if (updated.count !== 1) {
            throw new GuestServiceRequestError(
              'service_stock_unavailable',
              `${service.name} availability changed while finalizing the request.`
            );
          }

          const updatedStock = await tx.serviceAvailabilityStock.findUnique({
            where: { id: stock.id },
            select: { availableQty: true },
          });

          if (!updatedStock) {
            throw new Error(`${service.name} inventory record was not found.`);
          }

          if (updatedStock.availableQty <= 0) {
            await tx.serviceAvailabilityStock.update({
              where: { id: stock.id },
              data: { isSoldOut: true },
            });
          }

          await tx.serviceAvailabilityMovement.create({
            data: {
              hotelId: prepared.context.tag.hotelId,
              serviceId: service.id,
              stockId: stock.id,
              type: ServiceAvailabilityMovementType.REQUEST_DEDUCTION,
              quantity: service.quantity,
              balanceAfter: Math.max(updatedStock.availableQty, 0),
              reason: `Guest grouped service request ${requestCode}`,
              userId: null,
              serviceRequestId: request.id,
            },
          });
        }

        if (
          createRoomCharges &&
          service.billingMode === ServiceBillingMode.FIXED_PRICE
        ) {
          await tx.roomAddOnCharge.create({
            data: {
              chargeCode: randomCode('ADD'),
              hotelId: prepared.context.tag.hotelId,
              roomId: prepared.context.tag.roomId!,
              serviceRequestId: request.id,
              itemName: service.name,
              description: prepared.notes || service.description || null,
              quantity: service.quantity,
              unitPrice: (service.unitPriceCents / 100).toFixed(2),
              totalAmount: (amountCents / 100).toFixed(2),
              postedById: null,
            },
          });
        }

        requests.push(request);
      }

      if (options.stagedAttachments?.length && requests[0]) {
        await tx.serviceRequestAttachment.createMany({
          data: options.stagedAttachments.map((attachment) => ({
            hotelId: prepared.context.tag.hotelId,
            requestId: requests[0].id,
            requestCode,
            imageUrl: attachment.imageUrl,
            originalName: attachment.originalName,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes,
            caption: prepared.notes || null,
            attachmentType: ServiceRequestAttachmentType.GUEST_UPLOAD,
            uploadedByGuest: true,
          })),
        });
      }

      if (xenditSessionId) {
        const completed = await tx.guestXenditSession.updateMany({
          where: {
            id: xenditSessionId,
            status: GuestXenditStatus.PROCESSING,
          },
          data: {
            status: GuestXenditStatus.COMPLETED,
            serviceRequestIds: requests.map(
              (request) => request.id
            ) as unknown as Prisma.InputJsonValue,
            serviceRequestCodes: [requestCode] as unknown as Prisma.InputJsonValue,
            completedAt: new Date(),
            errorMessage: null,
          },
        });

        if (completed.count !== 1) {
          throw new Error(
            'The Xendit service payment was finalized by another request.'
          );
        }
      }

      return { requestCode, requests };
    },
    { maxWait: 10_000, timeout: 30_000 }
  );

  if (options.attachmentFiles?.length && created.requests[0]) {
    try {
      await saveServiceRequestImageFiles({
        hotelId: prepared.context.tag.hotelId,
        requestId: created.requests[0].id,
        requestCode: created.requestCode,
        files: options.attachmentFiles,
        attachmentType: ServiceRequestAttachmentType.GUEST_UPLOAD,
        uploadedByGuest: true,
        caption: prepared.notes || null,
      });
    } catch (error) {
      console.error('Failed to save service request attachments.', error);
    }
  }

  await Promise.allSettled(
    created.requests.map((request) =>
      logActivity({
        hotelId: prepared.context.tag.hotelId,
        actor: prepared.guestName || 'Guest',
        action: 'CREATE',
        entity: 'ServiceRequest',
        entityId: request.id,
        message: `New grouped service request ${request.requestCode}`,
      })
    )
  );

  await Promise.allSettled([
    createDashboardNotification({
      hotelId: prepared.context.tag.hotelId,
      type: 'SERVICE_REQUEST_CREATED',
      title:
        prepared.schedule.fulfillmentTiming === FulfillmentTiming.SCHEDULED
          ? 'New Scheduled Service Request'
          : 'New Service Request',
      message:
        prepared.schedule.fulfillmentTiming === FulfillmentTiming.SCHEDULED
          ? `${created.requestCode} was scheduled by a guest and is waiting for release.`
          : `${created.requestCode} needs staff attention.`,
      url: '/dashboard/service-requests',
      payload: {
        requestCode: created.requestCode,
        requestIds: created.requests.map((request) => request.id),
        count: created.requests.length,
        paymentMethod: xenditSessionId ? 'XENDIT' : paymentMethod,
        fulfillmentTiming: prepared.schedule.fulfillmentTiming,
        source: 'GUEST_PORTAL',
      },
    }),
  ]);

  if (prepared.schedule.fulfillmentTiming === FulfillmentTiming.ASAP) {
    await Promise.allSettled(
      created.requests.map((request) =>
        triggerServiceRequestCreated({
          hotelId: prepared.context.tag.hotelId,
          requestId: request.id,
          requestCode: request.requestCode,
          status: ServiceRequestStatus.NEW,
        })
      )
    );
  }

  const inventoryServiceIds = prepared.services
    .filter((service) => service.inventoryTracked)
    .map((service) => service.id);

  if (inventoryServiceIds.length) {
    await triggerInventoryUpdated({
      hotelId: prepared.context.tag.hotelId,
      productIds: inventoryServiceIds,
      source: 'GUEST_PORTAL',
    }).catch((error) =>
      console.warn('Failed to publish service inventory update.', error)
    );
  }

  if (xenditSessionId) {
    await notifyGuestXenditStatus({
      sessionId: xenditSessionId,
    }).catch((error) =>
      console.warn('Failed to create Xendit completion notification.', error)
    );
  }

  return {
    ok: true as const,
    requestCode: created.requestCode,
    requestIds: created.requests.map((request) => request.id),
    count: created.requests.length,
    fixedPriceTotalCents: prepared.fixedPriceTotalCents,
  };
}