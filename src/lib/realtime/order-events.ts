import Pusher from 'pusher';
import type { OrderStatus, PaymentStatus } from '@prisma/client';

let pusherServer: Pusher | null = null;

function getPusherServer() {
  if (pusherServer) {
    return pusherServer;
  }

  const appId = process.env.PUSHER_APP_ID;
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const secret = process.env.PUSHER_SECRET;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

  if (!appId || !key || !secret || !cluster) {
    console.warn('Pusher environment variables are incomplete. Realtime events skipped.');
    return null;
  }

  pusherServer = new Pusher({
    appId,
    key,
    secret,
    cluster,
    useTLS: true,
  });

  return pusherServer;
}

export async function triggerOrderStatusUpdate({
  orderCode,
  status,
  updatedAt,
}: {
  orderCode: string;
  status: OrderStatus;
  updatedAt: string;
}) {
  const pusher = getPusherServer();

  if (!pusher) {
    return;
  }

  await pusher.trigger(`order-${orderCode}`, 'order-status-updated', {
    orderCode,
    status,
    updatedAt,
  });
}

export async function triggerOrderPaidUpdate({
  orderCode,
  paymentStatus,
  updatedAt,
}: {
  orderCode: string;
  paymentStatus: PaymentStatus;
  updatedAt: string;
}) {
  const pusher = getPusherServer();

  if (!pusher) {
    return;
  }

  await pusher.trigger(`order-${orderCode}`, 'order-payment-updated', {
    orderCode,
    paymentStatus,
    updatedAt,
  });
}