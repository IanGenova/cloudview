'use server';
import type { Prisma } from '@prisma/client';
import {
  MenuAvailabilityMovementType,
  MenuProductType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  RoomAddOnPaymentStatus,
  ServiceAvailabilityMovementType,
  ServiceBillingMode,
  ServiceRequestStatus,
  SeriesCodeType,
  Role,
} from '@prisma/client';
import { generateSeriesCode } from '@/lib/series-code';
import { revalidatePath } from 'next/cache';
import { requireRole, requireUser } from '@/lib/auth';
import { assertHotelScope } from '@/lib/access';
import { db } from '@/lib/db';
import { cleanText } from '@/lib/sanitize';
import { randomCode } from '@/lib/utils';
import { logActivity } from '@/lib/activity';
import { triggerKitchenOrderCreated } from '@/lib/realtime/kitchen-events';
import { triggerInventoryUpdated } from '@/lib/realtime/inventory-events';
import { triggerServiceRequestCreated } from '@/lib/realtime/service-request-events';
import { assertXenditWebhookRecoveryToken } from '@/lib/xendit-webhook-recovery-token';


type POSOrderInput = {
  hotelId: string;
  roomId?: string | null;
  guestName?: string;
  notes?: string;
  paymentMethod: 'CASH' | 'POS' | 'ROOM_CHARGE' | 'PAY_AT_COUNTER';
  items?: {
    productId: string;
    quantity: number;
  }[];
  services?: {
    serviceId: string;
    quantity: number;
  }[];
};

type StockRequirement = {
  productId: string;
  productName: string;
  quantity: number;
  singleQuantity: number;
  bundleQuantity: number;
};

type ServiceStockRequirement = {
  serviceId: string;
  serviceName: string;
  quantity: number;
};

function parsePositiveQuantity(value: number) {
  if (!Number.isInteger(value) || value <= 0) {
    return null;
  }

  return value;
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

function getServiceUnitPriceCents(unitPrice: unknown) {
  return Math.round(Number(unitPrice || 0) * 100);
}

function revalidatePOSPaths() {
  revalidatePath('/dashboard/pos');
  revalidatePath('/dashboard/orders');
  revalidatePath('/dashboard/kitchen');
  revalidatePath('/dashboard/inventory');
  revalidatePath('/dashboard/menu');
  revalidatePath('/dashboard/service-requests');
  revalidatePath('/t/[tagCode]/menu', 'page');
  revalidatePath('/t/[tagCode]/service', 'page');
}

type POSOrderActor = {
  id: string;
  name: string;
  email: string;
  role: Role;
  hotelId: string | null;
};

async function createPOSOrderInternal(
  input: POSOrderInput,
  user: POSOrderActor
) {
  requireRole(user.role, ['SUPER_ADMIN', 'HOTEL_ADMIN', 'STAFF']);

  const hotelId = cleanText(input.hotelId);
  const roomId = cleanText(input.roomId);
  const guestName = cleanText(input.guestName, 100);
  const notes = cleanText(input.notes, 1000);
  const paymentMethod = input.paymentMethod as PaymentMethod;

  const isImmediatePOSPayment =
    paymentMethod === PaymentMethod.CASH || paymentMethod === PaymentMethod.POS;

  /**
   * POS-created food orders should enter the kitchen as already accepted.
   * They are paid immediately for CASH/Card/E-wallet, while room-charge and
   * pay-later transactions still move to preparation but remain unpaid.
   */
  const initialFoodOrderStatus = OrderStatus.PREPARING;
  const initialFoodPaymentStatus = isImmediatePOSPayment
    ? PaymentStatus.PAID
    : PaymentStatus.UNPAID;

  if (!hotelId) {
    throw new Error('Hotel is required.');
  }

  assertHotelScope(user, hotelId);

  if (!Object.values(PaymentMethod).includes(paymentMethod)) {
    throw new Error('Invalid payment method.');
  }

  const quantityByProductId = new Map<string, number>();

  for (const item of input.items ?? []) {
    const productId = cleanText(item.productId);
    const quantity = parsePositiveQuantity(item.quantity);

    if (!productId || quantity === null) {
      throw new Error('Invalid food item quantity.');
    }

    quantityByProductId.set(
      productId,
      (quantityByProductId.get(productId) ?? 0) + quantity
    );
  }

  const quantityByServiceId = new Map<string, number>();

  for (const item of input.services ?? []) {
    const serviceId = cleanText(item.serviceId);
    const quantity = parsePositiveQuantity(item.quantity);

    if (!serviceId || quantity === null) {
      throw new Error('Invalid service item quantity.');
    }

    quantityByServiceId.set(
      serviceId,
      (quantityByServiceId.get(serviceId) ?? 0) + quantity
    );
  }

  const normalizedItems = Array.from(quantityByProductId.entries()).map(
    ([productId, quantity]) => ({
      productId,
      quantity,
    })
  );

  const normalizedServices = Array.from(quantityByServiceId.entries()).map(
    ([serviceId, quantity]) => ({
      serviceId,
      quantity,
    })
  );

  if (!normalizedItems.length && !normalizedServices.length) {
    throw new Error('Please add at least one food item or service item.');
  }

  const productIds = normalizedItems.map((item) => item.productId);
  const serviceIds = normalizedServices.map((item) => item.serviceId);

  const [products, services] = await Promise.all([
    productIds.length
      ? db.menuProduct.findMany({
          where: {
            id: {
              in: productIds,
            },
            hotelId,
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
        })
      : [],

    serviceIds.length
      ? db.serviceCatalogItem.findMany({
          where: {
            id: {
              in: serviceIds,
            },
            hotelId,
            isActive: true,
          },
          select: {
            id: true,
            hotelId: true,
            code: true,
            name: true,
            description: true,
            billingMode: true,
            unitPrice: true,
            inventoryTracked: true,
          },
        })
      : [],
  ]);

  if (products.length !== productIds.length) {
    throw new Error('One or more food products are no longer available.');
  }

  if (services.length !== serviceIds.length) {
    throw new Error('One or more service items are no longer available.');
  }

  const productMap = new Map(products.map((product) => [product.id, product]));
  const serviceMap = new Map(services.map((service) => [service.id, service]));

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
          `${product.name} cannot be sold because ${component.componentProduct.name} is unavailable.`
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

  const fixedPriceServices = normalizedServices.filter((item) => {
    const service = serviceMap.get(item.serviceId);

    return service?.billingMode === ServiceBillingMode.FIXED_PRICE;
  });

  if (
    fixedPriceServices.length > 0 &&
    paymentMethod === PaymentMethod.ROOM_CHARGE &&
    !roomId
  ) {
    throw new Error('Room charge requires a selected room.');
  }

  const stockRequirements = new Map<string, StockRequirement>();

  for (const item of normalizedItems) {
    const product = productMap.get(item.productId);

    if (!product) {
      throw new Error('Food product not found.');
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

  const serviceStockRequirements = new Map<string, ServiceStockRequirement>();

  for (const item of normalizedServices) {
    const service = serviceMap.get(item.serviceId);

    if (!service) {
      throw new Error('Service item not found.');
    }

    if (!service.inventoryTracked) {
      continue;
    }

    addServiceStockRequirement(serviceStockRequirements, {
      serviceId: service.id,
      serviceName: service.name,
      quantity: item.quantity,
    });
  }

  const foodSubtotal = normalizedItems.reduce((sum, item) => {
    const product = productMap.get(item.productId)!;

    return sum + product.priceCents * item.quantity;
  }, 0);

  const serviceSubtotal = normalizedServices.reduce((sum, item) => {
    const service = serviceMap.get(item.serviceId)!;

    if (service.billingMode !== ServiceBillingMode.FIXED_PRICE) {
      return sum;
    }

    return sum + getServiceUnitPriceCents(service.unitPrice) * item.quantity;
  }, 0);

let orderCode: string | null = null;

/**
 * Grouped POS service request order:
 * Every service item submitted in this POS sale uses the same requestCode.
 * This allows the Service Requests dashboard to show one request order card
 * containing multiple service items.
 */
let groupedServiceRequestCode: string | null = null;

 const result = await db.$transaction(async (tx: Prisma.TransactionClient) => {

  const hotel = await tx.hotel.findUnique({
          where: {
            id: hotelId,
          },
          select: {
            name: true,
          },
        });

        if (!hotel) {
          throw new Error('Hotel was not found.');
        }
    const foodStockByProductId = new Map<
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
            hotelId,
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
        throw new Error(`${requirement.productName} has no stock record yet.`);
      }

      if (stock.isSoldOut || stock.availableQty <= 0) {
        throw new Error(`${requirement.productName} is sold out.`);
      }

      if (requirement.quantity > stock.availableQty) {
        throw new Error(
          `${requirement.productName} only has ${stock.availableQty} available.`
        );
      }

      foodStockByProductId.set(requirement.productId, stock);
    }

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
            hotelId,
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
        throw new Error(
          `${requirement.serviceName} has no service inventory stock record yet.`
        );
      }

      if (stock.isSoldOut || stock.availableQty <= 0) {
        throw new Error(`${requirement.serviceName} is currently unavailable.`);
      }

      if (requirement.quantity > stock.availableQty) {
        throw new Error(
          `${requirement.serviceName} only has ${stock.availableQty} available.`
        );
      }

      serviceStockByServiceId.set(requirement.serviceId, stock);
    }

      if (normalizedItems.length) {
      orderCode = await generateSeriesCode(tx, {
        hotelName: hotel.name,
        type: SeriesCodeType.FOOD,
      });
    }

    if (normalizedServices.length) {
      groupedServiceRequestCode = await generateSeriesCode(tx, {
        hotelName: hotel.name,
        type: SeriesCodeType.SERVICE,
      });
    }

    let createdOrder:
      | {
          id: string;
          orderCode: string;
        }
      | null = null;

    if (normalizedItems.length && orderCode) {
      createdOrder = await tx.order.create({
        data: {
          hotelId,
          roomId: roomId || null,
          locationId: null,
          tagId: null,
          orderCode,
          guestName: guestName || null,
          notes:
            [
              notes || null,
              serviceSubtotal > 0
                ? `POS also included service add-ons totaling ${serviceSubtotal / 100}.`
                : null,
              groupedServiceRequestCode
                ? `Related service request order: ${groupedServiceRequestCode}.`
                : null,
            ]
              .filter(Boolean)
              .join('\n') || null,
          paymentMethod,
          paymentStatus: initialFoodPaymentStatus,
          status: initialFoodOrderStatus,
          subtotalCents: foodSubtotal,
          serviceChargeCents: 0,
          taxCents: 0,
          totalCents: foodSubtotal,
          statusHistory: {
            create: {
              status: initialFoodOrderStatus,
              note: isImmediatePOSPayment
                ? 'POS sale paid and sent directly to preparation'
                : 'POS sale sent directly to preparation',
              userId: user.id,
            },
          },
        },
        select: {
          id: true,
          orderCode: true,
        },
      });

      for (const item of normalizedItems) {
        const product = productMap.get(item.productId)!;
        const isBundle = product.productType === MenuProductType.BUNDLE;

        await tx.orderItem.create({
          data: {
            orderId: createdOrder.id,
            productId: product.id,
            productNameSnapshot: product.name,
            quantity: item.quantity,
            unitPriceCents: product.priceCents,
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
    }

    for (const requirement of stockRequirements.values()) {
      const stock = foodStockByProductId.get(requirement.productId);

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
            hotelId,
            productId: requirement.productId,
            stockId: stock.id,
            type: MenuAvailabilityMovementType.ORDER_DEDUCTION,
            quantity: requirement.singleQuantity,
            balanceAfter: Math.max(updatedStock.availableQty, 0),
            reason: createdOrder
              ? `POS order ${createdOrder.orderCode}`
              : 'POS food deduction',
            userId: user.id,
          },
        });
      }

      if (requirement.bundleQuantity > 0) {
        await tx.menuAvailabilityMovement.create({
          data: {
            hotelId,
            productId: requirement.productId,
            stockId: stock.id,
            type: MenuAvailabilityMovementType.BUNDLE_ORDER_DEDUCTION,
            quantity: requirement.bundleQuantity,
            balanceAfter: Math.max(updatedStock.availableQty, 0),
            reason: createdOrder
              ? `POS bundle order ${createdOrder.orderCode}`
              : 'POS bundle food deduction',
            userId: user.id,
          },
        });
      }
    }

    const createdServiceRequests: {
      id: string;
      requestCode: string;
    }[] = [];

    for (const item of normalizedServices) {
      const service = serviceMap.get(item.serviceId)!;
      const serviceUnitPriceCents = getServiceUnitPriceCents(service.unitPrice);
      const serviceTotalCents =
        service.billingMode === ServiceBillingMode.FIXED_PRICE
          ? serviceUnitPriceCents * item.quantity
          : 0;

      const request = await tx.serviceRequest.create({
        data: {
          hotelId,
          roomId: roomId || null,
          locationId: null,
          tagId: null,
          requestCode: groupedServiceRequestCode!,
          type: service.name,
          guestName: guestName || null,
          notes:
            [
              `Grouped POS service request order ${groupedServiceRequestCode}.`,
              notes || null,
              `POS service request. Quantity: ${item.quantity}.`,
              `Payment method: ${paymentMethod.replaceAll('_', ' ')}.`,
              service.billingMode === ServiceBillingMode.FIXED_PRICE
                ? `POS service amount: ${serviceTotalCents / 100}.`
                : null,
              service.billingMode === ServiceBillingMode.PRICE_ON_CONFIRMATION
                ? 'Price requires staff confirmation.'
                : null,
              service.inventoryTracked
                ? 'Inventory-tracked service request.'
                : null,
            ]
              .filter(Boolean)
              .join('\n') || null,
          statusHistory: {
            create: {
              status: ServiceRequestStatus.NEW,
              note: `POS grouped service request order ${groupedServiceRequestCode} created from dashboard`,
              userId: user.id,
            },
          },
        },
        select: {
          id: true,
          requestCode: true,
        },
      });

      createdServiceRequests.push(request);

      if (service.inventoryTracked) {
        const stock = serviceStockByServiceId.get(service.id);

        if (!stock) {
          throw new Error(`${service.name} service stock was not found.`);
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
          throw new Error(
            `${service.name} service stock changed while submitting. Please try again.`
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
          throw new Error(`${service.name} service stock was not found.`);
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
            hotelId,
            serviceId: service.id,
            stockId: stock.id,
            type: ServiceAvailabilityMovementType.REQUEST_DEDUCTION,
            quantity: item.quantity,
            balanceAfter: Math.max(updatedStock.availableQty, 0),
            reason: `POS grouped service request ${request.requestCode}`,
            userId: user.id,
            serviceRequestId: request.id,
          },
        });
      }

      if (service.billingMode === ServiceBillingMode.FIXED_PRICE && roomId) {
        await tx.roomAddOnCharge.create({
          data: {
            chargeCode: randomCode('ADD'),
            hotelId,
            roomId,
            serviceRequestId: request.id,
            itemName: service.name,
            description: notes || service.description || null,
            quantity: item.quantity,
            unitPrice: (serviceUnitPriceCents / 100).toFixed(2),
            totalAmount: (serviceTotalCents / 100).toFixed(2),
            paymentStatus: isImmediatePOSPayment
              ? RoomAddOnPaymentStatus.PAID
              : undefined,
            paidAt: isImmediatePOSPayment ? new Date() : undefined,
            paidById: isImmediatePOSPayment ? user.id : undefined,
            paymentReference: isImmediatePOSPayment
              ? `POS ${paymentMethod.replaceAll('_', ' ')}`
              : undefined,
            postedById: user.id,
          },
        });
      }
    }

    return {
      order: createdOrder,
      serviceRequests: createdServiceRequests,
    };
  });

  if (result.order) {
    await logActivity({
      hotelId,
      actor: user.name ?? user.email ?? 'Dashboard User',
      action: 'CREATE',
      entity: 'Order',
      entityId: result.order.id,
      message: `POS order ${result.order.orderCode} created`,
    });

    await triggerKitchenOrderCreated({
      hotelId,
      orderCode: result.order.orderCode,
      status: initialFoodOrderStatus,
      source: 'POS_TERMINAL',
    });
  }

  await Promise.allSettled(
    result.serviceRequests.map((request) =>
      logActivity({
        hotelId,
        actor: user.name ?? user.email ?? 'Dashboard User',
        action: 'CREATE',
        entity: 'ServiceRequest',
        entityId: request.id,
        message: `POS grouped service request ${request.requestCode} created`,
      })
    )
  );

  await Promise.allSettled(
    result.serviceRequests.map((request) =>
      triggerServiceRequestCreated({
        hotelId,
        requestId: request.id,
        requestCode: request.requestCode,
        status: ServiceRequestStatus.NEW,
      })
    )
  );

  const affectedInventoryIds = [
    ...Array.from(stockRequirements.keys()),
    ...Array.from(serviceStockRequirements.keys()),
  ];

  if (affectedInventoryIds.length > 0) {
    await triggerInventoryUpdated({
      hotelId,
      productIds: affectedInventoryIds,
      source: 'POS_TERMINAL',
    });
  }

  revalidatePOSPaths();

  return {
    ok: true,
    success: 'pos-sale-created',
    orderCode: result.order?.orderCode ?? null,
    serviceRequestCodes: Array.from(
      new Set(result.serviceRequests.map((request) => request.requestCode))
    ),
  };
}

export async function createPOSOrder(input: POSOrderInput) {
  const user = await requireUser();

  return createPOSOrderInternal(input, user);
}

/**
 * Trusted recovery entry point used only by the verified Xendit webhook.
 * The original cashier identity stored on the payment session is reloaded
 * from the database so stock, audit logs, and hotel scoping remain identical
 * to a normal authenticated POS finalization.
 */
export async function createPOSOrderAsUser(
  input: POSOrderInput,
  userIdInput: string,
  recoveryToken: unknown
) {
  assertXenditWebhookRecoveryToken(recoveryToken);

  const userId = cleanText(userIdInput, 120);

  if (!userId) {
    throw new Error('The POS payment session has no valid cashier identity.');
  }

  const user = await db.user.findFirst({
    where: {
      id: userId,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      hotelId: true,
    },
  });

  if (!user) {
    throw new Error(
      'The cashier account linked to this paid POS session is unavailable.'
    );
  }

  return createPOSOrderInternal(input, user);
}
