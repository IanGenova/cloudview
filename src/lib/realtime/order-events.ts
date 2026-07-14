import type {
  GuestXenditRefundStatus,
  OrderStatus,
  PaymentStatus,
} from '@prisma/client';
import { publishToCentrifugo } from '@/lib/realtime/centrifugo-publisher';
import { realtimeChannels } from '@/lib/realtime/channels';

type OrderRealtimeEvent =
  | {
      event: 'order-status-updated';
      orderCode: string;
      status: OrderStatus;
      updatedAt: string;
    }
  | {
      event: 'order-payment-updated';
      orderCode: string;
      paymentStatus: PaymentStatus;
      updatedAt: string;
    }
  | {
      event: 'order-refund-updated';
      orderCode: string;
      status?: OrderStatus;
      paymentStatus: PaymentStatus;
      refundStatus: GuestXenditRefundStatus;
      refundedAmountCents: number;
      refundErrorMessage?: string | null;
      updatedAt: string;
    }
  | {
      event: 'order-items-updated';
      orderCode: string;
      status?: OrderStatus;
      updatedAt: string;
    };

async function publishOrderEvent(data: OrderRealtimeEvent) {
  if (!data.orderCode?.trim()) {
    console.warn('Order realtime publish skipped. orderCode is missing.');
    return;
  }

  await publishToCentrifugo({
    channel: realtimeChannels.guestOrder(data.orderCode),
    data,
    debugLabel: data.event,
  });
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
  await publishOrderEvent({
    event: 'order-status-updated',
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
  await publishOrderEvent({
    event: 'order-payment-updated',
    orderCode,
    paymentStatus,
    updatedAt,
  });
}

export async function triggerOrderRefundUpdate({
  orderCode,
  status,
  paymentStatus,
  refundStatus,
  refundedAmountCents,
  refundErrorMessage,
  updatedAt,
}: {
  orderCode: string;
  status?: OrderStatus;
  paymentStatus: PaymentStatus;
  refundStatus: GuestXenditRefundStatus;
  refundedAmountCents: number;
  refundErrorMessage?: string | null;
  updatedAt: string;
}) {
  await publishOrderEvent({
    event: 'order-refund-updated',
    orderCode,
    status,
    paymentStatus,
    refundStatus,
    refundedAmountCents,
    refundErrorMessage,
    updatedAt,
  });
}

export async function triggerOrderItemsUpdate({
  orderCode,
  status,
  updatedAt,
}: {
  orderCode: string;
  status?: OrderStatus;
  updatedAt: string;
}) {
  await publishOrderEvent({
    event: 'order-items-updated',
    orderCode,
    status,
    updatedAt,
  });
}
