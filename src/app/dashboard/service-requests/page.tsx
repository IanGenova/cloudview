import {
  DashboardModule,
  FulfillmentTiming,
  ScheduledReleaseStatus,
  ServiceRequestStatus,
} from '@prisma/client';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { RealtimeServiceRequestsRefresh } from '@/components/dashboard/RealtimeServiceRequestsRefresh';
import { db } from '@/lib/db';
import { requireDashboardPermission } from '@/lib/dashboard-permissions';
import { ServiceRequestsClient } from './ServiceRequestsClient';

export const dynamic = 'force-dynamic';

const liveStatuses: ServiceRequestStatus[] = [
  ServiceRequestStatus.NEW,
  ServiceRequestStatus.IN_PROGRESS,
];

function getServiceRequestsMessage(success?: string, error?: string) {
  if (success) {
    const messages: Record<string, string> = {
      'request-updated': 'Service request order was updated successfully.',
      'request-started': 'Service request order moved to In Progress.',
      'request-completed': 'Service request order was marked as completed.',
      'request-cancelled':
        'Service request order was cancelled. Inventory was restored and eligible Xendit refunds were submitted.',
      'request-item-cancelled':
        'Service request item was cancelled. Inventory, charges, and eligible Xendit refunds were updated.',
      'charge-updated': 'Room add-on charge was added or updated successfully.',
      'request-created': 'Service request was added successfully.',
    };

    return {
      type: 'success' as const,
      text: messages[success] ?? 'Action completed successfully.',
    };
  }

  if (error) {
    const messages: Record<string, string> = {
      'invalid-request-update': 'Invalid service request update.',
      'request-not-found': 'Service request was not found.',
      'invalid-charge-request': 'Invalid charge request item.',
      'no-room': 'A room is required before posting a room add-on charge.',
      'item-required': 'Charge item name is required.',
      'quantity-required': 'Charge quantity is required.',
      'unit-price-required': 'Charge unit price is required.',
      'request-required': 'Service request item is required.',
      'request-item-not-cancellable':
        'Only NEW service request items can be cancelled.',
    };

    return {
      type: 'error' as const,
      text: messages[error] ?? 'Something went wrong.',
    };
  }

  return null;
}

function getGroupStatus(statuses: ServiceRequestStatus[]) {
  if (statuses.includes(ServiceRequestStatus.NEW)) {
    return ServiceRequestStatus.NEW;
  }

  if (statuses.includes(ServiceRequestStatus.IN_PROGRESS)) {
    return ServiceRequestStatus.IN_PROGRESS;
  }

  if (statuses.every((status) => status === ServiceRequestStatus.COMPLETED)) {
    return ServiceRequestStatus.COMPLETED;
  }

  if (statuses.every((status) => status === ServiceRequestStatus.CANCELLED)) {
    return ServiceRequestStatus.CANCELLED;
  }

  if (statuses.includes(ServiceRequestStatus.COMPLETED)) {
    return ServiceRequestStatus.COMPLETED;
  }

  return statuses[0] ?? ServiceRequestStatus.NEW;
}

type ScheduledServiceRequestGroup = {
  id: string;
  hotelId: string;
  requestCode: string;
  hotelName: string;
  roomLabel: string;
  guestName: string;
  status: ServiceRequestStatus;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
  scheduledFor: string | null;
  releaseAt: string | null;
  releasedAt: string | null;
  scheduledNote: string;
  items: {
    id: string;
    type: string;
    notes: string;
    status: ServiceRequestStatus;
  }[];
};

function formatScheduleDateTime(value: string | null) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  }).format(date);
}

function ScheduledServiceRequestsPanel({
  requests,
}: {
  requests: ScheduledServiceRequestGroup[];
}) {
  if (!requests.length) {
    return null;
  }

  return (
    <section className="mb-6 rounded-[2rem] border border-amber-200 bg-amber-50 p-5 text-amber-950 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-700 dark:text-amber-200">
            Upcoming
          </p>

          <h2 className="mt-1 text-2xl font-black">
            Scheduled Service Requests
          </h2>

          <p className="mt-1 text-sm font-semibold opacity-70">
            These requests are saved but not yet released to staff workflow.
          </p>
        </div>

        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-amber-600 text-sm font-black text-white">
          {requests.length}
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {requests.map((request) => (
          <article
            key={request.id}
            className="rounded-[1.5rem] border border-amber-200 bg-white/75 p-4 shadow-sm dark:border-amber-500/20 dark:bg-black/20"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-lg font-black">
                  {request.requestCode}
                </h3>

                <p className="mt-1 truncate text-xs font-bold opacity-70">
                  {request.roomLabel} · {request.guestName || 'Guest'}
                </p>

                <p className="mt-1 truncate text-xs font-semibold opacity-60">
                  {request.hotelName}
                </p>
              </div>

              <span className="shrink-0 rounded-full bg-amber-600 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-white">
                Scheduled
              </span>
            </div>

            <div className="mt-4 grid gap-2 rounded-2xl bg-amber-100/70 p-3 text-xs dark:bg-amber-500/10">
              <p>
                <b>Scheduled For:</b>{' '}
                {formatScheduleDateTime(request.scheduledFor)}
              </p>

              <p>
                <b>Release At:</b>{' '}
                {formatScheduleDateTime(request.releaseAt)}
              </p>

              <p>
                <b>Items:</b> {request.itemCount}
              </p>
            </div>

            <div className="mt-4 space-y-1">
              {request.items.slice(0, 3).map((item) => (
                <p key={item.id} className="text-xs font-bold opacity-80">
                  • {item.type}
                </p>
              ))}

              {request.items.length > 3 ? (
                <p className="text-xs font-black opacity-60">
                  +{request.items.length - 3} more item
                  {request.items.length - 3 === 1 ? '' : 's'}
                </p>
              ) : null}
            </div>

            {request.scheduledNote ? (
              <p className="mt-4 rounded-2xl bg-amber-100/70 p-3 text-xs font-semibold dark:bg-amber-500/10">
                <b>Schedule note:</b> {request.scheduledNote}
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

export default async function ServiceRequestsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    success?: string;
    error?: string;
  }>;
}) {
  const user = await requireDashboardPermission(
    DashboardModule.SERVICE_REQUESTS,
    'canView'
  );
  const params = await searchParams;
  const message = getServiceRequestsMessage(params?.success, params?.error);

  const where = user.role === 'SUPER_ADMIN' ? {} : { hotelId: user.hotelId! };

  const [requests, staff] = await Promise.all([
    db.serviceRequest.findMany({
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
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        guestXenditSession: {
          select: {
            id: true,
            status: true,
            refundStatus: true,
            refundedAmountCents: true,
            refundErrorMessage: true,
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
        attachments: {
          orderBy: {
            createdAt: 'asc',
          },
          select: {
            id: true,
            imageUrl: true,
            originalName: true,
            mimeType: true,
            sizeBytes: true,
            caption: true,
            attachmentType: true,
            uploadedByGuest: true,
            createdAt: true,
            uploadedBy: {
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
      take: 250,
    }),

    db.user.findMany({
      where:
        user.role === 'SUPER_ADMIN'
          ? {
              role: {
                in: ['STAFF', 'HOTEL_ADMIN'],
              },
            }
          : {
              hotelId: user.hotelId!,
              role: {
                in: ['STAFF', 'HOTEL_ADMIN'],
              },
            },
      select: {
        id: true,
        name: true,
        email: true,
      },
      orderBy: {
        name: 'asc',
      },
    }),
  ]);

  const requestIds = requests.map((request) => request.id);

  const charges = requestIds.length
    ? await db.roomAddOnCharge.findMany({
        where: {
          serviceRequestId: {
            in: requestIds,
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      })
    : [];

  const chargesByRequestId = new Map(
    charges.map((charge) => [charge.serviceRequestId, charge])
  );

  function mapAttachment(
    attachment: (typeof requests)[number]['attachments'][number]
  ) {
    return {
      id: attachment.id,
      imageUrl: attachment.imageUrl,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      caption: attachment.caption,
      attachmentType: attachment.attachmentType,
      uploadedByGuest: attachment.uploadedByGuest,
      uploadedByName:
        attachment.uploadedBy?.name ?? attachment.uploadedBy?.email ?? null,
      createdAt: attachment.createdAt.toISOString(),
    };
  }

  function isUnreleasedScheduledRequest(request: (typeof requests)[number]) {
  return (
    request.fulfillmentTiming === FulfillmentTiming.SCHEDULED &&
    request.releasedAt === null &&
    request.scheduledReleaseStatus === ScheduledReleaseStatus.SCHEDULED
  );
}

const activeSourceRequests = requests.filter(
  (request) => !isUnreleasedScheduledRequest(request)
);

const scheduledSourceRequests = requests.filter(isUnreleasedScheduledRequest);

function buildGroupedRequests(sourceRequests: typeof requests) {
  const groupedRequestsMap = new Map<string, typeof requests>();

  for (const request of sourceRequests) {
    const groupKey = `${request.hotelId}:${request.requestCode}`;
    const group = groupedRequestsMap.get(groupKey) ?? [];

    group.push(request);
    groupedRequestsMap.set(groupKey, group);
  }

  return Array.from(groupedRequestsMap.entries()).map(([groupKey, group]) => {
    const sortedGroup = [...group].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );

    const first = sortedGroup[0];
    const statuses = sortedGroup.map((request) => request.status);
    const groupStatus = getGroupStatus(statuses);

    const groupCharges = sortedGroup
      .map((request) => chargesByRequestId.get(request.id))
      .filter(Boolean);

    const totalChargeAmount = groupCharges.reduce(
      (sum, charge) => sum + Number(charge?.totalAmount ?? 0),
      0
    );

    const assignedNames = Array.from(
      new Set(
        sortedGroup
          .map(
            (request) =>
              request.assignedTo?.name ?? request.assignedTo?.email ?? ''
          )
          .filter(Boolean)
      )
    );

    const assignedIds = Array.from(
      new Set(
        sortedGroup
          .map((request) => request.assignedToId ?? '')
          .filter(Boolean)
      )
    );

    const groupAttachments = Array.from(
      new Map(
        sortedGroup
          .flatMap((request) => request.attachments.map(mapAttachment))
          .map((attachment) => [attachment.id, attachment])
      ).values()
    );

    return {
      id: groupKey,
      hotelId: first.hotelId,
      requestCode: first.requestCode,
      hotelName: first.hotel.name,
      roomLabel: first.room
        ? `Room ${first.room.number}`
        : first.location?.name ?? 'Guest location',
      guestName: first.guestName ?? '',
      guestPhone: first.guestPhone ?? '',
      status: groupStatus,
      assignedToId: assignedIds.length === 1 ? assignedIds[0] : '',
      assignedToName:
        assignedNames.length === 1
          ? assignedNames[0]
          : assignedNames.length > 1
            ? 'Multiple staff'
            : '',

      fulfillmentTiming: first.fulfillmentTiming,
      scheduledFor: first.scheduledFor?.toISOString() ?? null,
      releaseAt: first.releaseAt?.toISOString() ?? null,
      releasedAt: first.releasedAt?.toISOString() ?? null,
      scheduledReleaseStatus: first.scheduledReleaseStatus,
      scheduledNote: first.scheduledNote ?? '',

      createdAt: first.createdAt.toISOString(),
      updatedAt: sortedGroup
        .reduce(
          (latest, request) =>
            request.updatedAt.getTime() > latest.getTime()
              ? request.updatedAt
              : latest,
          first.updatedAt
        )
        .toISOString(),
      itemCount: sortedGroup.length,
      billedCount: groupCharges.length,
      xenditPaidCount: sortedGroup.filter(
        (request) =>
          request.paymentMethod === 'XENDIT' &&
          request.paymentStatus === 'PAID'
      ).length,
      refundPendingCount: sortedGroup.filter(
        (request) => request.paymentStatus === 'REFUND_PENDING'
      ).length,
      refundedCount: sortedGroup.filter(
        (request) => request.paymentStatus === 'REFUNDED'
      ).length,
      totalXenditAmountCents: sortedGroup.reduce(
        (sum, request) =>
          sum + (request.paymentMethod === 'XENDIT' ? request.amountCents : 0),
        0
      ),
      totalChargeAmount,
      attachments: groupAttachments,
      items: sortedGroup.map((request) => {
        const charge = chargesByRequestId.get(request.id);

        return {
          id: request.id,
          requestCode: request.requestCode,
          type: request.type,
          notes: request.notes ?? '',
          status: request.status,
          assignedToId: request.assignedToId ?? '',
          assignedToName:
            request.assignedTo?.name ?? request.assignedTo?.email ?? '',
          createdAt: request.createdAt.toISOString(),
          billingMode: request.billingModeSnapshot,
          quantity: request.quantity,
          unitPriceCents: request.unitPriceCents,
          amountCents: request.amountCents,
          paymentMethod: request.paymentMethod,
          paymentStatus: request.paymentStatus,
          xenditStatus: request.guestXenditSession?.status ?? null,
          refundStatus: request.guestXenditSession?.refundStatus ?? null,
          refundedAmountCents:
            request.guestXenditSession?.refundedAmountCents ?? 0,
          refundErrorMessage:
            request.guestXenditSession?.refundErrorMessage ?? '',
          charge: charge
            ? {
                id: charge.id,
                chargeCode: charge.chargeCode,
                itemName: charge.itemName,
                description: charge.description ?? '',
                quantity: charge.quantity,
                unitPrice: Number(charge.unitPrice),
                totalAmount: Number(charge.totalAmount),
                paymentStatus: 'POSTED',
              }
            : null,
          statusHistory: request.statusHistory.map((history) => ({
            id: history.id,
            status: history.status,
            note: history.note ?? '',
            createdAt: history.createdAt.toISOString(),
            userName: history.user?.name ?? history.user?.email ?? '',
          })),
          attachments: request.attachments.map(mapAttachment),
        };
      }),
    };
  });
}

const groupedRequests = buildGroupedRequests(activeSourceRequests);
const scheduledGroupedRequests = buildGroupedRequests(scheduledSourceRequests);

const totalBilledAmount = groupedRequests.reduce(
  (sum, request) => sum + request.totalChargeAmount,
  0
);

  const billedCount = groupedRequests.filter(
    (request) => request.billedCount > 0
  ).length;

  const notBilledCount = groupedRequests.length - billedCount;

  const liveCount = groupedRequests.filter((request) =>
    liveStatuses.includes(request.status)
  ).length;

  return (
    <div>
      <RealtimeServiceRequestsRefresh />

      <PageHeader
        title="Service Requests & Room Add-ons"
        description="Manage grouped guest service orders, staff assignment, and billable room add-ons in realtime."
      />

      <ScheduledServiceRequestsPanel
        requests={scheduledGroupedRequests as ScheduledServiceRequestGroup[]}
      />


      <ServiceRequestsClient
        message={message}
        statuses={Object.values(ServiceRequestStatus)}
        staff={staff.map((staffMember) => ({
          id: staffMember.id,
          name: staffMember.name ?? staffMember.email,
        }))}
        summary={{
          totalRequests: groupedRequests.length,
          liveRequests: liveCount,
          billedRequests: billedCount,
          notBilledRequests: notBilledCount,
          totalBilledAmount,
        }}
        requests={groupedRequests}
      />
    </div>
  );
}