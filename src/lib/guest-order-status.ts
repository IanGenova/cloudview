import { FulfillmentTiming, OrderStatus } from '@prisma/client';

type GuestOrderType = 'ROOM_SERVICE' | 'DINE_IN' | 'TAKE_OUT' | 'PICK_UP' | 'UNKNOWN';

type GuestOrderProgressInput = {
  status: OrderStatus;
  notes: string | null;
  fulfillmentTiming: FulfillmentTiming;
  scheduledFor: Date | null;
  releasedAt: Date | null;
};

export function getGuestOrderType(notes: string | null): GuestOrderType {
  const orderType = notes?.match(/^Order Type: (.+)$/m)?.[1]?.trim();

  switch (orderType) {
    case 'Room Service / Deliver to Room':
      return 'ROOM_SERVICE';
    case 'Dine In':
      return 'DINE_IN';
    case 'Take Out':
      return 'TAKE_OUT';
    case 'Pick Up at Counter':
      return 'PICK_UP';
    default:
      return 'UNKNOWN';
  }
}

export function getGuestOrderDestination(
  notes: string | null,
  roomNumber: string | null,
  locationLabel: string
) {
  switch (getGuestOrderType(notes)) {
    case 'ROOM_SERVICE':
      return roomNumber ? `Room ${roomNumber}` : 'Guest room';
    case 'DINE_IN':
      return locationLabel ? `Dine in at ${locationLabel}` : 'Dine in';
    case 'TAKE_OUT':
      return 'Takeaway';
    case 'PICK_UP':
      return 'Pick up at counter';
    default:
      return roomNumber ? `Room ${roomNumber}` : locationLabel;
  }
}

function scheduledTime(date: Date) {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function getGuestOrderProgress(order: GuestOrderProgressInput) {
  const orderType = getGuestOrderType(order.notes);
  const awaitingScheduledRelease =
    order.fulfillmentTiming === FulfillmentTiming.SCHEDULED &&
    !order.releasedAt &&
    order.status === OrderStatus.PENDING;

  if (awaitingScheduledRelease) {
    return {
      title: 'Order scheduled',
      subtitle: 'Your order is saved. The hotel team will start processing it for the selected time.',
      etaLabel: 'Scheduled for',
      eta: order.scheduledFor ? scheduledTime(order.scheduledFor) : 'Time to be confirmed',
      timerLabel: 'Time since order was placed',
    };
  }

  switch (order.status) {
    case OrderStatus.PENDING:
      return {
        title: 'Order received',
        subtitle: 'The hotel team has received your order and has not accepted it yet.',
        etaLabel: 'Next step',
        eta: 'Staff confirmation',
        timerLabel: 'Time since order was placed',
      };
    case OrderStatus.ACCEPTED:
      return {
        title: 'Order accepted',
        subtitle: 'The hotel team accepted your order. Preparation is next.',
        etaLabel: 'Next step',
        eta: 'Food preparation',
        timerLabel: 'Time since confirmation',
      };
    case OrderStatus.PREPARING:
      return {
        title: 'Preparing your order',
        subtitle: 'The kitchen is preparing your food.',
        etaLabel: 'Next step',
        eta: 'Ready notification',
        timerLabel: 'Time in preparation',
      };
    case OrderStatus.READY:
      return {
        title: 'Your order is ready',
        subtitle:
          orderType === 'ROOM_SERVICE'
            ? 'Your food is ready and the hotel team will deliver it to your room.'
            : orderType === 'PICK_UP'
              ? 'Your food is ready. Please collect it at the counter.'
              : orderType === 'TAKE_OUT'
                ? 'Your takeaway order is ready. Check with staff for collection.'
              : orderType === 'DINE_IN'
                ? 'Your food is ready. The hotel team will serve it to you.'
                : 'Your food is ready. Please check with the hotel team for collection.',
        etaLabel: 'Status',
        eta: 'Ready now',
        timerLabel: 'Time since ready',
      };
    case OrderStatus.DELIVERED:
      return {
        title: orderType === 'ROOM_SERVICE' ? 'Order delivered' : 'Order completed',
        subtitle:
          orderType === 'ROOM_SERVICE'
            ? 'Your food has been delivered. Enjoy your meal.'
            : 'The hotel team marked your order as complete.',
        etaLabel: 'Status',
        eta: 'Completed',
        timerLabel: 'Completed in',
      };
    case OrderStatus.CANCELLED:
      return {
        title: 'Order cancelled',
        subtitle: 'This order was cancelled. Contact the hotel team if you need help.',
        etaLabel: 'Status',
        eta: 'Cancelled',
        timerLabel: 'Cancelled after',
      };
    default:
      return {
        title: 'Tracking your order',
        subtitle: 'Your order status is being updated.',
        etaLabel: 'Status',
        eta: 'Updating',
        timerLabel: 'Time since order was placed',
      };
  }
}
