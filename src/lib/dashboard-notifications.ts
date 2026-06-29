import type { Prisma, User } from '@prisma/client';
import { db } from '@/lib/db';

export type DashboardNotificationType =
  | 'ORDER_CREATED'
  | 'ORDER_UPDATED'
  | 'SERVICE_REQUEST_CREATED'
  | 'SERVICE_REQUEST_UPDATED'
  | 'LOW_STOCK'
  | 'POS_SALE'
  | 'SCHEDULED_RELEASED'
  | 'SYSTEM';

export async function createDashboardNotification({
  hotelId,
  userId,
  type,
  title,
  message,
  url,
  payload,
}: {
  hotelId?: string | null;
  userId?: string | null;
  type: DashboardNotificationType;
  title: string;
  message: string;
  url?: string | null;
  payload?: Prisma.InputJsonValue;
}) {
  return db.dashboardNotification.create({
    data: {
      hotelId: hotelId ?? null,
      userId: userId ?? null,
      type,
      title,
      message,
      url: url ?? null,
      payload: payload ?? undefined,
    },
  });
}

export function getNotificationScope(
  user: Pick<User, 'id' | 'role' | 'hotelId'>
) {
  if (user.role === 'SUPER_ADMIN') {
    return {
      OR: [
        {
          userId: user.id,
        },
        {
          userId: null,
        },
      ],
    };
  }

  return {
    OR: [
      {
        userId: user.id,
      },
      {
        userId: null,
        hotelId: user.hotelId,
      },
      {
        userId: null,
        hotelId: null,
      },
    ],
  };
}

export async function getUnreadDashboardNotifications(
  user: Pick<User, 'id' | 'role' | 'hotelId'>,
  limit = 50
) {
  return db.dashboardNotification.findMany({
    where: {
      isRead: false,
      ...getNotificationScope(user),
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: limit,
  });
}

export async function getUnreadDashboardNotificationCount(
  user: Pick<User, 'id' | 'role' | 'hotelId'>
) {
  return db.dashboardNotification.count({
    where: {
      isRead: false,
      ...getNotificationScope(user),
    },
  });
}