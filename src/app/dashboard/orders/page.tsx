import { OrderStatus, PaymentStatus } from '@prisma/client';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { RealtimeKitchenRefresh } from '@/components/dashboard/RealtimeKitchenRefresh';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { OrdersClient } from './OrdersClient';

export const dynamic = 'force-dynamic';

const activeStatuses = [
  OrderStatus.PENDING,
  OrderStatus.ACCEPTED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
];

export default async function OrdersPage() {
  const user = await requireUser();

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
          })),
          statusHistory: order.statusHistory.map((history) => ({
            id: history.id,
            status: history.status,
            note: history.note ?? '',
            createdAt: history.createdAt.toISOString(),
            userName: history.user?.name ?? history.user?.email ?? '',
          })),
        }))}
      />
    </div>
  );
}