import {
  DashboardModule,
  GuestPointLedgerStatus,
  GuestStayFolioPaymentStatus,
  OrderStatus,
  PaymentStatus,
  Role,
  RoomAddOnPaymentStatus,
} from '@prisma/client';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { db } from '@/lib/db';
import { requireDashboardPermission } from '@/lib/dashboard-permissions';
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

function decimalToCents(value: unknown) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return 0;
  }

  return Math.round(amount * 100);
}

function getOrderOutstandingCents(order: {
  totalCents: number;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  items: Array<{
    quantity: number;
    unitPriceCents: number;
    cancelledQty: number;
    status: string;
  }>;
}) {
  if (order.paymentStatus === PaymentStatus.PAID) {
    return 0;
  }

  if (order.status === OrderStatus.CANCELLED) {
    return 0;
  }

  if (order.status !== OrderStatus.READY && order.status !== OrderStatus.DELIVERED) {
    return 0;
  }

  const originalItemSubtotal = order.items.reduce(
    (sum, item) => sum + item.quantity * item.unitPriceCents,
    0
  );

  const activeItemSubtotal = order.items.reduce((sum, item) => {
    if (item.status === 'CANCELLED') {
      return sum;
    }

    const activeQuantity = Math.max(item.quantity - item.cancelledQty, 0);

    return sum + activeQuantity * item.unitPriceCents;
  }, 0);

  if (activeItemSubtotal <= 0) {
    return 0;
  }

  if (originalItemSubtotal <= 0) {
    return order.totalCents;
  }

  return Math.round(order.totalCents * (activeItemSubtotal / originalItemSubtotal));
}


function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function snapshotText(value: unknown) {
  return typeof value === 'string' ? value : '';
}

type GuestStayDisplaySnapshot = {
  guestName: string;
  guestPhone: string;
  guestEmail: string;
  roomNumber: string;
  roomName: string;
};

function getGuestStayDisplaySnapshot(
  snapshotValue: unknown
): GuestStayDisplaySnapshot | null {
  if (!isJsonObject(snapshotValue)) {
    return null;
  }

  const snapshot = snapshotValue;
  const guest = isJsonObject(snapshot.guest) ? snapshot.guest : snapshot;
  const guestName = snapshotText(guest.name);

  if (!guestName) {
    return null;
  }

  return {
    guestName,
    guestPhone: snapshotText(guest.phone),
    guestEmail: snapshotText(guest.email),
    roomNumber:
      snapshotText(guest.roomNumber) || snapshotText(snapshot.roomNumber),
    roomName: snapshotText(guest.roomName) || snapshotText(snapshot.roomName),
  };
}

export default async function GuestStaysPage() {
  const user = await requireDashboardPermission(
    DashboardModule.GUEST_STAYS,
    'canView'
  );

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
      settings: {
        select: {
          nfcRoomPasscodeEnabled: true,
        },
      },
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
            settings: {
              select: {
                nfcRoomPasscodeEnabled: true,
              },
            },
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
        orders: {
          select: {
            id: true,
            orderCode: true,
            status: true,
            paymentStatus: true,
            totalCents: true,
            createdAt: true,
            items: {
              select: {
                id: true,
                productNameSnapshot: true,
                quantity: true,
                unitPriceCents: true,
                cancelledQty: true,
                status: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
        serviceRequests: {
          select: {
            id: true,
            requestCode: true,
            type: true,
            status: true,
            quantity: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
        folio: {
          select: {
            id: true,
            folioNumber: true,
            status: true,
            guestSnapshot: true,
            closedAt: true,
            receiptPrintedAt: true,
            receiptPrintCount: true,
            foodTotalCents: true,
            serviceTotalCents: true,
            manualChargeCents: true,
            discountCents: true,
            subtotalCents: true,
            paidCents: true,
            balanceDueCents: true,
            lines: {
              select: {
                id: true,
                lineType: true,
                lineStatus: true,
                title: true,
                description: true,
                quantity: true,
                unitAmountCents: true,
                amountCents: true,
                postedAt: true,
                sourceOrderId: true,
                sourceRoomAddOnChargeId: true,
              },
              orderBy: {
                postedAt: 'asc',
              },
            },
            payments: {
              where: {
                paymentStatus: GuestStayFolioPaymentStatus.POSTED,
              },
              select: {
                id: true,
                paymentMethod: true,
                amountCents: true,
                reference: true,
                note: true,
                paidAt: true,
                receivedBy: {
                  select: {
                    name: true,
                  },
                },
              },
              orderBy: {
                paidAt: 'asc',
              },
            },
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
  const serviceRequestIds = guestStays.flatMap((stay) =>
    stay.serviceRequests.map((request) => request.id)
  );

  const [pointLedgers, roomAddOnCharges] = await Promise.all([
    guestStayIds.length
      ? db.guestPointLedger.findMany({
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
      : Promise.resolve([]),

    serviceRequestIds.length
      ? db.roomAddOnCharge.findMany({
          where: {
            serviceRequestId: {
              in: serviceRequestIds,
            },
          },
          select: {
            id: true,
            chargeCode: true,
            serviceRequestId: true,
            itemName: true,
            description: true,
            quantity: true,
            unitPrice: true,
            totalAmount: true,
            paymentStatus: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        })
      : Promise.resolve([]),
  ]);

  const ledgerMap = buildLedgerMap(pointLedgers);

  const addOnChargeMap = new Map<string, typeof roomAddOnCharges>();

  for (const charge of roomAddOnCharges) {
    const current = addOnChargeMap.get(charge.serviceRequestId) ?? [];
    current.push(charge);
    addOnChargeMap.set(charge.serviceRequestId, current);
  }

  return (
    <div className="space-y-7">
      <PageHeader
        title="Guest Stays"
        description="Create check-ins, manage optional NFC room security codes, authorize devices, and track active room stays."
      />

      <GuestStaysClient
        hotels={hotels.map((hotel) => ({
          id: hotel.id,
          name: hotel.name,
          nfcRoomPasscodeEnabled:
            hotel.settings?.nfcRoomPasscodeEnabled ?? true,
        }))}
        rooms={rooms.map((room) => ({
          id: room.id,
          hotelId: room.hotelId,
          number: room.number,
          name: room.name,
          floor: room.floor ?? '',
        }))}
        guestStays={guestStays.map((stay) => {
          const stayLedgers = ledgerMap.get(stay.id) ?? [];

          const checkoutOrders = stay.orders.map((order) => ({
            id: order.id,
            orderCode: order.orderCode,
            status: order.status,
            paymentStatus: order.paymentStatus,
            createdAt: order.createdAt.toISOString(),
            amountCents: getOrderOutstandingCents(order),
            items: order.items.map((item) => ({
              id: item.id,
              name: item.productNameSnapshot,
              quantity: item.quantity,
              cancelledQty: item.cancelledQty,
              unitPriceCents: item.unitPriceCents,
              status: item.status,
            })),
          }));

          const serviceCharges = stay.serviceRequests.flatMap((request) => {
            const charges = addOnChargeMap.get(request.id) ?? [];

            return charges.map((charge) => ({
              id: charge.id,
              chargeCode: charge.chargeCode,
              serviceRequestId: request.id,
              requestCode: request.requestCode,
              requestType: request.type,
              itemName: charge.itemName,
              description: charge.description ?? '',
              quantity: charge.quantity,
              unitPriceCents: decimalToCents(charge.unitPrice),
              totalAmountCents: decimalToCents(charge.totalAmount),
              paymentStatus: charge.paymentStatus,
              createdAt: charge.createdAt.toISOString(),
            }));
          });

          const foodTotalCents = checkoutOrders.reduce(
            (sum, order) => sum + order.amountCents,
            0
          );

          const serviceTotalCents = serviceCharges.reduce((sum, charge) => {
            if (charge.paymentStatus !== RoomAddOnPaymentStatus.UNPAID) {
              return sum;
            }

            return sum + charge.totalAmountCents;
          }, 0);

          const liveSubtotalCents = foodTotalCents + serviceTotalCents;

          const folio = stay.folio
            ? {
                id: stay.folio.id,
                folioNumber: stay.folio.folioNumber,
                status: stay.folio.status,
                closedAt: stay.folio.closedAt
                  ? stay.folio.closedAt.toISOString()
                  : null,
                receiptPrintedAt: stay.folio.receiptPrintedAt
                  ? stay.folio.receiptPrintedAt.toISOString()
                  : null,
                receiptPrintCount: stay.folio.receiptPrintCount,
                foodTotalCents: stay.folio.foodTotalCents,
                serviceTotalCents: stay.folio.serviceTotalCents,
                manualChargeCents: stay.folio.manualChargeCents,
                discountCents: stay.folio.discountCents,
                subtotalCents: stay.folio.subtotalCents,
                paidCents: stay.folio.paidCents,
                balanceDueCents: stay.folio.balanceDueCents,
                lines: stay.folio.lines.map((line) => ({
                  id: line.id,
                  lineType: line.lineType,
                  lineStatus: line.lineStatus,
                  title: line.title,
                  description: line.description ?? '',
                  quantity: line.quantity,
                  unitAmountCents: line.unitAmountCents,
                  amountCents: line.amountCents,
                  postedAt: line.postedAt.toISOString(),
                  sourceOrderId: line.sourceOrderId ?? '',
                  sourceRoomAddOnChargeId:
                    line.sourceRoomAddOnChargeId ?? '',
                })),
                payments: stay.folio.payments.map((payment) => ({
                  id: payment.id,
                  paymentMethod: payment.paymentMethod,
                  amountCents: payment.amountCents,
                  reference: payment.reference ?? '',
                  note: payment.note ?? '',
                  paidAt: payment.paidAt.toISOString(),
                  receivedByName: payment.receivedBy?.name ?? '',
                })),
              }
            : null;

          const historicalSnapshot =
            stay.status === 'CHECKED_OUT'
              ? getGuestStayDisplaySnapshot(stay.folio?.guestSnapshot) ??
                getGuestStayDisplaySnapshot(stay.checkoutSnapshot)
              : null;

          const displayGuestName =
            historicalSnapshot?.guestName || stay.guestMember.name;
          const displayGuestPhone =
            historicalSnapshot?.guestPhone || stay.guestMember.phone || '';
          const displayGuestEmail =
            historicalSnapshot?.guestEmail || stay.guestMember.email || '';
          const displayRoomNumber =
            historicalSnapshot?.roomNumber || stay.room.number;
          const displayRoomName =
            historicalSnapshot?.roomName || stay.room.name || '';

          return {
            id: stay.id,
            hotelId: stay.hotelId,
            hotelName: stay.hotel.name,
            nfcRoomPasscodeEnabled:
              stay.hotel.settings?.nfcRoomPasscodeEnabled ?? true,
            roomId: stay.roomId,
            roomNumber: displayRoomNumber,
            roomName: displayRoomName,
            guestName: displayGuestName,
            guestPhone: displayGuestPhone,
            guestEmail: displayGuestEmail,
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

            checkoutSummary: {
              foodTotalCents:
                stay.status === 'CHECKED_OUT'
                  ? folio?.foodTotalCents ?? stay.checkoutFoodTotalCents
                  : foodTotalCents,
              serviceTotalCents:
                stay.status === 'CHECKED_OUT'
                  ? folio?.serviceTotalCents ?? stay.checkoutServiceTotalCents
                  : serviceTotalCents,
              manualChargeCents:
                stay.status === 'CHECKED_OUT'
                  ? folio?.manualChargeCents ?? stay.checkoutManualChargeCents
                  : stay.checkoutManualChargeCents,
              discountCents:
                stay.status === 'CHECKED_OUT'
                  ? folio?.discountCents ?? stay.checkoutDiscountCents
                  : stay.checkoutDiscountCents,
              subtotalCents:
                stay.status === 'CHECKED_OUT'
                  ? folio?.subtotalCents ?? stay.checkoutSubtotalCents
                  : liveSubtotalCents,
              paymentCents:
                stay.status === 'CHECKED_OUT'
                  ? folio?.paidCents ?? stay.checkoutPaymentCents
                  : stay.checkoutPaymentCents,
              balanceDueCents:
                stay.status === 'CHECKED_OUT'
                  ? folio?.balanceDueCents ?? stay.checkoutBalanceDueCents
                  : liveSubtotalCents,
              paymentMethod:
                folio?.payments[0]?.paymentMethod ??
                stay.checkoutPaymentMethod ??
                '',
              paymentReference: stay.checkoutPaymentReference ?? '',
              paymentNote: stay.checkoutPaymentNote ?? '',
              manualChargeNote: stay.checkoutManualChargeNote ?? '',
              discountNote: stay.checkoutDiscountNote ?? '',
              orders: checkoutOrders,
              serviceCharges,
              folio,
            },
          };
        })}
        defaultHotelId={defaultHotelId}
        isSuperAdmin={user.role === Role.SUPER_ADMIN}
        xenditEnabled={Boolean(
          process.env.XENDIT_SECRET_KEY &&
            (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL)
        )}
      />
    </div>
  );
}
