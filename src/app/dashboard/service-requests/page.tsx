import { ServiceRequestStatus } from '@prisma/client';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { RealtimeServiceRequestsRefresh } from '@/components/dashboard/RealtimeServiceRequestsRefresh';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
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
        'Service request order was cancelled successfully.',
      'request-item-cancelled':
        'Service request item was cancelled successfully. Inventory and charges were updated.',
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

export default async function ServiceRequestsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    success?: string;
    error?: string;
  }>;
}) {
  const user = await requireUser();
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

  const groupedRequestsMap = new Map<string, typeof requests>();

  for (const request of requests) {
    const groupKey = `${request.hotelId}:${request.requestCode}`;
    const group = groupedRequestsMap.get(groupKey) ?? [];

    group.push(request);
    groupedRequestsMap.set(groupKey, group);
  }

  const groupedRequests = Array.from(groupedRequestsMap.entries()).map(
    ([groupKey, group]) => {
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
        status: groupStatus,
        assignedToId: assignedIds.length === 1 ? assignedIds[0] : '',
        assignedToName:
          assignedNames.length === 1
            ? assignedNames[0]
            : assignedNames.length > 1
              ? 'Multiple staff'
              : '',
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
    }
  );

  const totalBilledAmount = charges.reduce(
    (sum, charge) => sum + Number(charge.totalAmount),
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