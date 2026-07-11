import 'server-only';

import type { Prisma } from '@prisma/client';
import {
  FulfillmentTiming,
  GuestPayMongoFlow,
  GuestPayMongoStatus,
  MenuAvailabilityMovementType,
  MenuProductType,
  PaymentMethod,
  PaymentStatus,
  SeriesCodeType,
} from '@prisma/client';
import { db } from '@/lib/db';
import { cleanText } from '@/lib/sanitize';
import { logActivity } from '@/lib/activity';
import { triggerKitchenOrderCreated } from '@/lib/realtime/kitchen-events';
import { getCurrentNfcGuestIdentity } from '@/lib/nfc-guest-session';
import { triggerInventoryUpdated } from '@/lib/realtime/inventory-events';
import { resolveGuestMemberIdForCurrentNfcSession } from '@/lib/nfc-rewards';
import {
  buildScheduledFulfillment,
  parseFulfillmentTiming,
  parseScheduledDate,
} from '@/lib/scheduled-fulfillment';
import { generateSeriesCode } from '@/lib/series-code';
import { createDashboardNotification } from '@/lib/dashboard-notifications';
import { notifyGuestPayMongoStatus } from '@/lib/paymongo-dashboard-notifications';

type StockRequirement = {
  productId: string;
  productName: string;
  quantity: number;
  singleQuantity: number;
  bundleQuantity: number;
};

export type GuestFoodOrderItemInput = {
  productId: string;
  quantity: number;
  notes?: string | null;
};

export type GuestFoodOrderInput = {
  tagCode: string;
  guestName?: string | null;
  notes?: string | null;
  paymentMethod: PaymentMethod;
  fulfillmentTiming?: string | null;
  scheduledFor?: string | null;
  scheduledNote?: string | null;
  items: GuestFoodOrderItemInput[];
};

export type CreateGuestFoodOrderOptions = {
  paymentStatus?: PaymentStatus;
  guestPayMongoSessionId?: string | null;
};

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

function getGuestNameSnapshot(input: {
  stayGuestName?: string | null;
  submittedGuestName?: string | null;
}) {
  const submittedName = cleanText(input.submittedGuestName || '', 100);

  if (submittedName) {
    return submittedName;
  }

  return cleanText(input.stayGuestName || '', 100);
}

function normalizeOrderItems(items: GuestFoodOrderItemInput[]) {
  const quantities = new Map<string, { quantity: number; notes: string }>();

  for (const rawItem of items ?? []) {
    const productId = cleanText(rawItem.productId);
    const quantity = Number(rawItem.quantity);

    if (!productId || !Number.isInteger(quantity) || quantity <= 0) {
      throw new Error('The food cart contains an invalid item or quantity.');
    }

    const current = quantities.get(productId);
    quantities.set(productId, {
      quantity: (current?.quantity ?? 0) + quantity,
      notes: cleanText(rawItem.notes || current?.notes || '', 300) || '',
    });
  }

  const normalized = Array.from(quantities.entries()).map(
    ([productId, value]) => ({
      productId,
      quantity: value.quantity,
      notes: value.notes,
    })
  );

  if (!normalized.length) {
    throw new Error('Please add at least one food item.');
  }

  return normalized;
}

export async function createGuestFoodOrder(
  input: GuestFoodOrderInput,
  options: CreateGuestFoodOrderOptions = {}
) {
  const tagCode = cleanText(input.tagCode, 160);
  const items = normalizeOrderItems(input.items);

  if (!tagCode) {
    throw new Error('NFC tag code is required.');
  }

  if (!Object.values(PaymentMethod).includes(input.paymentMethod)) {
    throw new Error('Invalid payment method.');
  }

  const tag = await db.nfcTag.findUnique({
    where: { code: tagCode },
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
    },
  });

  if (!tag || tag.status !== 'ACTIVE') {
    throw new Error('This NFC tag is inactive or invalid.');
  }

  const guestIdentity = await getResolvedGuestPortalIdentity(tagCode);

  if (!guestIdentity?.session) {
    throw new Error('Guest session expired. Please tap the NFC card again.');
  }

  const guestSession = guestIdentity.session;

  if (guestSession.tagId !== tag.id || guestSession.hotelId !== tag.hotelId) {
    throw new Error('Invalid guest session. Please tap the NFC card again.');
  }

  const orderGuestName = getGuestNameSnapshot({
    stayGuestName: guestIdentity.guestName,
    submittedGuestName: input.guestName,
  });

  const uniqueProductIds = items.map((item) => item.productId);

  const products = await db.menuProduct.findMany({
    where: {
      id: { in: uniqueProductIds },
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
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  const productMap = new Map(products.map((product) => [product.id, product]));

  if (products.length !== uniqueProductIds.length) {
    throw new Error('One or more products are no longer available.');
  }

  for (const product of products) {
    if (product.productType !== MenuProductType.BUNDLE) continue;

    if (!product.bundleComponents.length) {
      throw new Error(`${product.name} has no bundle components.`);
    }

    for (const component of product.bundleComponents) {
      if (!component.componentProduct.isAvailable) {
        throw new Error(
          `${product.name} cannot be ordered because ${component.componentProduct.name} is unavailable.`
        );
      }

      if (component.componentProduct.productType === MenuProductType.BUNDLE) {
        throw new Error('Nested menu bundles are not supported.');
      }

      if (!Number.isInteger(component.quantity) || component.quantity <= 0) {
        throw new Error(`${product.name} has an invalid component quantity.`);
      }
    }
  }

  const stockRequirements = new Map<string, StockRequirement>();

  for (const item of items) {
    const product = productMap.get(item.productId)!;

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

  const subtotal = items.reduce((sum, item) => {
    return sum + productMap.get(item.productId)!.priceCents * item.quantity;
  }, 0);

  const settings = tag.hotel.settings;
  const serviceCharge = Math.round(
    subtotal * Number(settings?.serviceChargeRate ?? 0)
  );
  const tax = Math.round(subtotal * Number(settings?.taxRate ?? 0));
  const total = subtotal + serviceCharge + tax;

  const schedule = buildScheduledFulfillment({
    fulfillmentTiming: parseFulfillmentTiming(input.fulfillmentTiming || ''),
    scheduledFor: parseScheduledDate(input.scheduledFor || ''),
    scheduledNote: input.scheduledNote || '',
    releaseBufferMinutes: 20,
  });

  const paymentStatus = options.paymentStatus ?? PaymentStatus.UNPAID;
  const payMongoSessionId = cleanText(options.guestPayMongoSessionId) || null;

  const order = await db.$transaction(
    async (tx: Prisma.TransactionClient) => {
      const stockByProductId = new Map<
        string,
        { id: string; availableQty: number; isSoldOut: boolean }
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

        if (stock.isSoldOut || stock.availableQty < requirement.quantity) {
          throw new Error(
            `${requirement.productName} no longer has enough stock.`
          );
        }

        stockByProductId.set(requirement.productId, stock);
      }

      if (payMongoSessionId) {
        const payment = await tx.guestPayMongoSession.findFirst({
          where: {
            id: payMongoSessionId,
            flowType: GuestPayMongoFlow.FOOD_ORDER,
            hotelId: tag.hotelId,
            tagId: tag.id,
            guestSessionId: guestSession.id,
            status: GuestPayMongoStatus.PROCESSING,
            orderId: null,
          },
          select: { id: true, amountCents: true },
        });

        if (!payment) {
          throw new Error('Paid Guest PayMongo session is no longer claimable.');
        }

        if (payment.amountCents !== total) {
          throw new Error(
            'The current order total no longer matches the PayMongo payment.'
          );
        }
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
          notes: cleanText(input.notes || '', 1000),
          paymentMethod: input.paymentMethod,
          paymentStatus,
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
              note: payMongoSessionId
                ? 'PayMongo payment confirmed; guest order created from NFC portal'
                : 'Guest submitted order from NFC portal',
            },
          },
        },
        select: {
          id: true,
          orderCode: true,
          status: true,
        },
      });

      for (const item of items) {
        const product = productMap.get(item.productId)!;
        const isBundle = product.productType === MenuProductType.BUNDLE;

        await tx.orderItem.create({
          data: {
            orderId: createdOrder.id,
            productId: product.id,
            productNameSnapshot: product.name,
            quantity: item.quantity,
            unitPriceCents: product.priceCents,
            notes: cleanText(item.notes || '', 300),
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
        const stock = stockByProductId.get(requirement.productId)!;

        const updated = await tx.menuAvailabilityStock.updateMany({
          where: {
            id: stock.id,
            isSoldOut: false,
            availableQty: { gte: requirement.quantity },
          },
          data: {
            availableQty: { decrement: requirement.quantity },
            soldQty: { increment: requirement.quantity },
          },
        });

        if (updated.count !== 1) {
          throw new Error(
            `${requirement.productName} stock changed while finalizing the order.`
          );
        }

        const updatedStock = await tx.menuAvailabilityStock.findUnique({
          where: { id: stock.id },
          select: { availableQty: true },
        });

        if (!updatedStock) {
          throw new Error(`${requirement.productName} stock was not found.`);
        }

        if (updatedStock.availableQty <= 0) {
          await tx.menuAvailabilityStock.update({
            where: { id: stock.id },
            data: { isSoldOut: true },
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

      if (payMongoSessionId) {
        const completed = await tx.guestPayMongoSession.updateMany({
          where: {
            id: payMongoSessionId,
            status: GuestPayMongoStatus.PROCESSING,
            orderId: null,
          },
          data: {
            status: GuestPayMongoStatus.COMPLETED,
            orderId: createdOrder.id,
            orderCode: createdOrder.orderCode,
            completedAt: new Date(),
            errorMessage: null,
          },
        });

        if (completed.count !== 1) {
          throw new Error('The PayMongo payment was finalized by another request.');
        }
      }

      return createdOrder;
    },
    {
      maxWait: 10_000,
      timeout: 30_000,
    }
  );

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
      console.error('Failed to trigger kitchen realtime event', error);
    }
  }

  try {
    await triggerInventoryUpdated({
      hotelId: tag.hotelId,
      productIds: Array.from(stockRequirements.keys()),
      source: 'GUEST_PORTAL',
    });
  } catch (error) {
    console.error('Failed to trigger inventory realtime event', error);
  }

  if (payMongoSessionId) {
    await notifyGuestPayMongoStatus({
      sessionId: payMongoSessionId,
    }).catch((error) =>
      console.warn('Failed to create PayMongo completion notification.', error)
    );
  }

  return {
    ok: true as const,
    orderId: order.id,
    orderCode: order.orderCode,
  };
}
