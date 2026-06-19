import type { OrderStatus, Prisma, ServiceRequestStatus } from '@prisma/client';
import { db } from '@/lib/db';
import {
  ACTIVE_ORDER_STATUSES,
  ACTIVE_SERVICE_REQUEST_STATUSES,
  getCurrentNfcGuestIdentity,
} from '@/lib/nfc-guest-session';

const orderSelect = {
  id: true,
  orderCode: true,
  status: true,
  paymentStatus: true,
  totalCents: true,
  guestName: true,
  guestSessionId: true,
  guestStayId: true,
  guestMemberId: true,
  createdAt: true,
  items: {
    select: {
      id: true,
      productId: true,
      productNameSnapshot: true,
      quantity: true,
      unitPriceCents: true,
    },
    orderBy: {
      id: 'asc',
    },
  },
} as const;

const serviceRequestSelect = {
  id: true,
  requestCode: true,
  type: true,
  status: true,
  guestName: true,
  guestSessionId: true,
  guestStayId: true,
  guestMemberId: true,
  notes: true,
  createdAt: true,
} as const;

const activeOrderStatusSet = new Set<OrderStatus>([
  ...ACTIVE_ORDER_STATUSES,
]);

const activeServiceRequestStatusSet = new Set<ServiceRequestStatus>([
  ...ACTIVE_SERVICE_REQUEST_STATUSES,
]);

function isActiveOrderStatus(status: OrderStatus) {
  return activeOrderStatusSet.has(status);
}

function isActiveServiceRequestStatus(status: ServiceRequestStatus) {
  return activeServiceRequestStatusSet.has(status);
}

type ActivityOrder = Prisma.OrderGetPayload<{
  select: typeof orderSelect;
}>;

function buildOrderAgainItems(pastOrders: ActivityOrder[]) {
  const productMap = new Map<
    string,
    {
      productId: string;
      productName: string;
      timesOrdered: number;
      totalQuantity: number;
      lastOrderedAt: Date;
    }
  >();

  for (const order of pastOrders) {
    for (const item of order.items) {
      if (!item.productId) {
        continue;
      }

      const current = productMap.get(item.productId);

      if (current) {
        current.timesOrdered += 1;
        current.totalQuantity += item.quantity;

        if (order.createdAt > current.lastOrderedAt) {
          current.lastOrderedAt = order.createdAt;
        }

        continue;
      }

      productMap.set(item.productId, {
        productId: item.productId,
        productName: item.productNameSnapshot,
        timesOrdered: 1,
        totalQuantity: item.quantity,
        lastOrderedAt: order.createdAt,
      });
    }
  }

  return Array.from(productMap.values())
    .sort((a, b) => {
      if (b.timesOrdered !== a.timesOrdered) {
        return b.timesOrdered - a.timesOrdered;
      }

      return b.lastOrderedAt.getTime() - a.lastOrderedAt.getTime();
    })
    .slice(0, 6);
}

export async function getGuestPortalActivity(tagCode: string) {
  const identity = await getCurrentNfcGuestIdentity(tagCode);

  if (!identity.session) {
    return {
      hasSession: false as const,
      session: null,
      hotel: null,
      guestStay: null,
      guestMember: null,
      guestName: null,
      currentOrders: [],
      currentServiceRequests: [],
      pastOrders: [],
      pastServiceRequests: [],
      orderAgainItems: [],
      currentActiveOrderCount: 0,
      currentActiveServiceRequestCount: 0,
    };
  }

  const currentOrderWhere: Prisma.OrderWhereInput = {
    hotelId: identity.session.hotelId,
    ...(identity.guestStayId
      ? {
          guestStayId: identity.guestStayId,
        }
      : {
          guestSessionId: identity.session.id,
        }),
  };

  const currentServiceRequestWhere: Prisma.ServiceRequestWhereInput = {
    hotelId: identity.session.hotelId,
    ...(identity.guestStayId
      ? {
          guestStayId: identity.guestStayId,
        }
      : {
          guestSessionId: identity.session.id,
        }),
  };

  const excludeCurrentOrderFilters: Prisma.OrderWhereInput[] = [
    {
      guestSessionId: identity.session.id,
    },
  ];

  const excludeCurrentServiceFilters: Prisma.ServiceRequestWhereInput[] = [
    {
      guestSessionId: identity.session.id,
    },
  ];

  if (identity.guestStayId) {
    excludeCurrentOrderFilters.push({
      guestStayId: identity.guestStayId,
    });

    excludeCurrentServiceFilters.push({
      guestStayId: identity.guestStayId,
    });
  }

  const pastOrderWhere: Prisma.OrderWhereInput | null = identity.guestMemberId
    ? {
        hotelId: identity.session.hotelId,
        guestMemberId: identity.guestMemberId,
        NOT: excludeCurrentOrderFilters,
      }
    : null;

  const pastServiceRequestWhere: Prisma.ServiceRequestWhereInput | null =
    identity.guestMemberId
      ? {
          hotelId: identity.session.hotelId,
          guestMemberId: identity.guestMemberId,
          NOT: excludeCurrentServiceFilters,
        }
      : null;

  const [
    hotel,
    guestStay,
    currentOrders,
    currentServiceRequests,
    pastOrders,
    pastServiceRequests,
  ] = await Promise.all([
    db.hotel.findUnique({
      where: {
        id: identity.session.hotelId,
      },
      select: {
        id: true,
        name: true,
        logoUrl: true,
      },
    }),

    identity.guestStayId
      ? db.guestStay.findUnique({
          where: {
            id: identity.guestStayId,
          },
          select: {
            id: true,
            checkInAt: true,
            expectedCheckOutAt: true,
            checkedOutAt: true,
            maxDevices: true,
            status: true,
            room: {
              select: {
                id: true,
                number: true,
                name: true,
              },
            },
            guestMember: {
              select: {
                id: true,
                name: true,
                phone: true,
                email: true,
              },
            },
            devices: {
              where: {
                revokedAt: null,
              },
              select: {
                id: true,
              },
            },
          },
        })
      : Promise.resolve(null),

    db.order.findMany({
      where: currentOrderWhere,
      select: orderSelect,
      orderBy: {
        createdAt: 'desc',
      },
      take: 20,
    }),

    db.serviceRequest.findMany({
      where: currentServiceRequestWhere,
      select: serviceRequestSelect,
      orderBy: {
        createdAt: 'desc',
      },
      take: 20,
    }),

    pastOrderWhere
      ? db.order.findMany({
          where: pastOrderWhere,
          select: orderSelect,
          orderBy: {
            createdAt: 'desc',
          },
          take: 20,
        })
      : Promise.resolve([]),

    pastServiceRequestWhere
      ? db.serviceRequest.findMany({
          where: pastServiceRequestWhere,
          select: serviceRequestSelect,
          orderBy: {
            createdAt: 'desc',
          },
          take: 20,
        })
      : Promise.resolve([]),
  ]);

      const currentActiveOrderCount = currentOrders.filter((order) =>
        isActiveOrderStatus(order.status)
      ).length;

      const currentActiveServiceRequestCount = currentServiceRequests.filter(
        (request) => isActiveServiceRequestStatus(request.status)
      ).length;

  return {
    hasSession: true as const,
    session: identity.session,
    hotel,
    guestStay,
    guestMember: guestStay?.guestMember ?? identity.guestMember,
    guestName:
      guestStay?.guestMember.name ??
      identity.guestName ??
      currentOrders[0]?.guestName ??
      currentServiceRequests[0]?.guestName ??
      null,
    currentOrders,
    currentServiceRequests,
    pastOrders,
    pastServiceRequests,
    orderAgainItems: buildOrderAgainItems(pastOrders),
    currentActiveOrderCount,
    currentActiveServiceRequestCount,
  };
}