'use server';

import { OrderStatus, PaymentStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { assertHotelScope } from '@/lib/access';
import { deductInventoryForOrder, InventoryError } from '@/lib/inventory';
import { sendOrderToPos } from '@/lib/pos';
import { cleanText } from '@/lib/sanitize';

export async function updateOrderStatusAction(formData: FormData) {
  const user = await requireUser();
  const orderId = cleanText(formData.get('orderId'));
  const status = formData.get('status') as OrderStatus;
  if (!orderId || !Object.values(OrderStatus).includes(status)) throw new Error('Invalid status update');

  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error('Order not found');
  assertHotelScope(user, order.hotelId);

  try {
    if (status === OrderStatus.ACCEPTED && !order.inventoryDeductedAt) {
      await deductInventoryForOrder(order.id, user.id);
      await sendOrderToPos(order.id);
    }

    await db.order.update({ where: { id: order.id }, data: { status } });
    await db.orderStatusHistory.create({ data: { orderId: order.id, status, userId: user.id, note: cleanText(formData.get('note'), 300) } });
  } catch (error) {
    if (error instanceof InventoryError) throw new Error(error.message);
    throw error;
  }

  revalidatePath('/dashboard/orders');
  revalidatePath('/dashboard/kitchen');
}

export async function markOrderPaidAction(formData: FormData) {
  const user = await requireUser();
  const orderId = cleanText(formData.get('orderId'));
  if (!orderId) throw new Error('Order required');
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error('Order not found');
  assertHotelScope(user, order.hotelId);
  await db.order.update({ where: { id: order.id }, data: { paymentStatus: PaymentStatus.PAID } });
  revalidatePath('/dashboard/orders');
}
