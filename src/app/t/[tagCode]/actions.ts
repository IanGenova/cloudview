'use server';

import { redirect } from 'next/navigation';
import { PaymentMethod } from '@prisma/client';
import { db } from '@/lib/db';
import { createGuestOrderSchema, createServiceRequestSchema } from '@/lib/validators';
import { cleanText } from '@/lib/sanitize';
import { randomCode } from '@/lib/utils';
import { logActivity } from '@/lib/activity';

export async function createGuestOrder(input: unknown) {
  const parsed = createGuestOrderSchema.parse(input);
  const tag = await db.nfcTag.findUnique({
    where: { code: parsed.tagCode },
    include: { hotel: { include: { settings: true } }, room: true, location: true }
  });
  if (!tag || tag.status !== 'ACTIVE') throw new Error('This NFC tag is inactive or invalid.');

  const productIds = parsed.items.map((item) => item.productId);
  const products = await db.menuProduct.findMany({ where: { id: { in: productIds }, hotelId: tag.hotelId, isAvailable: true } });
  const productMap = new Map(products.map((p) => [p.id, p]));
  if (products.length !== new Set(productIds).size) throw new Error('One or more products are no longer available.');

  const subtotal = parsed.items.reduce((sum, item) => {
    const product = productMap.get(item.productId)!;
    return sum + product.priceCents * item.quantity;
  }, 0);
  const settings = tag.hotel.settings;
  const serviceCharge = Math.round(subtotal * Number(settings?.serviceChargeRate ?? 0));
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
            notes: cleanText(item.notes, 300)
          };
        })
      },
      statusHistory: { create: { status: 'PENDING', note: 'Guest submitted order from NFC portal' } }
    }
  });

  await logActivity({ hotelId: tag.hotelId, actor: 'Guest', action: 'CREATE', entity: 'Order', entityId: order.id, message: `New guest order ${order.orderCode}` });
  return { ok: true, orderCode };
}

export async function createServiceRequestAction(formData: FormData) {
  const parsed = createServiceRequestSchema.parse({
    tagCode: formData.get('tagCode'),
    type: formData.get('type'),
    guestName: formData.get('guestName'),
    notes: formData.get('notes')
  });
  const tag = await db.nfcTag.findUnique({ where: { code: parsed.tagCode } });
  if (!tag || tag.status !== 'ACTIVE') throw new Error('Invalid NFC tag');
  const requestCode = randomCode('REQ');
  const request = await db.serviceRequest.create({
    data: {
      hotelId: tag.hotelId,
      roomId: tag.roomId,
      locationId: tag.locationId,
      tagId: tag.id,
      requestCode,
      type: cleanText(parsed.type, 80)!,
      guestName: cleanText(parsed.guestName, 100),
      notes: cleanText(parsed.notes, 1000),
      statusHistory: { create: { status: 'NEW', note: 'Guest submitted request from NFC portal' } }
    }
  });
  await logActivity({ hotelId: tag.hotelId, actor: 'Guest', action: 'CREATE', entity: 'ServiceRequest', entityId: request.id, message: `New service request ${request.requestCode}` });
  redirect(`/t/${parsed.tagCode}/service/thanks?code=${requestCode}`);
}
