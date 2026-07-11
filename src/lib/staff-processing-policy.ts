import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ServiceRequestStatus,
} from '@prisma/client';

const FOOD_ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  [OrderStatus.ACCEPTED]: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  [OrderStatus.PREPARING]: [OrderStatus.READY, OrderStatus.CANCELLED],
  [OrderStatus.READY]: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
};

const SERVICE_REQUEST_TRANSITIONS: Record<
  ServiceRequestStatus,
  readonly ServiceRequestStatus[]
> = {
  [ServiceRequestStatus.NEW]: [
    ServiceRequestStatus.IN_PROGRESS,
    ServiceRequestStatus.CANCELLED,
  ],
  [ServiceRequestStatus.IN_PROGRESS]: [
    ServiceRequestStatus.COMPLETED,
    ServiceRequestStatus.CANCELLED,
  ],
  [ServiceRequestStatus.COMPLETED]: [],
  [ServiceRequestStatus.CANCELLED]: [],
};

export function isRefundEligiblePaymentStatus(status: PaymentStatus) {
  return (
    status === PaymentStatus.PAID ||
    status === PaymentStatus.PARTIALLY_REFUNDED ||
    status === PaymentStatus.REFUND_FAILED
  );
}

export function isPayMongoKitchenReady(status: PaymentStatus) {
  return (
    status === PaymentStatus.PAID ||
    status === PaymentStatus.PARTIALLY_REFUNDED
  );
}

export function assertFoodOrderStatusTransition(
  currentStatus: OrderStatus,
  nextStatus: OrderStatus
) {
  if (currentStatus === nextStatus) {
    return;
  }

  if (!FOOD_ORDER_TRANSITIONS[currentStatus].includes(nextStatus)) {
    throw new Error(
      `Order cannot move from ${currentStatus.replaceAll('_', ' ')} to ${nextStatus.replaceAll('_', ' ')}.`
    );
  }
}

export function assertPayMongoOrderCanEnterKitchen(input: {
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  nextStatus: OrderStatus;
}) {
  if (input.paymentMethod !== PaymentMethod.PAYMONGO) {
    return;
  }

  const requiresConfirmedPayment =
    input.nextStatus === OrderStatus.PREPARING ||
    input.nextStatus === OrderStatus.READY ||
    input.nextStatus === OrderStatus.DELIVERED;

  if (requiresConfirmedPayment && !isPayMongoKitchenReady(input.paymentStatus)) {
    throw new Error(
      'This PayMongo order cannot enter kitchen processing until the verified payment is PAID.'
    );
  }
}

export function isTerminalServiceRequestStatus(status: ServiceRequestStatus) {
  return (
    status === ServiceRequestStatus.COMPLETED ||
    status === ServiceRequestStatus.CANCELLED
  );
}

export function assertServiceRequestStatusTransition(
  currentStatus: ServiceRequestStatus,
  nextStatus: ServiceRequestStatus
) {
  if (currentStatus === nextStatus) {
    return;
  }

  if (!SERVICE_REQUEST_TRANSITIONS[currentStatus].includes(nextStatus)) {
    throw new Error(
      `Service request cannot move from ${currentStatus.replaceAll('_', ' ')} to ${nextStatus.replaceAll('_', ' ')}.`
    );
  }
}

export function getAllowedServiceRequestStatuses(
  currentStatus: ServiceRequestStatus
) {
  return [currentStatus, ...SERVICE_REQUEST_TRANSITIONS[currentStatus]];
}
