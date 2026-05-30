import { ServiceRequestStatus } from '@prisma/client';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { RealtimeServiceRequestsRefresh } from '@/components/dashboard/RealtimeServiceRequestsRefresh';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { ServiceRequestsClient } from './ServiceRequestsClient';

export const dynamic = 'force-dynamic';

export default async function ServiceRequestsPage() {
  const user = await requireUser();

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
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 120,
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

  const totalBilledAmount = charges.reduce(
    (sum, charge) => sum + Number(charge.totalAmount),
    0
  );

  const billedCount = requests.filter((request) =>
    chargesByRequestId.has(request.id)
  ).length;

  const notBilledCount = requests.length - billedCount;

  const liveStatuses = [
    ServiceRequestStatus.NEW,
    ServiceRequestStatus.IN_PROGRESS,
  ];

  const liveCount = requests.filter((request) =>
    liveStatuses.includes(request.status)
  ).length;

  return (
    <div>
      <RealtimeServiceRequestsRefresh />

      <PageHeader
        title="Service Requests & Room Add-ons"
        description="Manage guest requests, staff assignment, and billable room add-ons in realtime."
      />

      <ServiceRequestsClient
        statuses={Object.values(ServiceRequestStatus)}
        staff={staff.map((staffMember) => ({
          id: staffMember.id,
          name: staffMember.name ?? staffMember.email,
        }))}
        summary={{
          totalRequests: requests.length,
          liveRequests: liveCount,
          billedRequests: billedCount,
          notBilledRequests: notBilledCount,
          totalBilledAmount,
        }}
        requests={requests.map((request) => {
          const charge = chargesByRequestId.get(request.id);

          return {
            id: request.id,
            requestCode: request.requestCode,
            hotelName: request.hotel.name,
            roomLabel: request.room
              ? `Room ${request.room.number}`
              : request.location?.name ?? 'Guest location',
            guestName: request.guestName ?? '',
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
                  paymentStatus: charge.paymentStatus,
                }
              : null,
          };
        })}
      />
    </div>
  );
}