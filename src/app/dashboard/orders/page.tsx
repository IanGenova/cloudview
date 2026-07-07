import {
  DashboardModule,
  MenuAvailabilityMovementType,
  OrderStatus,
  PaymentStatus,
} from '@prisma/client';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { RealtimeKitchenRefresh } from '@/components/dashboard/RealtimeKitchenRefresh';
import { db } from '@/lib/db';
import { requireDashboardPermission } from '@/lib/dashboard-permissions';
import { OrdersClient } from './OrdersClient';

export const dynamic = 'force-dynamic';

const activeStatuses: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.ACCEPTED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
];

function getOrdersMessage(success?: string, error?: string) {
  if (success) {
    const messages: Record<string, string> = {
      'item-cancelled':
        'Food item was cancelled successfully. Stock restoration was processed.',
      'order-cancelled':
        'Order was cancelled successfully. Stock restoration was processed.',
    };

    return {
      type: 'success' as const,
      text: messages[success] ?? 'Action completed successfully.',
    };
  }

  if (error) {
    const messages: Record<string, string> = {
      'order-item-required': 'Order item details are missing.',
      'order-not-found': 'Order was not found.',
      'order-not-pending':
        'Only pending orders can have individual items cancelled.',
      'order-item-not-found': 'Order item was not found.',
      'item-already-cancelled':
        'This item was already cancelled. The order list has been refreshed.',
    };

    return {
      type: 'error' as const,
      text: messages[error] ?? 'Something went wrong.',
    };
  }

  return null;
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams?: Promise<{
    success?: string;
    error?: string;
  }>;
}) {
  const user = await requireDashboardPermission(
    DashboardModule.ORDERS,
    'canView'
  );
  const params = await searchParams;
  const message = getOrdersMessage(params?.success, params?.error);

  const where = user.role === 'SUPER_ADMIN' ? {} : { hotelId: user.hotelId! };

  const orders = await db.order.findMany({
    where,
    include: {
      hotel: {
        select: {
          name: true,
        },
      },
      room: {
        select: {
          number: true,
        },
      },
      location: {
        select: {
          name: true,
        },
      },
      tag: {
        select: {
          code: true,
        },
      },
      items: {
        orderBy: {
          createdAt: 'asc',
        },
        select: {
          id: true,
          quantity: true,
          productNameSnapshot: true,
          unitPriceCents: true,
          notes: true,
          isBundleSnapshot: true,
          status: true,
          cancelledQty: true,
          cancelledAt: true,
          cancelReason: true,
          bundleComponents: {
            orderBy: {
              createdAt: 'asc',
            },
            select: {
              id: true,
              componentNameSnapshot: true,
              quantity: true,
            },
          },
        },
      },
      statusHistory: {
        orderBy: {
          createdAt: 'asc',
        },
        select: {
          id: true,
          status: true,
          note: true,
          createdAt: true,
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 150,
  });

  const orderCodes = orders.map((order) => order.orderCode);

  const restoreMovements = orderCodes.length
    ? await db.menuAvailabilityMovement.findMany({
        where: {
          ...(user.role === 'SUPER_ADMIN' ? {} : { hotelId: user.hotelId! }),
          type: {
            in: [
              MenuAvailabilityMovementType.CANCEL_RESTORE,
              MenuAvailabilityMovementType.BUNDLE_CANCEL_RESTORE,
            ],
          },
          OR: orderCodes.map((orderCode) => ({
            reason: {
              contains: orderCode,
            },
          })),
        },
        include: {
          product: {
            select: {
              name: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      })
    : [];

  const activeOrders = orders.filter((order) =>
    activeStatuses.includes(order.status)
  );

  const unpaidOrders = orders.filter(
    (order) => order.paymentStatus !== PaymentStatus.PAID
  );

  const cancelledOrders = orders.filter(
    (order) => order.status === OrderStatus.CANCELLED
  );

  const totalSalesCents = orders.reduce(
    (sum, order) => sum + order.totalCents,
    0
  );

  const statusCounts = {
    ALL: orders.length,
    PENDING: orders.filter((order) => order.status === OrderStatus.PENDING)
      .length,
    ACCEPTED: orders.filter((order) => order.status === OrderStatus.ACCEPTED)
      .length,
    PREPARING: orders.filter((order) => order.status === OrderStatus.PREPARING)
      .length,
    READY: orders.filter((order) => order.status === OrderStatus.READY).length,
    DELIVERED: orders.filter((order) => order.status === OrderStatus.DELIVERED)
      .length,
    CANCELLED: cancelledOrders.length,
  };

  return (
    <div>
      <RealtimeKitchenRefresh />

      <PageHeader
        title="Orders"
        description="Food orders from NFC/QR guest portals and POS terminal. Realtime-enabled for kitchen and inventory workflows."
      />

      <OrdersClient
        message={message}
        summary={{
          activeOrders: activeOrders.length,
          unpaidOrders: unpaidOrders.length,
          cancelledOrders: cancelledOrders.length,
          totalSalesCents,
        }}
        statusCounts={statusCounts}
        orders={orders.map((order) => ({
          id: order.id,
          orderCode: order.orderCode,
          hotelName: order.hotel.name,
          roomLabel: order.room
            ? `Room ${order.room.number}`
            : order.location?.name ?? 'Guest location',
          guestName: order.guestName ?? '',
          notes: order.notes ?? '',
          status: order.status,
          paymentStatus: order.paymentStatus,
          paymentMethod: order.paymentMethod,
          totalCents: order.totalCents,
          subtotalCents: order.subtotalCents,
          serviceChargeCents: order.serviceChargeCents,
          taxCents: order.taxCents,
          createdAt: order.createdAt.toISOString(),
          updatedAt: order.updatedAt.toISOString(),
          tagCode: order.tag?.code ?? '',
          items: order.items.map((item) => ({
            id: item.id,
            quantity: item.quantity,
            productNameSnapshot: item.productNameSnapshot,
            unitPriceCents: item.unitPriceCents,
            notes: item.notes ?? '',
            isBundleSnapshot: item.isBundleSnapshot,
            status: item.status,
            cancelledQty: item.cancelledQty,
            cancelledAt: item.cancelledAt?.toISOString() ?? '',
            cancelReason: item.cancelReason ?? '',
            bundleComponents: item.bundleComponents.map((component) => ({
              id: component.id,
              componentNameSnapshot: component.componentNameSnapshot,
              quantity: component.quantity,
            })),
          })),
          statusHistory: order.statusHistory.map((history) => ({
            id: history.id,
            status: history.status,
            note: history.note ?? '',
            createdAt: history.createdAt.toISOString(),
            userName: history.user?.name ?? history.user?.email ?? '',
          })),
          restoreMovements: restoreMovements
            .filter((movement) =>
              Boolean(movement.reason?.includes(order.orderCode))
            )
            .map((movement) => ({
              id: movement.id,
              productName: movement.product.name,
              type: movement.type,
              quantity: movement.quantity,
              balanceAfter: movement.balanceAfter,
              reason: movement.reason ?? '',
              createdAt: movement.createdAt.toISOString(),
            })),
        }))}
      />
    </div>
  );
}
