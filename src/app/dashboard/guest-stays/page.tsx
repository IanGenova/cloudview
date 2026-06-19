import { GuestPointLedgerStatus, Role } from '@prisma/client';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { GuestStaysClient } from './GuestStaysClient';

export const dynamic = 'force-dynamic';

function buildLedgerMap<
  T extends {
    guestStayId: string | null;
  },
>(ledgers: T[]) {
  const map = new Map<string, T[]>();

  for (const ledger of ledgers) {
    if (!ledger.guestStayId) {
      continue;
    }

    const current = map.get(ledger.guestStayId) ?? [];
    current.push(ledger);
    map.set(ledger.guestStayId, current);
  }

  return map;
}

function sumLedgerPoints(
  ledgers: Array<{
    status: GuestPointLedgerStatus;
    points: number;
  }>,
  options: {
    status: GuestPointLedgerStatus;
    positiveOnly?: boolean;
    negativeOnly?: boolean;
  }
) {
  return ledgers.reduce((sum, ledger) => {
    if (ledger.status !== options.status) {
      return sum;
    }

    if (options.positiveOnly && ledger.points <= 0) {
      return sum;
    }

    if (options.negativeOnly && ledger.points >= 0) {
      return sum;
    }

    return sum + ledger.points;
  }, 0);
}

export default async function GuestStaysPage() {
  const user = await requireUser();

  const hotels = await db.hotel.findMany({
    where:
      user.role === Role.SUPER_ADMIN
        ? {
            isActive: true,
          }
        : user.hotelId
          ? {
              id: user.hotelId,
            }
          : {
              id: '__NO_ACCESS__',
            },
    select: {
      id: true,
      name: true,
    },
    orderBy: {
      name: 'asc',
    },
  });

  const hotelIds = hotels.map((hotel) => hotel.id);
  const defaultHotelId = hotels[0]?.id ?? '';

  const scopedHotelWhere =
    user.role === Role.SUPER_ADMIN
      ? {
          hotelId: {
            in: hotelIds.length ? hotelIds : ['__NO_ACCESS__'],
          },
        }
      : {
          hotelId: user.hotelId || '__NO_ACCESS__',
        };

  const [rooms, guestStays] = await Promise.all([
    db.room.findMany({
      where: {
        ...scopedHotelWhere,
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true,
        hotelId: true,
        number: true,
        name: true,
        floor: true,
      },
      orderBy: {
        number: 'asc',
      },
    }),

    db.guestStay.findMany({
      where: scopedHotelWhere,
      include: {
        hotel: {
          select: {
            name: true,
          },
        },
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
            pointAccount: {
              select: {
                availablePoints: true,
                pendingPoints: true,
                lifetimeEarnedPoints: true,
                lifetimeRedeemedPoints: true,
              },
            },
          },
        },
        devices: {
          select: {
            id: true,
            revokedAt: true,
          },
        },
        _count: {
          select: {
            orders: true,
            serviceRequests: true,
          },
        },
      },
      orderBy: {
        checkInAt: 'desc',
      },
      take: 50,
    }),
  ]);

  const guestStayIds = guestStays.map((stay) => stay.id);

  const pointLedgers = guestStayIds.length
    ? await db.guestPointLedger.findMany({
        where: {
          guestStayId: {
            in: guestStayIds,
          },
        },
        select: {
          id: true,
          guestStayId: true,
          type: true,
          status: true,
          points: true,
          source: true,
          referenceId: true,
          description: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 300,
      })
    : [];

  const ledgerMap = buildLedgerMap(pointLedgers);

  return (
    <div className="space-y-7">
      <PageHeader
        title="Guest Stays"
        description="Create check-ins, generate room passcodes, limit authorized devices, and track active room stays."
      />

      <GuestStaysClient
        hotels={hotels}
        rooms={rooms.map((room) => ({
          id: room.id,
          hotelId: room.hotelId,
          number: room.number,
          name: room.name,
          floor: room.floor ?? '',
        }))}
        guestStays={guestStays.map((stay) => {
          const stayLedgers = ledgerMap.get(stay.id) ?? [];

          return {
            id: stay.id,
            hotelId: stay.hotelId,
            hotelName: stay.hotel.name,
            roomId: stay.roomId,
            roomNumber: stay.room.number,
            roomName: stay.room.name ?? '',
            guestName: stay.guestMember.name,
            guestPhone: stay.guestMember.phone ?? '',
            guestEmail: stay.guestMember.email ?? '',
            maxDevices: stay.maxDevices,
            activeDevices: stay.devices.filter((device) => !device.revokedAt)
              .length,
            orderCount: stay._count.orders,
            serviceRequestCount: stay._count.serviceRequests,
            checkInAt: stay.checkInAt.toISOString(),
            expectedCheckOutAt: stay.expectedCheckOutAt
              ? stay.expectedCheckOutAt.toISOString()
              : null,
            checkedOutAt: stay.checkedOutAt
              ? stay.checkedOutAt.toISOString()
              : null,
            status: stay.status,

            availablePoints:
              stay.guestMember.pointAccount?.availablePoints ?? 0,
            pendingPoints: stay.guestMember.pointAccount?.pendingPoints ?? 0,
            lifetimeEarnedPoints:
              stay.guestMember.pointAccount?.lifetimeEarnedPoints ?? 0,
            lifetimeRedeemedPoints:
              stay.guestMember.pointAccount?.lifetimeRedeemedPoints ?? 0,

            confirmedStayPoints: sumLedgerPoints(stayLedgers, {
              status: GuestPointLedgerStatus.CONFIRMED,
              positiveOnly: true,
            }),
            pendingStayPoints: sumLedgerPoints(stayLedgers, {
              status: GuestPointLedgerStatus.PENDING,
              positiveOnly: true,
            }),
            voidedStayPoints: Math.abs(
              sumLedgerPoints(stayLedgers, {
                status: GuestPointLedgerStatus.CONFIRMED,
                negativeOnly: true,
              })
            ),
            netStayPoints: sumLedgerPoints(stayLedgers, {
              status: GuestPointLedgerStatus.CONFIRMED,
            }),

            recentPointLedgers: stayLedgers.slice(0, 6).map((ledger) => ({
              id: ledger.id,
              type: ledger.type,
              status: ledger.status,
              points: ledger.points,
              source: ledger.source,
              referenceId: ledger.referenceId ?? '',
              description: ledger.description ?? '',
              createdAt: ledger.createdAt.toISOString(),
            })),
          };
        })}
        defaultHotelId={defaultHotelId}
        isSuperAdmin={user.role === Role.SUPER_ADMIN}
      />
    </div>
  );
}