'use server';

import { redirect } from 'next/navigation';
import type { Prisma } from '@prisma/client';
import {
  FulfillmentTiming,
  MenuAvailabilityMovementType,
  MenuProductType,
  PaymentMethod,
  ServiceAvailabilityMovementType,
  ServiceRequestAttachmentType,
  ServiceRequestStatus,
  SeriesCodeType,
} from '@prisma/client';
import { db } from '@/lib/db';
import { createGuestOrderSchema } from '@/lib/validators';
import { cleanText } from '@/lib/sanitize';
import { randomCode } from '@/lib/utils';
import { logActivity } from '@/lib/activity';
import { triggerKitchenOrderCreated } from '@/lib/realtime/kitchen-events';
import { getCurrentNfcGuestIdentity } from '@/lib/nfc-guest-session';
import { triggerInventoryUpdated } from '@/lib/realtime/inventory-events';
import { triggerServiceRequestCreated } from '@/lib/realtime/service-request-events';
import { resolveGuestMemberIdForCurrentNfcSession } from '@/lib/nfc-rewards';
import {
  getServiceRequestImageFiles,
  saveServiceRequestImageFiles,
  validateServiceRequestImageFile,
} from '@/lib/service-request-attachments';
import {
  buildScheduledFulfillment,
  parseFulfillmentTiming,
  parseScheduledDate,
} from '@/lib/scheduled-fulfillment';
import { generateSeriesCode } from '@/lib/series-code';
import { createDashboardNotification } from '@/lib/dashboard-notifications';

type StockRequirement = {
  productId: string;
  productName: string;
  quantity: number;
  singleQuantity: number;
  bundleQuantity: number;
};

type ServiceStockRequirement = {
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  quantity: number;
};

class ServiceInventoryError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ServiceInventoryError';
    this.code = code;
  }
}

function addStockRequirement(
  requirements: Map<string, StockRequirement>,
  input: {
    productId: string;
    productName: string;
    quantity: number;
    source: 'SINGLE' | 'BUNDLE';
  }
) {
  const current = requirements.get(input.productId);

  if (current) {
    current.quantity += input.quantity;

    if (input.source === 'SINGLE') {
      current.singleQuantity += input.quantity;
    } else {
      current.bundleQuantity += input.quantity;
    }

    return;
  }

  requirements.set(input.productId, {
    productId: input.productId,
    productName: input.productName,
    quantity: input.quantity,
    singleQuantity: input.source === 'SINGLE' ? input.quantity : 0,
    bundleQuantity: input.source === 'BUNDLE' ? input.quantity : 0,
  });
}

function addServiceStockRequirement(
  requirements: Map<string, ServiceStockRequirement>,
  input: ServiceStockRequirement
) {
  const current = requirements.get(input.serviceId);

  if (current) {
    current.quantity += input.quantity;
    return;
  }

  requirements.set(input.serviceId, input);
}

async function getResolvedGuestPortalIdentity(tagCode: string) {
  const identity = await getCurrentNfcGuestIdentity(tagCode);

  if (!identity.session) {
    return null;
  }

  const resolvedGuestMemberId =
    identity.guestMemberId ??
    (await resolveGuestMemberIdForCurrentNfcSession(tagCode));

  return {
    session: identity.session,
    guestStayId: identity.guestStayId,
    guestMemberId: resolvedGuestMemberId,
    guestName: identity.guestName ? cleanText(identity.guestName, 100) : '',
  };
}

function getGuestNameSnapshot({
  stayGuestName,
  submittedGuestName,
}: {
  stayGuestName?: string | null;
  submittedGuestName?: string | null;
}) {
  const submittedName = cleanText(submittedGuestName || '', 100);

  if (submittedName) {
    return submittedName;
  }

  return cleanText(stayGuestName || '', 100);
}

export async function createGuestOrder(input: unknown) {
  const parsed = createGuestOrderSchema.parse(input);

  const tag = await db.nfcTag.findUnique({
    where: {
      code: parsed.tagCode,
    },
    select: {
      id: true,
      hotelId: true,
      roomId: true,
      locationId: true,
      status: true,
      hotel: {
        select: {
          name: true,
          settings: true,
        },
      },
    }
  });

  if (!tag || tag.status !== 'ACTIVE') {
    throw new Error('This NFC tag is inactive or invalid.');
  }

  const guestIdentity = await getResolvedGuestPortalIdentity(parsed.tagCode);

  if (!guestIdentity?.session) {
    throw new Error('Guest session expired. Please tap the NFC card again.');
  }

  const guestSession = guestIdentity.session;

  if (guestSession.tagId !== tag.id || guestSession.hotelId !== tag.hotelId) {
    throw new Error('Invalid guest session. Please tap the NFC card again.');
  }

  const orderGuestName = getGuestNameSnapshot({
    stayGuestName: guestIdentity.guestName,
    submittedGuestName: parsed.guestName,
  });

  const uniqueProductIds = Array.from(
    new Set(parsed.items.map((item) => item.productId))
  );

  const products = await db.menuProduct.findMany({
    where: {
      id: {
        in: uniqueProductIds,
      },
      hotelId: tag.hotelId,
      isAvailable: true,
    },
    include: {
      bundleComponents: {
        include: {
          componentProduct: {
            select: {
              id: true,
              name: true,
              isAvailable: true,
              productType: true,
            },
          },
        },
        orderBy: {
          sortOrder: 'asc',
        },
      },
    },
  });

  const productMap = new Map(products.map((product) => [product.id, product]));

  if (products.length !== uniqueProductIds.length) {
    throw new Error('One or more products are no longer available.');
  }

  for (const product of products) {
    if (product.productType !== MenuProductType.BUNDLE) {
      continue;
    }

    if (!product.bundleComponents.length) {
      throw new Error(
        `${product.name} is a bundle but has no component items yet.`
      );
    }

    for (const component of product.bundleComponents) {
      if (!component.componentProduct.isAvailable) {
        throw new Error(
          `${product.name} cannot be ordered because ${component.componentProduct.name} is unavailable.`
        );
      }

      if (component.componentProduct.productType === MenuProductType.BUNDLE) {
        throw new Error(
          `${product.name} contains another bundle. Nested bundles are not supported yet.`
        );
      }

      if (!Number.isInteger(component.quantity) || component.quantity <= 0) {
        throw new Error(
          `${product.name} has an invalid component quantity for ${component.componentProduct.name}.`
        );
      }
    }
  }

  const stockRequirements = new Map<string, StockRequirement>();

  for (const item of parsed.items) {
    const product = productMap.get(item.productId);

    if (!product) {
      throw new Error('Product not found.');
    }

    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new Error(`Invalid quantity for ${product.name}.`);
    }

    if (product.productType === MenuProductType.BUNDLE) {
      for (const component of product.bundleComponents) {
        addStockRequirement(stockRequirements, {
          productId: component.componentProductId,
          productName: component.componentProduct.name,
          quantity: component.quantity * item.quantity,
          source: 'BUNDLE',
        });
      }
    } else {
      addStockRequirement(stockRequirements, {
        productId: product.id,
        productName: product.name,
        quantity: item.quantity,
        source: 'SINGLE',
      });
    }
  }

  const subtotal = parsed.items.reduce((sum, item) => {
    const product = productMap.get(item.productId)!;
    return sum + product.priceCents * item.quantity;
  }, 0);

  const settings = tag.hotel.settings;

  const serviceCharge = Math.round(
    subtotal * Number(settings?.serviceChargeRate ?? 0)
  );

  const tax = Math.round(subtotal * Number(settings?.taxRate ?? 0));
  const total = subtotal + serviceCharge + tax;

  const schedule = buildScheduledFulfillment({
    fulfillmentTiming: parseFulfillmentTiming(parsed.fulfillmentTiming),
    scheduledFor: parseScheduledDate(parsed.scheduledFor),
    scheduledNote: parsed.scheduledNote,
    releaseBufferMinutes: 20,
  });

  const order = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const stockByProductId = new Map<
      string,
      {
        id: string;
        availableQty: number;
        isSoldOut: boolean;
      }
    >();

    for (const requirement of stockRequirements.values()) {
      const stock = await tx.menuAvailabilityStock.findUnique({
        where: {
          hotelId_productId: {
            hotelId: tag.hotelId,
            productId: requirement.productId,
          },
        },
        select: {
          id: true,
          availableQty: true,
          isSoldOut: true,
        },
      });

      if (!stock) {
        throw new Error(
          `${requirement.productName} has no inventory stock record yet.`
        );
      }

      if (stock.isSoldOut || stock.availableQty <= 0) {
        throw new Error(`${requirement.productName} is sold out.`);
      }

      if (requirement.quantity > stock.availableQty) {
        throw new Error(
          `${requirement.productName} only has ${stock.availableQty} available.`
        );
      }

      stockByProductId.set(requirement.productId, stock);
    }

    const orderCode = await generateSeriesCode(tx, {
      hotelName: tag.hotel.name,
      type: SeriesCodeType.FOOD,
    });

    const createdOrder = await tx.order.create({
      data: {
        hotelId: tag.hotelId,
        roomId: tag.roomId,
        locationId: tag.locationId,
        tagId: tag.id,
        guestSessionId: guestSession.id,
        guestStayId: guestIdentity.guestStayId,
        guestMemberId: guestIdentity.guestMemberId,
        orderCode,
        guestName: orderGuestName,
        notes: cleanText(parsed.notes, 1000),
        paymentMethod: parsed.paymentMethod as PaymentMethod,

        fulfillmentTiming: schedule.fulfillmentTiming,
        scheduledFor: schedule.scheduledFor,
        scheduledWindowStart: schedule.scheduledWindowStart,
        scheduledWindowEnd: schedule.scheduledWindowEnd,
        releaseAt: schedule.releaseAt,
        releasedAt: schedule.releasedAt,
        scheduledReleaseStatus: schedule.scheduledReleaseStatus,
        scheduledNote: schedule.scheduledNote,

        subtotalCents: subtotal,
        serviceChargeCents: serviceCharge,
        taxCents: tax,
        totalCents: total,
        statusHistory: {
          create: {
            status: 'PENDING',
            note: 'Guest submitted order from NFC portal',
          },
        },
      },
      select: {
        id: true,
        orderCode: true,
        status: true,
      },
    });

    for (const item of parsed.items) {
      const product = productMap.get(item.productId)!;
      const isBundle = product.productType === MenuProductType.BUNDLE;

      await tx.orderItem.create({
        data: {
          orderId: createdOrder.id,
          productId: product.id,
          productNameSnapshot: product.name,
          quantity: item.quantity,
          unitPriceCents: product.priceCents,
          notes: cleanText(item.notes, 300),
          isBundleSnapshot: isBundle,
          bundleComponents: isBundle
            ? {
                create: product.bundleComponents.map((component) => ({
                  bundleProductId: product.id,
                  componentProductId: component.componentProductId,
                  componentNameSnapshot: component.componentProduct.name,
                  quantity: component.quantity * item.quantity,
                })),
              }
            : undefined,
        },
      });
    }

    for (const requirement of stockRequirements.values()) {
      const stock = stockByProductId.get(requirement.productId);

      if (!stock) {
        throw new Error(
          `${requirement.productName} inventory stock was not found.`
        );
      }

      const updateResult = await tx.menuAvailabilityStock.updateMany({
        where: {
          id: stock.id,
          isSoldOut: false,
          availableQty: {
            gte: requirement.quantity,
          },
        },
        data: {
          availableQty: {
            decrement: requirement.quantity,
          },
          soldQty: {
            increment: requirement.quantity,
          },
        },
      });

      if (updateResult.count !== 1) {
        throw new Error(
          `${requirement.productName} stock changed while ordering. Please try again.`
        );
      }

      const updatedStock = await tx.menuAvailabilityStock.findUnique({
        where: {
          id: stock.id,
        },
        select: {
          availableQty: true,
        },
      });

      if (!updatedStock) {
        throw new Error(
          `${requirement.productName} inventory stock was not found.`
        );
      }

      if (updatedStock.availableQty <= 0) {
        await tx.menuAvailabilityStock.update({
          where: {
            id: stock.id,
          },
          data: {
            isSoldOut: true,
          },
        });
      }

      if (requirement.singleQuantity > 0) {
        await tx.menuAvailabilityMovement.create({
          data: {
            hotelId: tag.hotelId,
            productId: requirement.productId,
            stockId: stock.id,
            type: MenuAvailabilityMovementType.ORDER_DEDUCTION,
            quantity: requirement.singleQuantity,
            balanceAfter: Math.max(updatedStock.availableQty, 0),
            reason: `Guest portal order ${createdOrder.orderCode}`,
            userId: null,
          },
        });
      }

      if (requirement.bundleQuantity > 0) {
        await tx.menuAvailabilityMovement.create({
          data: {
            hotelId: tag.hotelId,
            productId: requirement.productId,
            stockId: stock.id,
            type: MenuAvailabilityMovementType.BUNDLE_ORDER_DEDUCTION,
            quantity: requirement.bundleQuantity,
            balanceAfter: Math.max(updatedStock.availableQty, 0),
            reason: `Guest portal bundle order ${createdOrder.orderCode}`,
            userId: null,
          },
        });
      }
    }

    return createdOrder;
  });

  // Execute non-critical side effects in try/catch to prevent ghost orders throwing 500s
  try {
    await logActivity({
      hotelId: tag.hotelId,
      actor: orderGuestName || 'Guest',
      action: 'CREATE',
      entity: 'Order',
      entityId: order.id,
      message: `New guest order ${order.orderCode}`,
    });
  } catch (error) {
    console.error('Failed to log order activity', error);
  }

  await Promise.allSettled([
    createDashboardNotification({
      hotelId: tag.hotelId,
      type: 'ORDER_CREATED',
      title:
        schedule.fulfillmentTiming === FulfillmentTiming.SCHEDULED
          ? 'New Scheduled Food Order'
          : 'New Food Order',
      message:
        schedule.fulfillmentTiming === FulfillmentTiming.SCHEDULED
          ? `${order.orderCode} was scheduled by a guest and is waiting for release.`
          : `${order.orderCode} is waiting for kitchen review.`,
      url:
        schedule.fulfillmentTiming === FulfillmentTiming.SCHEDULED
          ? '/dashboard/kitchen?view=scheduled'
          : '/dashboard/orders',
      payload: {
        orderId: order.id,
        orderCode: order.orderCode,
        fulfillmentTiming: schedule.fulfillmentTiming,
        source: 'GUEST_PORTAL',
      },
    }),
  ]);

  if (schedule.fulfillmentTiming === FulfillmentTiming.ASAP) {
    try {
      await triggerKitchenOrderCreated({
        hotelId: tag.hotelId,
        orderCode: order.orderCode,
        status: order.status,
        source: 'GUEST_PORTAL',
      });
    } catch (error) {
      console.error('Failed to trigger kitchen pusher event', error);
    }
  }

  try {
    await triggerInventoryUpdated({
      hotelId: tag.hotelId,
      productIds: Array.from(stockRequirements.keys()),
      source: 'GUEST_PORTAL',
    });
  } catch (error) {
    console.error('Failed to trigger inventory pusher event', error);
  }

  return {
    ok: true,
    orderCode: order.orderCode,
  };
}

function parseQuantity(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') return null;
  const quantity = Number(value);

  if (!Number.isInteger(quantity) || quantity < 1) {
    return null;
  }

  return Math.min(quantity, 20);
}

function redirectToService(
  tagCode: string,
  params: {
    error?: string;
    success?: string;
    count?: number;
  }
): never {
  const query = new URLSearchParams();

  if (params.error) {
    query.set('error', params.error);
  }

  if (params.success) {
    query.set('success', params.success);
  }

  if (params.count) {
    query.set('count', String(params.count));
  }

  redirect(`/t/${tagCode}/service?${query.toString()}`);
}

export async function createServiceRequestAction(formData: FormData) {
  const tagCode = typeof formData.get('tagCode') === 'string' ? cleanText(formData.get('tagCode') as string, 160) || '' : '';
  const guestName = typeof formData.get('guestName') === 'string' ? cleanText(formData.get('guestName') as string, 100) : '';
  const notes = typeof formData.get('notes') === 'string' ? cleanText(formData.get('notes') as string, 1000) : '';
  const chargeConsent = formData.get('chargeConsent') === 'true';

  let schedule;

  try {
    schedule = buildScheduledFulfillment({
      fulfillmentTiming: parseFulfillmentTiming(formData.get('fulfillmentTiming') as string),
      scheduledFor: parseScheduledDate(formData.get('scheduledFor') as string),
      scheduledNote: typeof formData.get('scheduledNote') === 'string' ? cleanText(formData.get('scheduledNote') as string, 300) : '',
      releaseBufferMinutes: 15,
    });
  } catch {
    redirectToService(tagCode, {
      error: 'invalid_schedule',
    });
  }

  const serviceCodes = Array.from(
    new Set(
      formData
        .getAll('serviceCodes')
        .map((value) => typeof value === 'string' ? cleanText(value, 80) : '')
        .filter(Boolean)
    )
  ) as string[];

  const attachmentFiles = getServiceRequestImageFiles(formData, 'attachments');

  try {
    for (const file of attachmentFiles) {
      validateServiceRequestImageFile(file);
    }
  } catch {
    redirectToService(tagCode, {
      error: 'invalid_attachment',
    });
  }

  if (!tagCode) {
    redirect('/t');
  }

  if (!serviceCodes.length) {
    redirectToService(tagCode, {
      error: 'invalid_service',
    });
  }

  const tag = await db.nfcTag.findUnique({
    where: {
      code: tagCode,
    },
    select: {
      id: true,
      hotelId: true,
      roomId: true,
      locationId: true,
      status: true,
      hotel: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!tag) {
    // BUG FIX: Prevent routing loop/immediate 404 for entirely invalid tags
    redirect('/nfc-access-denied?reason=invalid-nfc-access');
  }

  if (tag.status !== 'ACTIVE') {
    redirectToService(tagCode, {
      error: 'inactive_tag',
    });
  }

  let guestIdentity: Awaited<
    ReturnType<typeof getResolvedGuestPortalIdentity>
  > | null = null;

  try {
    guestIdentity = await getResolvedGuestPortalIdentity(tagCode);
  } catch {
    redirectToService(tagCode, {
      error: 'invalid_session',
    });
  }

  if (!guestIdentity?.session) {
    redirectToService(tagCode, {
      error: 'invalid_session',
    });
  }

  const guestSession = guestIdentity.session;

  if (guestSession.tagId !== tag.id || guestSession.hotelId !== tag.hotelId) {
    redirectToService(tagCode, {
      error: 'invalid_session',
    });
  }

  const serviceGuestName = getGuestNameSnapshot({
    stayGuestName: guestIdentity.guestName,
    submittedGuestName: guestName,
  });

  const services = await db.serviceCatalogItem.findMany({
    where: {
      hotelId: tag.hotelId,
      code: {
        in: serviceCodes,
      },
      isActive: true,
    },
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      billingMode: true,
      unitPrice: true,
      inventoryTracked: true,
    },
  });

  if (services.length !== serviceCodes.length) {
    redirectToService(tagCode, {
      error: 'invalid_service',
    });
  }

  const serviceMap = new Map(services.map((service) => [service.code, service]));

  const validSelectedServices = serviceCodes.map((serviceCode) => {
    const service = serviceMap.get(serviceCode);
    const quantity = parseQuantity(formData.get(`quantity_${serviceCode}`));

    if (!service || !quantity) {
      return null;
    }

    return {
      service,
      quantity,
    };
  });

  if (validSelectedServices.some((item) => !item)) {
    redirectToService(tagCode, {
      error: 'quantity_required',
    });
  }

  const selectedServices = validSelectedServices as {
    service: (typeof services)[number];
    quantity: number;
  }[];

  const serviceStockRequirements = new Map<string, ServiceStockRequirement>();

  for (const item of selectedServices) {
    if (!item.service.inventoryTracked) {
      continue;
    }

    addServiceStockRequirement(serviceStockRequirements, {
      serviceId: item.service.id,
      serviceCode: item.service.code,
      serviceName: item.service.name,
      quantity: item.quantity,
    });
  }

  const fixedPriceServices = selectedServices.filter(
    (item) => item.service.billingMode === 'FIXED_PRICE'
  );

  const confirmationServices = selectedServices.filter(
    (item) => item.service.billingMode === 'PRICE_ON_CONFIRMATION'
  );

  const shouldCreateCharges = fixedPriceServices.length > 0;

  if (shouldCreateCharges && !tag.roomId) {
    redirectToService(tagCode, {
      error: 'room_required',
    });
  }

  if (shouldCreateCharges && !chargeConsent) {
    redirectToService(tagCode, {
      error: 'consent_required',
    });
  }

  /**
   * Critical grouped-request update:
   * Every service item selected in this one guest submission shares the same
   * requestCode, so dashboard Service Requests can display them under one
   * Service Request Order ID.
   */
  let groupedRequestCode = '';

  let createdRequests: {
    id: string;
    requestCode: string;
  }[] = [];

  try {
    createdRequests = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const serviceStockByServiceId = new Map<
        string,
        {
          id: string;
          availableQty: number;
          isSoldOut: boolean;
        }
      >();

      for (const requirement of serviceStockRequirements.values()) {
        const stock = await tx.serviceAvailabilityStock.findUnique({
          where: {
            hotelId_serviceId: {
              hotelId: tag.hotelId,
              serviceId: requirement.serviceId,
            },
          },
          select: {
            id: true,
            availableQty: true,
            isSoldOut: true,
          },
        });

        if (!stock) {
          throw new ServiceInventoryError(
            'service_stock_unavailable',
            `${requirement.serviceName} has no service inventory stock record yet.`
          );
        }

        if (stock.isSoldOut || stock.availableQty <= 0) {
          throw new ServiceInventoryError(
            'service_stock_unavailable',
            `${requirement.serviceName} is currently unavailable.`
          );
        }

        if (requirement.quantity > stock.availableQty) {
          throw new ServiceInventoryError(
            'service_stock_unavailable',
            `${requirement.serviceName} only has ${stock.availableQty} available.`
          );
        }

        serviceStockByServiceId.set(requirement.serviceId, stock);
      }

      groupedRequestCode = await generateSeriesCode(tx, {
        hotelName: tag.hotel.name,
        type: SeriesCodeType.SERVICE,
      });

      const requests: {
        id: string;
        requestCode: string;
      }[] = [];

      for (const item of selectedServices) {
        const request = await tx.serviceRequest.create({
          data: {
            hotelId: tag.hotelId,
            roomId: tag.roomId,
            locationId: tag.locationId,
            tagId: tag.id,
            guestSessionId: guestSession.id,
            guestStayId: guestIdentity!.guestStayId,
            guestMemberId: guestIdentity!.guestMemberId,
            requestCode: groupedRequestCode,
            type: item.service.name,
            guestName: serviceGuestName || null,

            fulfillmentTiming: schedule.fulfillmentTiming,
            scheduledFor: schedule.scheduledFor,
            scheduledWindowStart: schedule.scheduledWindowStart,
            scheduledWindowEnd: schedule.scheduledWindowEnd,
            releaseAt: schedule.releaseAt,
            releasedAt: schedule.releasedAt,
            scheduledReleaseStatus: schedule.scheduledReleaseStatus,
            scheduledNote: schedule.scheduledNote,
            notes:
              [
                `Grouped service request order ${groupedRequestCode}.`,
                notes || null,
                item.service.inventoryTracked
                  ? `Inventory-tracked service. Quantity: ${item.quantity}.`
                  : null,
                item.service.billingMode === 'FIXED_PRICE'
                  ? `Room add-on selected by guest. Quantity: ${item.quantity}.`
                  : null,
                item.service.billingMode === 'PRICE_ON_CONFIRMATION'
                  ? 'Price requires staff confirmation before billing.'
                  : null,
              ]
                .filter(Boolean)
                .join('\n') || null,
            statusHistory: {
              create: {
                status: 'NEW',
                note: `Guest submitted grouped service request order ${groupedRequestCode} from NFC portal`,
              },
            },
          },
          select: {
            id: true,
            requestCode: true,
          },
        });

        if (item.service.inventoryTracked) {
          const stock = serviceStockByServiceId.get(item.service.id);

          if (!stock) {
            throw new ServiceInventoryError(
              'service_stock_unavailable',
              `${item.service.name} inventory stock was not found.`
            );
          }

          const updateResult = await tx.serviceAvailabilityStock.updateMany({
            where: {
              id: stock.id,
              isSoldOut: false,
              availableQty: {
                gte: item.quantity,
              },
            },
            data: {
              availableQty: {
                decrement: item.quantity,
              },
              usedQty: {
                increment: item.quantity,
              },
            },
          });

          if (updateResult.count !== 1) {
            throw new ServiceInventoryError(
              'service_stock_unavailable',
              `${item.service.name} stock changed while submitting. Please try again.`
            );
          }

          const updatedStock = await tx.serviceAvailabilityStock.findUnique({
            where: {
              id: stock.id,
            },
            select: {
              availableQty: true,
            },
          });

          if (!updatedStock) {
            throw new ServiceInventoryError(
              'service_stock_unavailable',
              `${item.service.name} inventory stock was not found.`
            );
          }

          if (updatedStock.availableQty <= 0) {
            await tx.serviceAvailabilityStock.update({
              where: {
                id: stock.id,
              },
              data: {
                isSoldOut: true,
              },
            });
          }

          await tx.serviceAvailabilityMovement.create({
            data: {
              hotelId: tag.hotelId,
              serviceId: item.service.id,
              stockId: stock.id,
              type: ServiceAvailabilityMovementType.REQUEST_DEDUCTION,
              quantity: item.quantity,
              balanceAfter: Math.max(updatedStock.availableQty, 0),
              reason: `Guest grouped service request ${groupedRequestCode}`,
              userId: null,
              serviceRequestId: request.id,
            },
          });
        }

        if (item.service.billingMode === 'FIXED_PRICE') {
          const unitPrice = Number(item.service.unitPrice);
          const totalAmount = unitPrice * item.quantity;

          await tx.roomAddOnCharge.create({
            data: {
              chargeCode: randomCode('ADD'),
              hotelId: tag.hotelId,
              roomId: tag.roomId!,
              serviceRequestId: request.id,
              itemName: item.service.name,
              description: notes || item.service.description || null,
              quantity: item.quantity,
              unitPrice: unitPrice.toFixed(2),
              totalAmount: totalAmount.toFixed(2),
              postedById: null,
            },
          });
        }

        requests.push(request);
      }

      return requests;
    });
  } catch (error) {
    if (error instanceof ServiceInventoryError) {
      redirectToService(tagCode, {
        error: error.code,
      });
    }

    redirectToService(tagCode, {
      error: 'request_failed',
    });
  }

  // Wrapp non-critical side effects in try/catch to prevent ghost orders throwing 500
  if (attachmentFiles.length > 0 && createdRequests.length > 0) {
    try {
      await saveServiceRequestImageFiles({
        hotelId: tag.hotelId,
        requestId: createdRequests[0].id,
        requestCode: groupedRequestCode,
        files: attachmentFiles,
        attachmentType: ServiceRequestAttachmentType.GUEST_UPLOAD,
        uploadedByGuest: true,
        caption: notes || null,
      });
    } catch (error) {
      console.error('Failed to save service request attachments', error);
    }
  }

  await Promise.allSettled(
    createdRequests.map((request) =>
      logActivity({
        hotelId: tag.hotelId,
        actor: serviceGuestName || 'Guest',
        action: 'CREATE',
        entity: 'ServiceRequest',
        entityId: request.id,
        message: `New grouped service request ${request.requestCode}`,
      })
    )
  );

  await Promise.allSettled([
    createDashboardNotification({
      hotelId: tag.hotelId,
      type: 'SERVICE_REQUEST_CREATED',
      title:
        schedule.fulfillmentTiming === FulfillmentTiming.SCHEDULED
          ? 'New Scheduled Service Request'
          : 'New Service Request',
      message:
        schedule.fulfillmentTiming === FulfillmentTiming.SCHEDULED
          ? `${groupedRequestCode} was scheduled by a guest and is waiting for release.`
          : `${groupedRequestCode} needs staff attention.`,
      url: '/dashboard/service-requests',
      payload: {
        requestCode: groupedRequestCode,
        requestIds: createdRequests.map((request) => request.id),
        count: createdRequests.length,
        fulfillmentTiming: schedule.fulfillmentTiming,
        source: 'GUEST_PORTAL',
      },
    }),
  ]);

  if (schedule.fulfillmentTiming === FulfillmentTiming.ASAP) {
    await Promise.allSettled(
      createdRequests.map((request) =>
        triggerServiceRequestCreated({
          hotelId: tag.hotelId,
          requestId: request.id,
          requestCode: request.requestCode,
          status: ServiceRequestStatus.NEW,
        })
      )
    );
  }

  if (serviceStockRequirements.size > 0) {
    try {
      await triggerInventoryUpdated({
        hotelId: tag.hotelId,
        productIds: Array.from(serviceStockRequirements.keys()),
        source: 'GUEST_PORTAL',
      });
    } catch (error) {
      console.error('Failed to trigger inventory event', error);
    }
  }

  const success =
    fixedPriceServices.length > 0 && confirmationServices.length > 0
      ? 'mixed'
      : fixedPriceServices.length > 0
        ? 'charged'
        : confirmationServices.length > 0
          ? 'confirmation'
          : 'request';

  redirectToService(tagCode, {
    success,
    count: createdRequests.length,
  });
}