import { NextResponse } from 'next/server';
import {
  FulfillmentTiming,
  OrderStatus,
  ScheduledReleaseStatus,
  ServiceRequestStatus,
} from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { triggerKitchenOrderCreated } from '@/lib/realtime/kitchen-events';
import { triggerServiceRequestCreated } from '@/lib/realtime/service-request-events';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ORDER_RELEASE_BATCH_SIZE = 50;
const SERVICE_RELEASE_BATCH_SIZE = 100;

const releasableOrderStatuses = [
  OrderStatus.PENDING,
  OrderStatus.ACCEPTED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
] as const;

const releasableServiceStatuses = [
  ServiceRequestStatus.NEW,
  ServiceRequestStatus.IN_PROGRESS,
] as const;

function getRequestSecret(request: Request) {
  const authorization = request.headers.get('authorization') || '';

  if (authorization.toLowerCase().startsWith('bearer ')) {
    return authorization.slice('bearer '.length).trim();
  }

  return request.headers.get('x-cron-secret')?.trim() || '';
}

function isAuthorized(request: Request) {
  const expectedSecret = process.env.SCHEDULED_RELEASE_CRON_SECRET?.trim();

  /**
   * Local/dev convenience:
   * If no secret is configured, allow the route.
   * In production, always set SCHEDULED_RELEASE_CRON_SECRET.
   */
  if (!expectedSecret) {
    return true;
  }

  return getRequestSecret(request) === expectedSecret;
}

function formatReleaseNote({
  type,
  scheduledFor,
  releaseAt,
}: {
  type: 'order' | 'service';
  scheduledFor: Date | null;
  releaseAt: Date | null;
}) {
  const label = type === 'order' ? 'Scheduled food order' : 'Scheduled service request';

  return [
    `${label} released automatically.`,
    scheduledFor ? `Scheduled for: ${scheduledFor.toISOString()}.` : null,
    releaseAt ? `Release time: ${releaseAt.toISOString()}.` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

async function releaseScheduledOrders(now: Date) {
  const dueOrders = await db.order.findMany({
    where: {
      fulfillmentTiming: FulfillmentTiming.SCHEDULED,
      scheduledReleaseStatus: ScheduledReleaseStatus.SCHEDULED,
      releasedAt: null,
      status: {
        in: [...releasableOrderStatuses],
      },
      OR: [
        {
          releaseAt: {
            lte: now,
          },
        },
        {
          releaseAt: null,
          scheduledFor: {
            lte: now,
          },
        },
      ],
    },
    select: {
      id: true,
      hotelId: true,
      orderCode: true,
      status: true,
      scheduledFor: true,
      releaseAt: true,
    },
    orderBy: [
      {
        releaseAt: 'asc',
      },
      {
        scheduledFor: 'asc',
      },
      {
        createdAt: 'asc',
      },
    ],
    take: ORDER_RELEASE_BATCH_SIZE,
  });

  const released: string[] = [];
  const failed: { id: string; code: string; error: string }[] = [];

  for (const order of dueOrders) {
    try {
      const releasedOrder = await db.order.update({
        where: {
          id: order.id,
        },
        data: {
          releaseAt: order.releaseAt ?? now,
          releasedAt: now,
          scheduledReleaseStatus: ScheduledReleaseStatus.RELEASED,
          statusHistory: {
            create: {
              status: order.status,
              note: formatReleaseNote({
                type: 'order',
                scheduledFor: order.scheduledFor,
                releaseAt: order.releaseAt ?? now,
              }),
            },
          },
        },
        select: {
          id: true,
          hotelId: true,
          orderCode: true,
          status: true,
        },
      });

      await triggerKitchenOrderCreated({
        hotelId: releasedOrder.hotelId,
        orderCode: releasedOrder.orderCode,
        status: releasedOrder.status,
        /**
         * Keep this as GUEST_PORTAL to match your existing realtime source types.
         * If your source type already supports SCHEDULED_RELEASE, you may change it later.
         */
        source: 'GUEST_PORTAL',
      });

      released.push(releasedOrder.orderCode);
    } catch (error) {
      failed.push({
        id: order.id,
        code: order.orderCode,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return {
    scanned: dueOrders.length,
    released,
    failed,
  };
}

async function releaseScheduledServiceRequests(now: Date) {
  const dueRequests = await db.serviceRequest.findMany({
    where: {
      fulfillmentTiming: FulfillmentTiming.SCHEDULED,
      scheduledReleaseStatus: ScheduledReleaseStatus.SCHEDULED,
      releasedAt: null,
      status: {
        in: [...releasableServiceStatuses],
      },
      OR: [
        {
          releaseAt: {
            lte: now,
          },
        },
        {
          releaseAt: null,
          scheduledFor: {
            lte: now,
          },
        },
      ],
    },
    select: {
      id: true,
      hotelId: true,
      requestCode: true,
      status: true,
      scheduledFor: true,
      releaseAt: true,
    },
    orderBy: [
      {
        releaseAt: 'asc',
      },
      {
        scheduledFor: 'asc',
      },
      {
        createdAt: 'asc',
      },
    ],
    take: SERVICE_RELEASE_BATCH_SIZE,
  });

  const released: string[] = [];
  const failed: { id: string; code: string; error: string }[] = [];

  for (const request of dueRequests) {
    try {
      const releasedRequest = await db.serviceRequest.update({
        where: {
          id: request.id,
        },
        data: {
          releaseAt: request.releaseAt ?? now,
          releasedAt: now,
          scheduledReleaseStatus: ScheduledReleaseStatus.RELEASED,
          statusHistory: {
            create: {
              status: request.status,
              note: formatReleaseNote({
                type: 'service',
                scheduledFor: request.scheduledFor,
                releaseAt: request.releaseAt ?? now,
              }),
            },
          },
        },
        select: {
          id: true,
          hotelId: true,
          requestCode: true,
          status: true,
        },
      });

      await triggerServiceRequestCreated({
        hotelId: releasedRequest.hotelId,
        requestId: releasedRequest.id,
        requestCode: releasedRequest.requestCode,
        status: releasedRequest.status,
      });

      released.push(releasedRequest.requestCode);
    } catch (error) {
      failed.push({
        id: request.id,
        code: request.requestCode,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return {
    scanned: dueRequests.length,
    released,
    failed,
  };
}

async function handleReleaseScheduled(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Unauthorized scheduled release request.',
      },
      {
        status: 401,
      }
    );
  }

  const now = new Date();

  const [orders, serviceRequests] = await Promise.all([
    releaseScheduledOrders(now),
    releaseScheduledServiceRequests(now),
  ]);

  if (orders.released.length > 0) {
    revalidatePath('/dashboard/kitchen');
    revalidatePath('/dashboard/orders');
  }

  if (serviceRequests.released.length > 0) {
    revalidatePath('/dashboard/service-requests');
  }

  return NextResponse.json({
    ok: true,
    now: now.toISOString(),
    orders,
    serviceRequests,
  });
}

export async function GET(request: Request) {
  return handleReleaseScheduled(request);
}

export async function POST(request: Request) {
  return handleReleaseScheduled(request);
}