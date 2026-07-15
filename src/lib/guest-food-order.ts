import 'server-only';

import type { Prisma } from '@prisma/client';
import {
  FulfillmentTiming,
  GuestXenditFlow,
  GuestXenditStatus,
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
import { triggerInventoryUpdated } from '@/lib/realtime/inventory-events';
import { resolveGuestMemberIdForCurrentNfcSession } from '@/lib/nfc-rewards';
import { resolveGuestOrderIdentity } from '@/lib/guest-order-identity';
import {
  buildScheduledFulfillment,
  parseFulfillmentTiming,
  parseScheduledDate,
} from '@/lib/scheduled-fulfillment';
import { generateSeriesCode } from '@/lib/series-code';
import { createDashboardNotification } from '@/lib/dashboard-notifications';
import { notifyGuestXenditStatus } from '@/lib/xendit-dashboard-notifications';

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
  guestPhone?: string | null;
  notes?: string | null;
  orderType?: 'ROOM_SERVICE' | 'DINE_IN' | 'TAKE_OUT' | 'PICK_UP' | null;
  roomNumber?: string | null;
  roomPasscode?: string | null;
  paymentMethod: PaymentMethod;
  fulfillmentTiming?: string | null;
  scheduledFor?: string | null;
  scheduledNote?: string | null;
  items: GuestFoodOrderItemInput[];
};

export type CreateGuestFoodOrderOptions = {
  paymentStatus?: PaymentStatus;
  guestXenditSessionId?: string | null;
  verifiedGuestStayId?: string | null;
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

  const orderType = input.orderType || 'ROOM_SERVICE';
  const isPublicLocationTag = !tag.roomId;
  const requireRoomAssignment =
    input.paymentMethod === PaymentMethod.ROOM_CHARGE ||
    (isPublicLocationTag && orderType === 'ROOM_SERVICE');

  const resolvedIdentity = await resolveGuestOrderIdentity({
    tagCode,
    guestName: input.guestName,
    guestPhone: input.guestPhone,
    roomNumber: input.roomNumber,
    roomPasscode: input.roomPasscode,
    requireRoomAssignment,
    verifiedGuestStayId: options.verifiedGuestStayId,
  });

  const guestSession = resolvedIdentity.context.session;

  if (guestSession.tagId !== tag.id || guestSession.hotelId !== tag.hotelId) {
    throw new Error('Invalid guest session. Please tap the NFC card again.');
  }

  const resolvedGuestMemberId =
    resolvedIdentity.guestMemberId ??
    (await resolveGuestMemberIdForCurrentNfcSession(tagCode));
  const orderGuestName = resolvedIdentity.guestName;
  const orderGuestPhone = resolvedIdentity.guestPhone;

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
  const xenditSessionId = cleanText(options.guestXenditSessionId) || null;

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

      if (xenditSessionId) {
        const payment = await tx.guestXenditSession.findFirst({
          where: {
            id: xenditSessionId,
            flowType: GuestXenditFlow.FOOD_ORDER,
            hotelId: tag.hotelId,
            tagId: tag.id,
            guestSessionId: guestSession.id,
            status: GuestXenditStatus.PROCESSING,
            orderId: null,
          },
          select: { id: true, amountCents: true },
        });

        if (!payment) {
          throw new Error('Paid Guest Xendit session is no longer claimable.');
        }

        if (payment.amountCents !== total) {
          throw new Error(
            'The current order total no longer matches the Xendit payment.'
          );
        }
      }

      if (resolvedIdentity.guestStayId) {
        const activeStay = await tx.guestStay.findFirst({
          where: {
            id: resolvedIdentity.guestStayId,
            hotelId: tag.hotelId,
            roomId: resolvedIdentity.roomId!,
            status: 'ACTIVE',
            OR: [
              { expectedCheckOutAt: null },
              { expectedCheckOutAt: { gte: new Date() } },
            ],
          },
          select: { id: true },
        });

        if (!activeStay) {
          throw new Error(
            'The guest stay ended before the order could be submitted.'
          );
        }

        const boundSession = await tx.nfcGuestSession.updateMany({
          where: {
            id: guestSession.id,
            hotelId: tag.hotelId,
            tagId: tag.id,
            endedAt: null,
          },
          data: {
            roomId: resolvedIdentity.roomId,
            locationId: resolvedIdentity.locationId,
            guestStayId: resolvedIdentity.guestStayId,
            guestMemberId: resolvedGuestMemberId,
            lastSeenAt: new Date(),
          },
        });

        if (boundSession.count !== 1) {
          throw new Error(
            'The NFC browser session ended before the room could be verified.'
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
          roomId: resolvedIdentity.roomId,
          locationId: resolvedIdentity.locationId,
          tagId: tag.id,
          guestSessionId: guestSession.id,
          guestStayId: resolvedIdentity.guestStayId,
          guestMemberId: resolvedGuestMemberId,
          orderCode,
          guestName: orderGuestName,
          guestPhone: orderGuestPhone,
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
              note: xenditSessionId
                ? 'Xendit payment confirmed; guest order created from NFC portal'
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

      if (xenditSessionId) {
        const completed = await tx.guestXenditSession.updateMany({
          where: {
            id: xenditSessionId,
            status: GuestXenditStatus.PROCESSING,
            orderId: null,
          },
          data: {
            status: GuestXenditStatus.COMPLETED,
            orderId: createdOrder.id,
            orderCode: createdOrder.orderCode,
            completedAt: new Date(),
            errorMessage: null,
          },
        });

        if (completed.count !== 1) {
          throw new Error('The Xendit payment was finalized by another request.');
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

  if (xenditSessionId) {
    await notifyGuestXenditStatus({
      sessionId: xenditSessionId,
    }).catch((error) =>
      console.warn('Failed to create Xendit completion notification.', error)
    );
  }

  return {
    ok: true as const,
    orderId: order.id,
    orderCode: order.orderCode,
  };
}
