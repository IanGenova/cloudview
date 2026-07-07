'use server';

import {
  DashboardModule,
  GuestStayCheckoutPaymentMethod,
  GuestStayFolioLineType,
  GuestStayFolioStatus,
  GuestStayStatus,
  OrderStatus,
  PaymentStatus,
  Role,
  RoomAddOnPaymentStatus,
  ServiceRequestStatus,
} from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import {
  requireDashboardPermission,
  type DashboardPermissionAction,
} from '@/lib/dashboard-permissions';
import {
  createGuestStayWithPasscode,
  decryptGuestStayPasscode,
  encryptGuestStayPasscode,
  generateGuestStayPasscode,
  hashGuestStayPasscode,
} from '@/lib/guest-stays';
import { awardGuestStayCheckInPoints } from '@/lib/guest-point-sync';
import { sendGuestStayPasscodeSms } from '@/lib/sms';

function cleanText(value: FormDataEntryValue | null, maxLength = 200) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().slice(0, maxLength);
}

function parseIntValue(value: FormDataEntryValue | null, fallback = 0) {
  const parsed = Number(cleanText(value, 20));

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.floor(parsed);
}

function parseDateTime(value: FormDataEntryValue | null) {
  const raw = cleanText(value, 80);

  if (!raw) {
    return null;
  }

  const date = new Date(raw);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function parseGuestStayStatus(value: FormDataEntryValue | null) {
  const raw = cleanText(value, 40);

  if (
    raw === GuestStayStatus.ACTIVE ||
    raw === GuestStayStatus.CHECKED_OUT ||
    raw === GuestStayStatus.CANCELLED ||
    raw === GuestStayStatus.EXPIRED
  ) {
    return raw;
  }

  return GuestStayStatus.ACTIVE;
}

async function getActionHotelId(formData: FormData) {
  const user = await requireDashboardPermission(
    DashboardModule.GUEST_STAYS,
    'canCreate'
  );

  if (user.role === Role.SUPER_ADMIN) {
    const hotelId = cleanText(formData.get('hotelId'), 120);

    if (!hotelId) {
      throw new Error('Hotel is required.');
    }

    return {
      user,
      hotelId,
    };
  }

  if (!user.hotelId) {
    throw new Error('Your account is not assigned to a hotel.');
  }

  return {
    user,
    hotelId: user.hotelId,
  };
}

async function getScopedGuestStay({
  guestStayId,
  permission = 'canView',
}: {
  guestStayId: string;
  permission?: DashboardPermissionAction;
}) {
  const user = await requireDashboardPermission(
    DashboardModule.GUEST_STAYS,
    permission
  );

  const guestStay = await db.guestStay.findFirst({
    where:
      user.role === Role.SUPER_ADMIN
        ? {
            id: guestStayId,
          }
        : {
            id: guestStayId,
            hotelId: user.hotelId || '__NO_ACCESS__',
          },
    select: {
        id: true,
        hotelId: true,
        roomId: true,
        guestMemberId: true,
        status: true,
        checkedOutAt: true,
        passcodeEncrypted: true,
        passcodeHash: true,
        maxDevices: true,
      },
  });

  return {
    user,
    guestStay,
  };
}

export async function createGuestStayAction(formData: FormData) {
  try {
    const { hotelId } = await getActionHotelId(formData);

    const roomId = cleanText(formData.get('roomId'), 120);
    const guestName = cleanText(formData.get('guestName'), 160);
    const phone = cleanText(formData.get('phone'), 80) || null;
    const email = cleanText(formData.get('email'), 160).toLowerCase() || null;
    const maxDevices = parseIntValue(formData.get('maxDevices'), 2);
    const expectedCheckOutAt = parseDateTime(formData.get('expectedCheckOutAt'));
    const sendPasscodeSmsValue = cleanText(
      formData.get('sendPasscodeSms'),
      20
    ).toLowerCase();
    const shouldSendPasscodeSms =
      sendPasscodeSmsValue === 'yes' ||
      sendPasscodeSmsValue === 'on' ||
      sendPasscodeSmsValue === 'true';

    if (!roomId) {
      return {
        ok: false as const,
        error: 'Room is required.',
      };
    }

    if (!guestName) {
      return {
        ok: false as const,
        error: 'Guest name is required.',
      };
    }

    if (shouldSendPasscodeSms && !phone) {
      return {
        ok: false as const,
        error: 'Phone number is required when sending the passcode via SMS.',
      };
    }

    const result = await createGuestStayWithPasscode({
      hotelId,
      roomId,
      guestName,
      phone,
      email,
      maxDevices,
      expectedCheckOutAt,
    });
    const pointResult = await awardGuestStayCheckInPoints(result.guestStay.id);

    let smsSent = false;
    let smsRecipient = phone ?? '';
    let smsWarning = '';

    if (shouldSendPasscodeSms && phone) {
      try {
        const smsResult = await sendGuestStayPasscodeSms({
          phone,
          hotelName: result.guestStay.hotel.name,
          guestName: result.guestStay.guestMember.name,
          roomNumber: result.guestStay.room.number,
          passcode: result.passcode,
        });

        smsSent = smsResult.sent;
        smsRecipient = smsResult.recipient;
        smsWarning = smsResult.warning ?? '';
      } catch (smsError) {
        smsWarning =
          smsError instanceof Error
            ? smsError.message
            : 'Guest stay was created, but the SMS could not be sent.';
      }
    }

    revalidatePath('/dashboard/guest-stays');
    revalidatePath('/dashboard/tags');

    return {
      ok: true as const,
      passcode: result.passcode,
      guestName: result.guestStay.guestMember.name,
      roomNumber: result.guestStay.room.number,
      hotelName: result.guestStay.hotel.name,
      maxDevices: result.guestStay.maxDevices,
      pointsAwarded: pointResult.pointsAwarded,
      smsRequested: shouldSendPasscodeSms,
      smsSent,
      smsRecipient,
      smsWarning,
    };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : 'Unable to create guest stay.',
    };
  }
}


export async function updateGuestStayAction(formData: FormData) {
  try {
    const guestStayId = cleanText(formData.get('guestStayId'), 120);
    const roomId = cleanText(formData.get('roomId'), 120);
    const guestName = cleanText(formData.get('guestName'), 160);
    const phone = cleanText(formData.get('phone'), 80) || null;
    const email = cleanText(formData.get('email'), 160).toLowerCase() || null;
    const maxDevices = Math.max(
      1,
      Math.min(parseIntValue(formData.get('maxDevices'), 2), 10)
    );
    const expectedCheckOutAt = parseDateTime(formData.get('expectedCheckOutAt'));
    const status = parseGuestStayStatus(formData.get('status'));

    if (!guestStayId) {
      return {
        ok: false as const,
        error: 'Guest stay is required.',
      };
    }

    if (!roomId) {
      return {
        ok: false as const,
        error: 'Room is required.',
      };
    }

    if (!guestName) {
      return {
        ok: false as const,
        error: 'Guest name is required.',
      };
    }

    const { guestStay } = await getScopedGuestStay({
      guestStayId,
      permission: 'canEdit',
    });

    if (!guestStay) {
      return {
        ok: false as const,
        error: 'Guest stay not found.',
      };
    }

    if (guestStay.status === GuestStayStatus.CHECKED_OUT) {
      return {
        ok: false as const,
        error: 'This guest stay is already checked out and can no longer be edited.',
      };
    }

    if (status === GuestStayStatus.CHECKED_OUT) {
      return {
        ok: false as const,
        error: 'Please use the checkout flow to check out this guest stay.',
      };
    }

    const room = await db.room.findFirst({
      where: {
        id: roomId,
        hotelId: guestStay.hotelId,
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!room) {
      return {
        ok: false as const,
        error: 'Selected room was not found or is inactive.',
      };
    }

    const activeDeviceCount = await db.guestStayDevice.count({
      where: {
        guestStayId: guestStay.id,
        revokedAt: null,
      },
    });

    if (maxDevices < activeDeviceCount) {
      return {
        ok: false as const,
        error: `Max devices cannot be lower than the active device count (${activeDeviceCount}).`,
      };
    }

    if (status === GuestStayStatus.ACTIVE) {
      const activeRoomConflict = await db.guestStay.findFirst({
        where: {
          id: {
            not: guestStay.id,
          },
          hotelId: guestStay.hotelId,
          roomId,
          status: GuestStayStatus.ACTIVE,
        },
        select: {
          id: true,
        },
      });

      if (activeRoomConflict) {
        return {
          ok: false as const,
          error: 'Another active guest stay already exists in this room.',
        };
      }
    }

    await db.$transaction(async (tx) => {
      await tx.guestMember.update({
        where: {
          id: guestStay.guestMemberId,
        },
        data: {
          name: guestName,
          phone,
          email,
          isActive: true,
        },
      });

      await tx.guestStay.update({
        where: {
          id: guestStay.id,
        },
        data: {
          roomId,
          maxDevices,
          expectedCheckOutAt,
          status,
           checkedOutAt:
           status === GuestStayStatus.ACTIVE ? null : guestStay.checkedOutAt,
        },
      });
    });

    revalidatePath('/dashboard/guest-stays');
    revalidatePath('/dashboard/tags');

    return {
      ok: true as const,
      message: 'Guest stay updated successfully.',
    };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : 'Unable to update guest stay.',
    };
  }
}

function parseMoneyToCents(value: FormDataEntryValue | null) {
  const raw = cleanText(value, 40).replace(/,/g, '');
  const parsed = Number(raw);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return Math.round(parsed * 100);
}

function parseCheckoutPaymentMethod(value: FormDataEntryValue | null) {
  const raw = cleanText(value, 80);

  if (
    raw === GuestStayCheckoutPaymentMethod.CASH ||
    raw === GuestStayCheckoutPaymentMethod.CARD ||
    raw === GuestStayCheckoutPaymentMethod.GCASH ||
    raw === GuestStayCheckoutPaymentMethod.MAYA ||
    raw === GuestStayCheckoutPaymentMethod.QRPH ||
    raw === GuestStayCheckoutPaymentMethod.BANK_TRANSFER ||
    raw === GuestStayCheckoutPaymentMethod.COMPANY_ACCOUNT ||
    raw === GuestStayCheckoutPaymentMethod.COMPLIMENTARY ||
    raw === GuestStayCheckoutPaymentMethod.WAIVED ||
    raw === GuestStayCheckoutPaymentMethod.PAY_LATER
  ) {
    return raw;
  }

  return GuestStayCheckoutPaymentMethod.CASH;
}

type CheckoutPaymentInput = {
  method: GuestStayCheckoutPaymentMethod;
  amountCents: number;
  reference: string | null;
  note: string | null;
};

function formatCentsForText(cents: number) {
  return `₱${(cents / 100).toFixed(2)}`;
}

function generateFolioNumber(date = new Date()) {
  const datePart = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(date)
    .replaceAll('-', '');

  const entropy = `${date.getTime().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`.toUpperCase();

  return `FOL-${datePart}-${entropy}`;
}

function parseCheckoutPaymentRows(formData: FormData): CheckoutPaymentInput[] {
  const methodValues = formData.getAll('paymentMethod');
  const amountValues = formData.getAll('paymentAmount');
  const referenceValues = formData.getAll('paymentReference');
  const noteValues = formData.getAll('paymentNote');

  const rowCount = Math.max(
    methodValues.length,
    amountValues.length,
    referenceValues.length,
    noteValues.length
  );

  const rows: CheckoutPaymentInput[] = [];

  for (let index = 0; index < rowCount; index += 1) {
    const method = parseCheckoutPaymentMethod(
      methodValues[index] ?? null
    );
    const amountCents = parseMoneyToCents(amountValues[index] ?? null);
    const reference =
      cleanText(referenceValues[index] ?? null, 160) || null;
    const note = cleanText(noteValues[index] ?? null, 500) || null;

    const shouldKeepZeroAmountRow =
      method === GuestStayCheckoutPaymentMethod.PAY_LATER ||
      method === GuestStayCheckoutPaymentMethod.WAIVED ||
      method === GuestStayCheckoutPaymentMethod.COMPLIMENTARY ||
      Boolean(reference) ||
      Boolean(note);

    if (amountCents <= 0 && !shouldKeepZeroAmountRow) {
      continue;
    }

    rows.push({
      method,
      amountCents,
      reference,
      note,
    });
  }

  return rows;
}

function buildPaymentNote(paymentRows: CheckoutPaymentInput[]) {
  if (!paymentRows.length) {
    return null;
  }

  if (paymentRows.length === 1) {
    return paymentRows[0]?.note ?? null;
  }

  return paymentRows
    .map((payment) => {
      const reference = payment.reference ? ` (${payment.reference})` : '';

      return `${payment.method}: ${formatCentsForText(
        payment.amountCents
      )}${reference}`;
    })
    .join(' | ')
    .slice(0, 500);
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

function revalidateGuestStayPaths() {
  revalidatePath('/dashboard/guest-stays');
  revalidatePath('/dashboard/tags');
  revalidatePath('/dashboard/orders');
  revalidatePath('/dashboard/service-requests');
  revalidatePath('/t/[tagCode]', 'page');
}


export async function checkoutGuestStayAction(formData: FormData) {
  try {
    const guestStayId = cleanText(formData.get('guestStayId'), 120);
    const manualChargeCents = parseMoneyToCents(
      formData.get('manualChargeAmount')
    );
    const discountCents = parseMoneyToCents(formData.get('discountAmount'));
    const manualChargeNote =
      cleanText(formData.get('manualChargeNote'), 500) || null;
    const discountNote = cleanText(formData.get('discountNote'), 500) || null;
    let paymentRows = parseCheckoutPaymentRows(formData);

    if (!guestStayId) {
      return {
        ok: false as const,
        error: 'Guest stay is required.',
      };
    }

    const { user, guestStay } = await getScopedGuestStay({
      guestStayId,
      permission: 'canEdit',
    });

    if (!guestStay) {
      return {
        ok: false as const,
        error: 'Guest stay not found.',
      };
    }

    if (guestStay.status !== GuestStayStatus.ACTIVE) {
      return {
        ok: false as const,
        error: 'Only active guest stays can be checked out.',
      };
    }

    const checkoutStay = await db.guestStay.findUnique({
      where: {
        id: guestStay.id,
      },
      select: {
        id: true,
        hotelId: true,
        roomId: true,
        guestMemberId: true,
        checkInAt: true,
        expectedCheckOutAt: true,
        guestMember: {
          select: {
            name: true,
            phone: true,
            email: true,
          },
        },
        room: {
          select: {
            number: true,
            name: true,
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
            createdAt: 'asc',
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
            createdAt: 'asc',
          },
        },
        folio: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!checkoutStay) {
      return {
        ok: false as const,
        error: 'Guest stay not found.',
      };
    }

    if (checkoutStay.folio) {
      return {
        ok: false as const,
        error: 'This guest stay already has a folio.',
      };
    }

    const blockingOrders = checkoutStay.orders.filter(
      (order) =>
        order.status === OrderStatus.PENDING ||
        order.status === OrderStatus.ACCEPTED ||
        order.status === OrderStatus.PREPARING
    );

    if (blockingOrders.length > 0) {
      return {
        ok: false as const,
        error:
          'Checkout is blocked. Please resolve pending or preparing food orders first.',
      };
    }

    const blockingServiceRequests = checkoutStay.serviceRequests.filter(
      (request) =>
        request.status === ServiceRequestStatus.NEW ||
        request.status === ServiceRequestStatus.IN_PROGRESS
    );

    if (blockingServiceRequests.length > 0) {
      return {
        ok: false as const,
        error:
          'Checkout is blocked. Please complete or cancel active service requests first.',
      };
    }

    const billableOrders = checkoutStay.orders.filter((order) => {
      return getOrderOutstandingCents(order) > 0;
    });

    const foodTotalCents = billableOrders.reduce(
      (sum, order) => sum + getOrderOutstandingCents(order),
      0
    );

    const serviceRequestIds = checkoutStay.serviceRequests.map(
      (request) => request.id
    );

    const addOnCharges = serviceRequestIds.length
      ? await db.roomAddOnCharge.findMany({
          where: {
            serviceRequestId: {
              in: serviceRequestIds,
            },
            paymentStatus: RoomAddOnPaymentStatus.UNPAID,
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
            createdAt: 'asc',
          },
        })
      : [];

    const serviceTotalCents = addOnCharges.reduce(
      (sum, charge) => sum + decimalToCents(charge.totalAmount),
      0
    );

    const subtotalBeforeDiscountCents =
      foodTotalCents + serviceTotalCents + manualChargeCents;
    const safeDiscountCents = Math.min(discountCents, subtotalBeforeDiscountCents);
    const subtotalCents = Math.max(
      subtotalBeforeDiscountCents - safeDiscountCents,
      0
    );

    if (subtotalCents > 0 && !paymentRows.length) {
      return {
        ok: false as const,
        error: 'Add a payment row or choose Pay Later before checkout.',
      };
    }

    const onlyPaymentRow = paymentRows.length === 1 ? paymentRows[0] : null;

    if (
      onlyPaymentRow &&
      onlyPaymentRow.amountCents <= 0 &&
      (onlyPaymentRow.method === GuestStayCheckoutPaymentMethod.WAIVED ||
        onlyPaymentRow.method === GuestStayCheckoutPaymentMethod.COMPLIMENTARY)
    ) {
      paymentRows = [
        {
          ...onlyPaymentRow,
          amountCents: subtotalCents,
        },
      ];
    }

    const paymentCents = paymentRows.reduce(
      (sum, payment) => sum + payment.amountCents,
      0
    );

    if (paymentCents > subtotalCents) {
      return {
        ok: false as const,
        error: 'Total payment cannot be greater than the checkout subtotal.',
      };
    }

    const hasPayLaterSettlement = paymentRows.some(
      (payment) => payment.method === GuestStayCheckoutPaymentMethod.PAY_LATER
    );
    const balanceDueCents = Math.max(subtotalCents - paymentCents, 0);

    if (balanceDueCents > 0 && !hasPayLaterSettlement) {
      return {
        ok: false as const,
        error:
          'Payment is not enough to complete checkout. Add a Pay Later row or settle the balance.',
      };
    }

    const now = new Date();
    const folioNumber = generateFolioNumber(now);
    const shouldMarkChargesPaid =
      balanceDueCents === 0 && !hasPayLaterSettlement;

    const primaryPayment =
      paymentRows.find((payment) => payment.amountCents > 0) ??
      paymentRows[0] ??
      null;

    const legacyPaymentMethod = primaryPayment?.method ?? null;
    const legacyPaymentReference =
      paymentRows.length > 1
        ? `Split payment / ${folioNumber}`
        : primaryPayment?.reference ?? null;
    const legacyPaymentNote = buildPaymentNote(paymentRows);

    const orderLines = billableOrders.map((order) => {
      const amountCents = getOrderOutstandingCents(order);
      const itemDescriptions = order.items
        .filter((item) => item.status !== 'CANCELLED')
        .map((item) => {
          const activeQuantity = Math.max(
            item.quantity - item.cancelledQty,
            0
          );

          return `${activeQuantity}× ${item.productNameSnapshot}`;
        })
        .filter(Boolean);

      return {
        lineType: GuestStayFolioLineType.FOOD_ORDER,
        sourceOrderId: order.id,
        sourceRoomAddOnChargeId: null,
        title: `Food Order ${order.orderCode}`,
        description: itemDescriptions.join(', ') || null,
        quantity: 1,
        unitAmountCents: amountCents,
        amountCents,
        metadata: {
          orderId: order.id,
          orderCode: order.orderCode,
          status: order.status,
          paymentStatus: order.paymentStatus,
          createdAt: order.createdAt.toISOString(),
          items: order.items.map((item) => ({
            id: item.id,
            name: item.productNameSnapshot,
            quantity: item.quantity,
            cancelledQty: item.cancelledQty,
            unitPriceCents: item.unitPriceCents,
            status: item.status,
          })),
        },
      };
    });

    const serviceLines = addOnCharges.map((charge) => {
      const amountCents = decimalToCents(charge.totalAmount);

      return {
        lineType: GuestStayFolioLineType.SERVICE_CHARGE,
        sourceOrderId: null,
        sourceRoomAddOnChargeId: charge.id,
        title: charge.itemName,
        description: charge.description,
        quantity: charge.quantity,
        unitAmountCents: decimalToCents(charge.unitPrice),
        amountCents,
        metadata: {
          roomAddOnChargeId: charge.id,
          chargeCode: charge.chargeCode,
          serviceRequestId: charge.serviceRequestId,
          paymentStatus: charge.paymentStatus,
          createdAt: charge.createdAt.toISOString(),
        },
      };
    });

    const manualChargeLines =
      manualChargeCents > 0
        ? [
            {
              lineType: GuestStayFolioLineType.MANUAL_CHARGE,
              sourceOrderId: null,
              sourceRoomAddOnChargeId: null,
              title: (manualChargeNote || 'Manual charge').slice(0, 180),
              description: manualChargeNote,
              quantity: 1,
              unitAmountCents: manualChargeCents,
              amountCents: manualChargeCents,
              metadata: {
                note: manualChargeNote,
              },
            },
          ]
        : [];

    const discountLines =
      safeDiscountCents > 0
        ? [
            {
              lineType: GuestStayFolioLineType.DISCOUNT,
              sourceOrderId: null,
              sourceRoomAddOnChargeId: null,
              title: (discountNote || 'Discount / waiver').slice(0, 180),
              description: discountNote,
              quantity: 1,
              unitAmountCents: -safeDiscountCents,
              amountCents: -safeDiscountCents,
              metadata: {
                note: discountNote,
              },
            },
          ]
        : [];

    const folioLines = [
      ...orderLines,
      ...serviceLines,
      ...manualChargeLines,
      ...discountLines,
    ];

    const guestSnapshot = {
      id: checkoutStay.guestMemberId,
      name: checkoutStay.guestMember.name,
      phone: checkoutStay.guestMember.phone,
      email: checkoutStay.guestMember.email,
      roomId: checkoutStay.roomId,
      roomNumber: checkoutStay.room.number,
      roomName: checkoutStay.room.name,
      checkInAt: checkoutStay.checkInAt.toISOString(),
      expectedCheckOutAt: checkoutStay.expectedCheckOutAt?.toISOString() ?? null,
    };

    const checkoutSnapshot = {
      folioNumber,
      guestStayId: checkoutStay.id,
      hotelId: checkoutStay.hotelId,
      roomId: checkoutStay.roomId,
      roomNumber: checkoutStay.room.number,
      roomName: checkoutStay.room.name,
      guest: guestSnapshot,
      checkedOutAt: now.toISOString(),
      lines: folioLines.map((line) => ({
        lineType: line.lineType,
        title: line.title,
        description: line.description,
        quantity: line.quantity,
        unitAmountCents: line.unitAmountCents,
        amountCents: line.amountCents,
        sourceOrderId: line.sourceOrderId,
        sourceRoomAddOnChargeId: line.sourceRoomAddOnChargeId,
      })),
      payments: paymentRows.map((payment) => ({
        method: payment.method,
        amountCents: payment.amountCents,
        reference: payment.reference,
        note: payment.note,
      })),
      foodOrders: orderLines.map((line) => line.metadata),
      serviceCharges: serviceLines.map((line) => line.metadata),
      totals: {
        foodTotalCents,
        serviceTotalCents,
        manualChargeCents,
        discountCents: safeDiscountCents,
        subtotalCents,
        paymentCents,
        balanceDueCents,
      },
    };

    await db.$transaction(async (tx) => {
      await tx.guestStayFolio.create({
        data: {
          folioNumber,
          hotelId: checkoutStay.hotelId,
          guestStayId: checkoutStay.id,
          status: GuestStayFolioStatus.CLOSED,
          openedAt: now,
          closedAt: now,
          guestSnapshot,
          checkoutSnapshot,
          foodTotalCents,
          serviceTotalCents,
          manualChargeCents,
          discountCents: safeDiscountCents,
          subtotalCents,
          paidCents: paymentCents,
          balanceDueCents,
          createdById: user.id,
          closedById: user.id,
          lines: {
            create: folioLines.map((line) => ({
              hotelId: checkoutStay.hotelId,
              guestStayId: checkoutStay.id,
              lineType: line.lineType,
              sourceOrderId: line.sourceOrderId,
              sourceRoomAddOnChargeId: line.sourceRoomAddOnChargeId,
              title: line.title,
              description: line.description,
              quantity: line.quantity,
              unitAmountCents: line.unitAmountCents,
              amountCents: line.amountCents,
              metadata: line.metadata,
              postedById: user.id,
              postedAt: now,
            })),
          },
          ...(paymentRows.length
            ? {
                payments: {
                  create: paymentRows.map((payment) => ({
                    hotelId: checkoutStay.hotelId,
                    guestStayId: checkoutStay.id,
                    paymentMethod: payment.method,
                    amountCents: payment.amountCents,
                    reference: payment.reference,
                    note: payment.note,
                    receivedById: user.id,
                    paidAt: now,
                  })),
                },
              }
            : {}),
        },
      });

      await tx.guestStay.update({
        where: {
          id: checkoutStay.id,
        },
        data: {
          status: GuestStayStatus.CHECKED_OUT,
          checkedOutAt: now,
          checkoutFoodTotalCents: foodTotalCents,
          checkoutServiceTotalCents: serviceTotalCents,
          checkoutManualChargeCents: manualChargeCents,
          checkoutDiscountCents: safeDiscountCents,
          checkoutSubtotalCents: subtotalCents,
          checkoutPaymentCents: paymentCents,
          checkoutBalanceDueCents: balanceDueCents,
          checkoutPaymentMethod: legacyPaymentMethod,
          checkoutPaymentReference: legacyPaymentReference,
          checkoutPaymentNote: legacyPaymentNote,
          checkoutManualChargeNote: manualChargeNote,
          checkoutDiscountNote: discountNote,
          checkoutSnapshot,
          checkedOutById: user.id,
        },
      });

      await tx.guestStayDevice.updateMany({
        where: {
          guestStayId: checkoutStay.id,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
        },
      });

      await tx.nfcGuestSession.updateMany({
        where: {
          guestStayId: checkoutStay.id,
          endedAt: null,
        },
        data: {
          endedAt: now,
        },
      });

      if (shouldMarkChargesPaid) {
        if (billableOrders.length) {
          await tx.order.updateMany({
            where: {
              id: {
                in: billableOrders.map((order) => order.id),
              },
            },
            data: {
              paymentStatus: PaymentStatus.PAID,
            },
          });
        }

        if (addOnCharges.length) {
          await tx.roomAddOnCharge.updateMany({
            where: {
              id: {
                in: addOnCharges.map((charge) => charge.id),
              },
            },
            data: {
              paymentStatus: RoomAddOnPaymentStatus.PAID,
              paidAt: now,
              paidById: user.id,
              paymentReference: legacyPaymentReference ?? folioNumber,
            },
          });
        }
      }
    });

    revalidateGuestStayPaths();

    return {
      ok: true as const,
      message: `Guest checked out successfully. Folio ${folioNumber}. Balance due: ${formatCentsForText(
        balanceDueCents
      )}.`,
      folioNumber,
      totals: {
        foodTotalCents,
        serviceTotalCents,
        manualChargeCents,
        discountCents: safeDiscountCents,
        subtotalCents,
        paymentCents,
        balanceDueCents,
      },
    };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : 'Unable to check out guest stay.',
    };
  }
}

export async function markGuestStayReceiptPrintedAction(formData: FormData) {
  try {
    const guestStayId = cleanText(formData.get('guestStayId'), 120);

    if (!guestStayId) {
      return {
        ok: false as const,
        error: 'Guest stay is required.',
      };
    }

    const { user, guestStay } = await getScopedGuestStay({
      guestStayId,
      permission: 'canEdit',
    });

    if (!guestStay) {
      return {
        ok: false as const,
        error: 'Guest stay not found.',
      };
    }

    const now = new Date();

    const result = await db.guestStayFolio.updateMany({
      where:
        user.role === Role.SUPER_ADMIN
          ? {
              guestStayId: guestStay.id,
            }
          : {
              guestStayId: guestStay.id,
              hotelId: user.hotelId || '__NO_ACCESS__',
            },
      data: {
        receiptPrintedAt: now,
        receiptPrintCount: {
          increment: 1,
        },
      },
    });

    if (result.count === 0) {
      return {
        ok: false as const,
        error: 'No folio receipt found for this guest stay.',
      };
    }

    revalidatePath('/dashboard/guest-stays');

    return {
      ok: true as const,
      message: 'Receipt print count updated.',
    };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : 'Unable to update receipt print count.',
    };
  }
}


export async function getGuestStayPasscodeAction(formData: FormData) {
  try {
    const guestStayId = cleanText(formData.get('guestStayId'), 120);

    if (!guestStayId) {
      return {
        ok: false as const,
        error: 'Guest stay is required.',
      };
    }

    const { guestStay } = await getScopedGuestStay({
      guestStayId,
      permission: 'canEdit',
    });

    if (!guestStay) {
      return {
        ok: false as const,
        error: 'Guest stay not found.',
      };
    }

    const passcode = decryptGuestStayPasscode(guestStay.passcodeEncrypted);

    if (!passcode) {
      return {
        ok: false as const,
        error:
          'This stay was created before passcode viewing was enabled. Please reset the passcode to generate a viewable passcode.',
      };
    }

    return {
      ok: true as const,
      passcode,
    };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : 'Unable to view guest stay passcode.',
    };
  }
}

export async function resetGuestStayPasscodeAction(formData: FormData) {
  try {
    const guestStayId = cleanText(formData.get('guestStayId'), 120);

    if (!guestStayId) {
      return {
        ok: false as const,
        error: 'Guest stay is required.',
      };
    }

    const { guestStay } = await getScopedGuestStay({
      guestStayId,
      permission: 'canEdit',
    });

    if (!guestStay) {
      return {
        ok: false as const,
        error: 'Guest stay not found.',
      };
    }

    if (guestStay.status !== GuestStayStatus.ACTIVE) {
      return {
        ok: false as const,
        error: 'Only active guest stays can reset passcode.',
      };
    }

    const passcode = generateGuestStayPasscode();

    await db.guestStay.update({
      where: {
        id: guestStay.id,
      },
      data: {
        passcodeHash: hashGuestStayPasscode(passcode),
        passcodeEncrypted: encryptGuestStayPasscode(passcode),
      },
    });

    revalidatePath('/dashboard/guest-stays');

    return {
      ok: true as const,
      passcode,
      message: 'Passcode reset successfully.',
    };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : 'Unable to reset guest stay passcode.',
    };
  }
}