'use server';

import { OrderStatus, PaymentStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { assertHotelScope } from '@/lib/access';
import { deductInventoryForOrder, InventoryError } from '@/lib/inventory';
import { sendOrderToPos } from '@/lib/pos';
import { cleanText } from '@/lib/sanitize';
import {
  triggerOrderPaidUpdate,
  triggerOrderStatusUpdate,
} from '@/lib/realtime/order-events';

function revalidateOrderPaths(order: {
  orderCode: string;
  tag: {
    code: string;
  } | null;
}) {
  revalidatePath('/dashboard/orders');
  revalidatePath('/dashboard/kitchen');

  if (order.tag?.code) {
    revalidatePath(`/t/${order.tag.code}/track/${order.orderCode}`);
  }
}

export async function updateOrderStatusAction(formData: FormData) {
  const user = await requireUser();

  const orderId = cleanText(formData.get('orderId'));
  const status = formData.get('status') as OrderStatus;
  const note = cleanText(formData.get('note'), 300);

  if (!orderId || !Object.values(OrderStatus).includes(status)) {
    throw new Error('Invalid status update');
  }

  const order = await db.order.findUnique({
    where: {
      id: orderId,
    },
    select: {
      id: true,
      hotelId: true,
      status: true,
      orderCode: true,
      inventoryDeductedAt: true,
      tag: {
        select: {
          code: true,
        },
      },
    },
  });

  if (!order) {
    throw new Error('Order not found');
  }

  assertHotelScope(user, order.hotelId);

  let statusUpdatedAt = new Date();

  try {
    if (status === OrderStatus.ACCEPTED && !order.inventoryDeductedAt) {
      await deductInventoryForOrder(order.id, user.id);
      await sendOrderToPos(order.id);
    }

    const history = await db.$transaction(async (tx) => {
      await tx.order.update({
        where: {
          id: order.id,
        },
        data: {
          status,
        },
      });

      return tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status,
          userId: user.id,
          note: note || null,
        },
        select: {
          createdAt: true,
        },
      });
    });

    statusUpdatedAt = history.createdAt;
  } catch (error) {
    if (error instanceof InventoryError) {
      throw new Error(error.message);
    }

    throw error;
  }

  revalidateOrderPaths(order);

  await triggerOrderStatusUpdate({
    orderCode: order.orderCode,
    status,
    updatedAt: statusUpdatedAt.toISOString(),
  });
}

export async function markOrderPaidAction(formData: FormData) {
  const user = await requireUser();

  const orderId = cleanText(formData.get('orderId'));

  if (!orderId) {
    throw new Error('Order required');
  }

  const order = await db.order.findUnique({
    where: {
      id: orderId,
    },
    select: {
      id: true,
      hotelId: true,
      orderCode: true,
      tag: {
        select: {
          code: true,
        },
      },
    },
  });

  if (!order) {
    throw new Error('Order not found');
  }

  assertHotelScope(user, order.hotelId);

  await db.order.update({
    where: {
      id: order.id,
    },
    data: {
      paymentStatus: PaymentStatus.PAID,
    },
  });

  revalidateOrderPaths(order);

  await triggerOrderPaidUpdate({
    orderCode: order.orderCode,
    paymentStatus: PaymentStatus.PAID,
    updatedAt: new Date().toISOString(),
  });
}