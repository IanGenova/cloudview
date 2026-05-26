'use server';

import { redirect } from 'next/navigation';
import { PaymentMethod } from '@prisma/client';
import { db } from '@/lib/db';
import { createGuestOrderSchema } from '@/lib/validators';
import { cleanText } from '@/lib/sanitize';
import { randomCode } from '@/lib/utils';
import { logActivity } from '@/lib/activity';


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
          settings: true,
        },
      },
    },
  });

  if (!tag || tag.status !== 'ACTIVE') {
    throw new Error('This NFC tag is inactive or invalid.');
  }

  const productIds = parsed.items.map((item) => item.productId);

  const products = await db.menuProduct.findMany({
    where: {
      id: {
        in: productIds,
      },
      hotelId: tag.hotelId,
      isAvailable: true,
    },
  });

  const productMap = new Map(products.map((product) => [product.id, product]));

  if (products.length !== new Set(productIds).size) {
    throw new Error('One or more products are no longer available.');
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
  const orderCode = randomCode('ORD');

  const order = await db.order.create({
    data: {
      hotelId: tag.hotelId,
      roomId: tag.roomId,
      locationId: tag.locationId,
      tagId: tag.id,
      orderCode,
      guestName: cleanText(parsed.guestName, 100),
      notes: cleanText(parsed.notes, 1000),
      paymentMethod: parsed.paymentMethod as PaymentMethod,
      subtotalCents: subtotal,
      serviceChargeCents: serviceCharge,
      taxCents: tax,
      totalCents: total,
      items: {
        create: parsed.items.map((item) => {
          const product = productMap.get(item.productId)!;

          return {
            productId: product.id,
            productNameSnapshot: product.name,
            quantity: item.quantity,
            unitPriceCents: product.priceCents,
            notes: cleanText(item.notes, 300),
          };
        }),
      },
      statusHistory: {
        create: {
          status: 'PENDING',
          note: 'Guest submitted order from NFC portal',
        },
      },
    },
  });

  await logActivity({
    hotelId: tag.hotelId,
    actor: 'Guest',
    action: 'CREATE',
    entity: 'Order',
    entityId: order.id,
    message: `New guest order ${order.orderCode}`,
  });

  return {
    ok: true,
    orderCode,
  };
}

function parseQuantity(value: FormDataEntryValue | null) {
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
  const tagCode = cleanText(formData.get('tagCode'), 160) || '';
  const guestName = cleanText(formData.get('guestName'), 100);
  const notes = cleanText(formData.get('notes'), 1000);
  const chargeConsent = formData.get('chargeConsent') === 'true';

  const serviceCodes = Array.from(
    new Set(
      formData
        .getAll('serviceCodes')
        .map((value) => cleanText(value, 80))
        .filter(Boolean)
    )
  ) as string[];

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
    },
  });

  if (!tag) {
    redirectToService(tagCode, {
      error: 'invalid_tag',
    });
  }

  if (tag.status !== 'ACTIVE') {
    redirectToService(tagCode, {
      error: 'inactive_tag',
    });
  }

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

  let createdRequests: {
    id: string;
    requestCode: string;
  }[] = [];

  try {
    createdRequests = await db.$transaction(async (tx) => {
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
            requestCode: randomCode('REQ'),
            type: item.service.name,
            guestName: guestName || null,
            notes:
              [
                notes || null,
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
                note: 'Guest submitted request from NFC portal',
              },
            },
          },
          select: {
            id: true,
            requestCode: true,
          },
        });

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
    redirectToService(tagCode, {
      error: 'request_failed',
    });
  }

  await Promise.allSettled(
    createdRequests.map((request) =>
      logActivity({
        hotelId: tag.hotelId,
        actor: 'Guest',
        action: 'CREATE',
        entity: 'ServiceRequest',
        entityId: request.id,
        message: `New service request ${request.requestCode}`,
      })
    )
  );

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