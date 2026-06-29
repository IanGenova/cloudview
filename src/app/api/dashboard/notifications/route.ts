import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import {
  getUnreadDashboardNotificationCount,
  getUnreadDashboardNotifications,
} from '@/lib/dashboard-notifications';

export async function GET() {
  const user = await requireUser();

  const [notifications, unreadCount] = await Promise.all([
    getUnreadDashboardNotifications(user, 50),
    getUnreadDashboardNotificationCount(user),
  ]);

  return NextResponse.json({
    ok: true,
    unreadCount,
    notifications: notifications.map((notification) => ({
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      url: notification.url,
      isRead: notification.isRead,
      createdAt: notification.createdAt.toISOString(),
    })),
  });
}