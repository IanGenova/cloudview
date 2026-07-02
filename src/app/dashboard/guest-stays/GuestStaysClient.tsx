'use client';

import { type FormEvent, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Banknote,
  BedDouble,
  Calculator,
  CalendarClock,
  CheckCircle2,
  Coins,
  DoorOpen,
  Eye,
  History,
  KeyRound,
  LogOut,
  MessageSquare,
  Pencil,
  Plus,
  Printer,
  ReceiptText,
  RefreshCw,
  Trophy,
  UserCheck,
  WalletCards,
  X,
} from 'lucide-react';
import {
  checkoutGuestStayAction,
  createGuestStayAction,
  getGuestStayPasscodeAction,
  markGuestStayReceiptPrintedAction,
  resetGuestStayPasscodeAction,
  updateGuestStayAction,
} from './actions';

type GuestStayStatusValue =
  | 'ACTIVE'
  | 'CHECKED_OUT'
  | 'CANCELLED'
  | 'EXPIRED';

type GuestStayCheckoutPaymentMethodValue =
  | 'CASH'
  | 'CARD'
  | 'GCASH'
  | 'MAYA'
  | 'QRPH'
  | 'BANK_TRANSFER'
  | 'COMPANY_ACCOUNT'
  | 'COMPLIMENTARY'
  | 'WAIVED'
  | 'PAY_LATER';

type CheckoutOrderItemLine = {
  id: string;
  name: string;
  quantity: number;
  cancelledQty: number;
  unitPriceCents: number;
  status: string;
};

type CheckoutFoodOrderLine = {
  id: string;
  orderCode: string;
  status: string;
  paymentStatus: string;
  createdAt: string;
  amountCents: number;
  items: CheckoutOrderItemLine[];
};

type CheckoutServiceChargeLine = {
  id: string;
  chargeCode: string;
  serviceRequestId: string;
  requestCode: string;
  requestType: string;
  itemName: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  totalAmountCents: number;
  paymentStatus: string;
  createdAt: string;
};

type CheckoutFolioLineRecord = {
  id: string;
  lineType: string;
  lineStatus: string;
  title: string;
  description: string;
  quantity: number;
  unitAmountCents: number;
  amountCents: number;
  postedAt: string;
  sourceOrderId: string;
  sourceRoomAddOnChargeId: string;
};

type CheckoutFolioPaymentRecord = {
  id: string;
  paymentMethod: GuestStayCheckoutPaymentMethodValue;
  amountCents: number;
  reference: string;
  note: string;
  paidAt: string;
  receivedByName: string;
};

type CheckoutFolioRecord = {
  id: string;
  folioNumber: string;
  status: string;
  closedAt: string | null;
  receiptPrintedAt: string | null;
  receiptPrintCount: number;
  foodTotalCents: number;
  serviceTotalCents: number;
  manualChargeCents: number;
  discountCents: number;
  subtotalCents: number;
  paidCents: number;
  balanceDueCents: number;
  lines: CheckoutFolioLineRecord[];
  payments: CheckoutFolioPaymentRecord[];
};

type CheckoutPaymentDraft = {
  id: string;
  method: GuestStayCheckoutPaymentMethodValue;
  amount: string;
  reference: string;
  note: string;
};

type GuestStayCheckoutSummary = {
  foodTotalCents: number;
  serviceTotalCents: number;
  manualChargeCents: number;
  discountCents: number;
  subtotalCents: number;
  paymentCents: number;
  balanceDueCents: number;
  paymentMethod: string;
  paymentReference: string;
  paymentNote: string;
  manualChargeNote: string;
  discountNote: string;
  orders: CheckoutFoodOrderLine[];
  serviceCharges: CheckoutServiceChargeLine[];
  folio: CheckoutFolioRecord | null;
};

type HotelOption = {
  id: string;
  name: string;
};

type RoomOption = {
  id: string;
  hotelId: string;
  number: string;
  name: string;
  floor: string;
};

type PointLedgerRecord = {
  id: string;
  type: string;
  status: string;
  points: number;
  source: string;
  referenceId: string;
  description: string;
  createdAt: string;
};

type GuestStayRecord = {
  id: string;
  hotelId: string;
  hotelName: string;
  roomId: string;
  roomNumber: string;
  roomName: string;
  guestName: string;
  guestPhone: string;
  guestEmail: string;
  maxDevices: number;
  activeDevices: number;
  orderCount: number;
  serviceRequestCount: number;
  checkInAt: string;
  expectedCheckOutAt: string | null;
  checkedOutAt: string | null;
  status: GuestStayStatusValue;
   availablePoints: number;
  pendingPoints: number;
  lifetimeEarnedPoints: number;
  lifetimeRedeemedPoints: number;
  confirmedStayPoints: number;
  pendingStayPoints: number;
  voidedStayPoints: number;
  netStayPoints: number;
  recentPointLedgers: PointLedgerRecord[];
  checkoutSummary: GuestStayCheckoutSummary;
};



type CreatedStayResult = {
  passcode: string;
  guestName: string;
  roomNumber: string;
  hotelName: string;
  maxDevices: number;
  smsRequested: boolean;
  smsSent: boolean;
  smsRecipient: string;
  smsWarning: string;
};

const inputClass =
  'h-12 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none transition focus:border-[#b88938] focus:ring-4 focus:ring-[#b88938]/10';


const GUEST_STAYS_PAGE_SIZE_OPTIONS = [5, 10, 15, 25] as const;

type PaginationItem = number | 'ellipsis-start' | 'ellipsis-end';

function getGuestStayPageItems(
  currentPage: number,
  totalPages: number
): PaginationItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, totalPages, currentPage]);

  if (currentPage <= 4) {
    pages.add(2);
    pages.add(3);
    pages.add(4);
    pages.add(5);
  } else if (currentPage >= totalPages - 3) {
    pages.add(totalPages - 4);
    pages.add(totalPages - 3);
    pages.add(totalPages - 2);
    pages.add(totalPages - 1);
  } else {
    pages.add(currentPage - 1);
    pages.add(currentPage + 1);
  }

  const sortedPages = Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);

  const items: PaginationItem[] = [];

  for (let index = 0; index < sortedPages.length; index += 1) {
    const page = sortedPages[index];
    const previousPage = sortedPages[index - 1];

    if (previousPage && page - previousPage > 1) {
      items.push(page - previousPage === 2 ? previousPage + 1 : 'ellipsis-start');
    }

    items.push(page);
  }

  return items;
}

const labelClass =
  'text-xs font-black uppercase tracking-wide text-neutral-500';

const statusOptions: GuestStayStatusValue[] = [
  'ACTIVE',
  'CHECKED_OUT',
  'CANCELLED',
  'EXPIRED',
];

const checkoutPaymentMethods: Array<{
  value: GuestStayCheckoutPaymentMethodValue;
  label: string;
  helper: string;
}> = [
  {
    value: 'CASH',
    label: 'Cash',
    helper: 'Cash settlement at front desk.',
  },
  {
    value: 'CARD',
    label: 'Card',
    helper: 'Debit or credit card payment.',
  },
  {
    value: 'GCASH',
    label: 'GCash',
    helper: 'GCash mobile wallet payment.',
  },
  {
    value: 'MAYA',
    label: 'Maya',
    helper: 'Maya wallet payment.',
  },
  {
    value: 'QRPH',
    label: 'QRPH',
    helper: 'QR code / QRPH payment.',
  },
  {
    value: 'BANK_TRANSFER',
    label: 'Bank Transfer',
    helper: 'Bank deposit or transfer reference required.',
  },
  {
    value: 'COMPANY_ACCOUNT',
    label: 'Company Account',
    helper: 'Charge to company account.',
  },
  {
    value: 'COMPLIMENTARY',
    label: 'Complimentary',
    helper: 'Hotel-approved complimentary settlement.',
  },
  {
    value: 'WAIVED',
    label: 'Waived',
    helper: 'Balance waived with authorization.',
  },
  {
    value: 'PAY_LATER',
    label: 'Pay Later',
    helper: 'Checkout with remaining balance due.',
  },
];

function formatDateTime(value?: string | null) {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function money(cents: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(cents / 100);
}

function centsToInputAmount(cents: number) {
  return (Math.max(cents, 0) / 100).toFixed(2);
}

function inputAmountToCents(value: string) {
  const parsed = Number(value.replace(/,/g, ''));

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return Math.round(parsed * 100);
}

function normalizePaymentMethod(
  value?: string | null
): GuestStayCheckoutPaymentMethodValue {
  return checkoutPaymentMethods.some((method) => method.value === value)
    ? (value as GuestStayCheckoutPaymentMethodValue)
    : 'CASH';
}

function makeCheckoutPaymentDraft(
  amount = '0.00',
  method: GuestStayCheckoutPaymentMethodValue = 'CASH'
): CheckoutPaymentDraft {
  const randomId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return {
    id: randomId,
    method,
    amount,
    reference: '',
    note: '',
  };
}

function toDateTimeLocalValue(value?: string | null) {
  if (!value) {
    return '';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const timezoneOffsetMs = date.getTimezoneOffset() * 60_000;
  const localDate = new Date(date.getTime() - timezoneOffsetMs);

  return localDate.toISOString().slice(0, 16);
}
type FrontDeskStatusTone = 'green' | 'amber' | 'red' | 'neutral';

function getDateKey(value: Date | string) {
  const date = typeof value === 'string' ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
  }).format(date);
}

function getStayFrontDeskStatus(stay: {
  status: GuestStayStatusValue;
  expectedCheckOutAt?: string | null;
}) {
  if (stay.status === 'CHECKED_OUT') {
    return {
      label: 'Checked Out',
      tone: 'neutral' as FrontDeskStatusTone,
    };
  }

  if (stay.status === 'CANCELLED') {
    return {
      label: 'Cancelled',
      tone: 'red' as FrontDeskStatusTone,
    };
  }

  if (stay.status === 'EXPIRED') {
    return {
      label: 'Expired',
      tone: 'red' as FrontDeskStatusTone,
    };
  }

  if (stay.expectedCheckOutAt) {
    const todayKey = getDateKey(new Date());
    const checkoutKey = getDateKey(stay.expectedCheckOutAt);

    if (checkoutKey && checkoutKey < todayKey) {
      return {
        label: 'Overdue Checkout',
        tone: 'red' as FrontDeskStatusTone,
      };
    }

    if (checkoutKey && checkoutKey === todayKey) {
      return {
        label: 'Checking Out Today',
        tone: 'amber' as FrontDeskStatusTone,
      };
    }
  }

  return {
    label: 'Active Stay',
    tone: 'green' as FrontDeskStatusTone,
  };
}

function FrontDeskStatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: FrontDeskStatusTone;
}) {
  const className =
    tone === 'green'
      ? 'bg-emerald-100 text-emerald-700'
      : tone === 'amber'
        ? 'bg-amber-100 text-amber-800'
        : tone === 'red'
          ? 'bg-red-100 text-red-700'
          : 'bg-neutral-100 text-neutral-600';

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide ${className}`}
    >
      {label}
    </span>
  );
}

function FrontDeskMetricCard({
  icon,
  label,
  value,
  helper,
  tone = 'neutral',
}: {
  icon?: React.ReactNode;
  label: string;
  value: number | string;
  helper: string;
  tone?: FrontDeskStatusTone;
}) {
  const className =
    tone === 'green'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : tone === 'amber'
        ? 'border-amber-200 bg-amber-50 text-amber-900'
        : tone === 'red'
          ? 'border-red-200 bg-red-50 text-red-900'
          : 'border-neutral-200 bg-neutral-50 text-neutral-900';

  const iconClassName =
    tone === 'green'
      ? 'bg-emerald-100 text-emerald-700'
      : tone === 'amber'
        ? 'bg-amber-100 text-amber-700'
        : tone === 'red'
          ? 'bg-red-100 text-red-700'
          : 'bg-white text-[#b88938]';

  return (
    <div className={`rounded-[1.75rem] border p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wide opacity-70">
            {label}
          </p>
          <p className="mt-2 text-3xl font-black">{value}</p>
          <p className="mt-1 text-xs font-bold opacity-70">{helper}</p>
        </div>

        {icon ? (
          <span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${iconClassName}`}>
            {icon}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function statusClass(status: GuestStayStatusValue) {
  if (status === 'ACTIVE') {
    return 'bg-emerald-100 text-emerald-700';
  }

  if (status === 'CHECKED_OUT') {
    return 'bg-neutral-100 text-neutral-600';
  }

  if (status === 'CANCELLED') {
    return 'bg-red-100 text-red-700';
  }

  return 'bg-amber-100 text-amber-700';
}

function formatStatus(status: string) {
  return status.replaceAll('_', ' ');
}

function formatLedgerLabel(value: string) {
  return value.replaceAll('_', ' ');
}

function formatPoints(points: number) {
  if (points > 0) {
    return `+${points}`;
  }

  return String(points);
}

function pointClass(points: number) {
  if (points > 0) {
    return 'text-emerald-700';
  }

  if (points < 0) {
    return 'text-red-700';
  }

  return 'text-neutral-600';
}

function escapeHtml(value?: string | null) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function buildPrintableReceiptHtml(stay: GuestStayRecord) {
  const folio = stay.checkoutSummary.folio;

  const lineRows = folio?.lines.length
    ? folio.lines
    : [
        {
          id: 'food',
          lineType: 'FOOD_ORDER',
          lineStatus: 'POSTED',
          title: 'Food Orders',
          description: '',
          quantity: 1,
          unitAmountCents: stay.checkoutSummary.foodTotalCents,
          amountCents: stay.checkoutSummary.foodTotalCents,
          postedAt: stay.checkedOutAt ?? stay.checkInAt,
          sourceOrderId: '',
          sourceRoomAddOnChargeId: '',
        },
        {
          id: 'services',
          lineType: 'SERVICE_CHARGE',
          lineStatus: 'POSTED',
          title: 'Service / Add-On Charges',
          description: '',
          quantity: 1,
          unitAmountCents: stay.checkoutSummary.serviceTotalCents,
          amountCents: stay.checkoutSummary.serviceTotalCents,
          postedAt: stay.checkedOutAt ?? stay.checkInAt,
          sourceOrderId: '',
          sourceRoomAddOnChargeId: '',
        },
      ].filter((line) => line.amountCents !== 0);

  const paymentRows = folio?.payments ?? [];

  const rowsHtml = lineRows
    .map(
      (line) => `
        <tr>
          <td>
            <strong>${escapeHtml(line.title)}</strong>
            ${
              line.description
                ? `<br><small>${escapeHtml(line.description)}</small>`
                : ''
            }
          </td>
          <td class="right">${money(line.amountCents)}</td>
        </tr>`
    )
    .join('');

  const paymentsHtml = paymentRows.length
    ? paymentRows
        .map(
          (payment) => `
            <tr>
              <td>
                ${escapeHtml(formatStatus(payment.paymentMethod))}
                ${
                  payment.reference
                    ? `<br><small>Ref: ${escapeHtml(payment.reference)}</small>`
                    : ''
                }
              </td>
              <td class="right">${money(payment.amountCents)}</td>
            </tr>`
        )
        .join('')
    : `<tr><td>No payment recorded</td><td class="right">${money(0)}</td></tr>`;

  return `<!doctype html>
<html>
<head>
  <title>${escapeHtml(folio?.folioNumber ?? 'Guest Stay Receipt')}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; font-family: Arial, sans-serif; color: #11100b; }
    .receipt { max-width: 380px; margin: 0 auto; }
    .center { text-align: center; }
    .muted { color: #666; font-size: 12px; }
    .line { border-top: 1px dashed #999; margin: 16px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    td { padding: 6px 0; vertical-align: top; }
    .right { text-align: right; white-space: nowrap; }
    .total td { border-top: 1px solid #111; padding-top: 10px; font-weight: 800; }
    h1 { margin: 0; font-size: 18px; }
    h2 { margin: 4px 0 0; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; }
    @media print {
      body { padding: 0; }
      .receipt { max-width: none; padding: 12px; }
    }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="center">
      <h1>${escapeHtml(stay.hotelName)}</h1>
      <h2>Guest Stay Receipt</h2>
      <p class="muted">${escapeHtml(folio?.folioNumber ?? 'Legacy Checkout')}</p>
    </div>

    <div class="line"></div>

    <table>
      <tr><td>Guest</td><td class="right">${escapeHtml(stay.guestName)}</td></tr>
      <tr><td>Room</td><td class="right">${escapeHtml(stay.roomNumber)} ${
        stay.roomName ? `· ${escapeHtml(stay.roomName)}` : ''
      }</td></tr>
      <tr><td>Check-in</td><td class="right">${escapeHtml(formatDateTime(stay.checkInAt))}</td></tr>
      <tr><td>Checkout</td><td class="right">${escapeHtml(formatDateTime(stay.checkedOutAt))}</td></tr>
    </table>

    <div class="line"></div>

    <table>
      ${rowsHtml}
      <tr><td>Food Total</td><td class="right">${money(stay.checkoutSummary.foodTotalCents)}</td></tr>
      <tr><td>Service Total</td><td class="right">${money(stay.checkoutSummary.serviceTotalCents)}</td></tr>
      <tr><td>Manual Charges</td><td class="right">${money(stay.checkoutSummary.manualChargeCents)}</td></tr>
      <tr><td>Discounts</td><td class="right">-${money(stay.checkoutSummary.discountCents)}</td></tr>
      <tr class="total"><td>Subtotal</td><td class="right">${money(stay.checkoutSummary.subtotalCents)}</td></tr>
    </table>

    <div class="line"></div>

    <table>
      ${paymentsHtml}
      <tr class="total"><td>Paid</td><td class="right">${money(stay.checkoutSummary.paymentCents)}</td></tr>
      <tr class="total"><td>Balance Due</td><td class="right">${money(stay.checkoutSummary.balanceDueCents)}</td></tr>
    </table>

    <div class="line"></div>

    <p class="center muted">Thank you for staying with us.</p>
  </div>

  <script>
    window.onload = function () {
      window.focus();
      window.print();
    };
  </script>
</body>
</html>`;
}


function Modal({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/55 px-4 py-6 backdrop-blur-sm">
      <section className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-[2rem] bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-neutral-100 px-6 py-5">
          <div>
            <h2 className="text-xl font-black text-[#11100b]">{title}</h2>
            {description ? (
              <p className="mt-1 text-sm font-semibold text-neutral-500">
                {description}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="grid size-10 place-items-center rounded-full bg-neutral-100 text-neutral-600 transition hover:bg-neutral-200"
            aria-label="Close modal"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="max-h-[calc(92vh-88px)] overflow-y-auto p-6">
          {children}
        </div>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-black uppercase text-neutral-500">{label}</p>
      <p className="mt-1 text-3xl font-black text-[#11100b]">{value}</p>
    </div>
  );
}

function PointStatCard({
  icon,
  label,
  value,
  helper,
}: {
  icon?: React.ReactNode;
  label: string;
  value: number | string;
  helper?: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-[#c99c38]/20 bg-[#fff8e7] p-4">
      <div className="flex items-center gap-2 text-[#9a6b18]">
        {icon}
        <p className="text-xs font-black uppercase tracking-wide">{label}</p>
      </div>

      <p className="mt-2 text-3xl font-black text-[#11100b]">{value}</p>

      {helper ? (
        <p className="mt-1 text-xs font-bold text-[#9a6b18]/70">{helper}</p>
      ) : null}
    </div>
  );
}

function PointLedgerList({
  ledgers,
}: {
  ledgers: PointLedgerRecord[];
}) {
  if (!ledgers.length) {
    return (
      <div className="rounded-[1.5rem] border border-dashed border-neutral-200 bg-neutral-50 p-5 text-center">
        <p className="text-sm font-black text-neutral-700">
          No point ledger yet.
        </p>
        <p className="mt-1 text-xs font-semibold text-neutral-500">
          Check-in, completed orders, and completed requests will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {ledgers.map((ledger) => (
        <div
          key={ledger.id}
          className="rounded-[1.25rem] border border-neutral-200 bg-white p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-black text-[#11100b]">
                {ledger.description || formatLedgerLabel(ledger.source)}
              </p>

              <p className="mt-1 text-xs font-semibold text-neutral-500">
                {formatLedgerLabel(ledger.type)} ·{' '}
                {formatLedgerLabel(ledger.status)} ·{' '}
                {formatDateTime(ledger.createdAt)}
              </p>
            </div>

            <span
              className={`shrink-0 rounded-full bg-neutral-100 px-3 py-1 text-xs font-black ${pointClass(
                ledger.points
              )}`}
            >
              {formatPoints(ledger.points)} pts
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function GuestStaysClient({
  hotels,
  rooms,
  guestStays,
  defaultHotelId,
  isSuperAdmin,
}: {
  hotels: HotelOption[];
  rooms: RoomOption[];
  guestStays: GuestStayRecord[];
  defaultHotelId: string;
  isSuperAdmin: boolean;
}) {
  const router = useRouter();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [viewStay, setViewStay] = useState<GuestStayRecord | null>(null);
  const [editStay, setEditStay] = useState<GuestStayRecord | null>(null);
  const [checkoutStay, setCheckoutStay] = useState<GuestStayRecord | null>(null);
  const [selectedHotelId, setSelectedHotelId] = useState(defaultHotelId);
  const [createdStay, setCreatedStay] = useState<CreatedStayResult | null>(
    null
  );
  const [createSendPasscodeSms, setCreateSendPasscodeSms] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [guestStayPage, setGuestStayPage] = useState(1);
  const [guestStayPageSize, setGuestStayPageSize] = useState<number>(5);
  const [checkoutManualChargeAmount, setCheckoutManualChargeAmount] =
    useState('0.00');
  const [checkoutDiscountAmount, setCheckoutDiscountAmount] =
    useState('0.00');
  const [checkoutPayments, setCheckoutPayments] = useState<
    CheckoutPaymentDraft[]
  >([]);
  const [isPending, startTransition] = useTransition();

  const filteredRooms = useMemo(() => {
    return rooms.filter((room) => room.hotelId === selectedHotelId);
  }, [rooms, selectedHotelId]);

  const totalGuestStayPages = Math.max(
  1,
  Math.ceil(guestStays.length / guestStayPageSize)
);

const currentGuestStayPage = Math.min(guestStayPage, totalGuestStayPages);

const paginatedGuestStays = useMemo(() => {
  const startIndex = (currentGuestStayPage - 1) * guestStayPageSize;

  return guestStays.slice(startIndex, startIndex + guestStayPageSize);
}, [currentGuestStayPage, guestStayPageSize, guestStays]);

const guestStayPaginationStart = guestStays.length
  ? (currentGuestStayPage - 1) * guestStayPageSize + 1
  : 0;

const guestStayPaginationEnd = Math.min(
  currentGuestStayPage * guestStayPageSize,
  guestStays.length
);

const guestStayPageItems = getGuestStayPageItems(
  currentGuestStayPage,
  totalGuestStayPages
);

 const activeCount = guestStays.filter(
  (stay) => stay.status === 'ACTIVE'
).length;

const checkedOutCount = guestStays.filter(
  (stay) => stay.status === 'CHECKED_OUT'
).length;

const checkingOutTodayCount = guestStays.filter((stay) => {
  if (stay.status !== 'ACTIVE' || !stay.expectedCheckOutAt) {
    return false;
  }

  return getDateKey(stay.expectedCheckOutAt) === getDateKey(new Date());
}).length;

const overdueCheckoutCount = guestStays.filter((stay) => {
  if (stay.status !== 'ACTIVE' || !stay.expectedCheckOutAt) {
    return false;
  }

  const checkoutKey = getDateKey(stay.expectedCheckOutAt);
  const todayKey = getDateKey(new Date());

  return Boolean(checkoutKey) && checkoutKey < todayKey;
}).length;

const checkoutPreviewTotals = useMemo(() => {
  const foodTotalCents = checkoutStay?.checkoutSummary.foodTotalCents ?? 0;
  const serviceTotalCents = checkoutStay?.checkoutSummary.serviceTotalCents ?? 0;
  const manualChargeCents = inputAmountToCents(checkoutManualChargeAmount);
  const discountRequestCents = inputAmountToCents(checkoutDiscountAmount);
  const subtotalBeforeDiscountCents =
    foodTotalCents + serviceTotalCents + manualChargeCents;
  const discountCents = Math.min(
    discountRequestCents,
    subtotalBeforeDiscountCents
  );
  const subtotalCents = Math.max(
    subtotalBeforeDiscountCents - discountCents,
    0
  );
  const paymentCents = checkoutPayments.reduce(
    (sum, payment) => sum + inputAmountToCents(payment.amount),
    0
  );

  return {
    foodTotalCents,
    serviceTotalCents,
    manualChargeCents,
    discountCents,
    subtotalCents,
    paymentCents,
    balanceDueCents: Math.max(subtotalCents - paymentCents, 0),
  };
}, [
  checkoutDiscountAmount,
  checkoutManualChargeAmount,
  checkoutPayments,
  checkoutStay,
]);

    const [revealedPasscodes, setRevealedPasscodes] = useState<
    Record<string, string>
    >({});
    const [passcodeLoadingId, setPasscodeLoadingId] = useState('');
  function resetFeedback() {
    setMessage('');
    setError('');
  }

  function openCreateModal() {
    resetFeedback();
    setCreatedStay(null);
    setCreateSendPasscodeSms(false);
    setSelectedHotelId(defaultHotelId);
    setIsCreateOpen(true);
  }

  function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);

    resetFeedback();
    setCreatedStay(null);

    startTransition(() => {
      void (async () => {
        const result = await createGuestStayAction(formData);

        if (!result.ok) {
          setError(result.error);
          return;
        }

        setCreatedStay({
          passcode: result.passcode,
          guestName: result.guestName,
          roomNumber: result.roomNumber,
          hotelName: result.hotelName,
          maxDevices: result.maxDevices,
          smsRequested: result.smsRequested,
          smsSent: result.smsSent,
          smsRecipient: result.smsRecipient,
          smsWarning: result.smsWarning,
        });

        form.reset();
        setCreateSendPasscodeSms(false);
        router.refresh();
      })();
    });
  }

  function handleEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    resetFeedback();

    startTransition(() => {
      void (async () => {
        const result = await updateGuestStayAction(formData);

        if (!result.ok) {
          setError(result.error);
          return;
        }

        setMessage(result.message);
        setEditStay(null);
        router.refresh();
      })();
    });
  }

  function openCheckoutModal(stay: GuestStayRecord) {
    resetFeedback();
    setViewStay(null);
    setCheckoutManualChargeAmount(
      centsToInputAmount(stay.checkoutSummary.manualChargeCents)
    );
    setCheckoutDiscountAmount(
      centsToInputAmount(stay.checkoutSummary.discountCents)
    );
    setCheckoutPayments([
      makeCheckoutPaymentDraft(
        centsToInputAmount(stay.checkoutSummary.balanceDueCents),
        normalizePaymentMethod(stay.checkoutSummary.paymentMethod || 'CASH')
      ),
    ]);
    setCheckoutStay(stay);
  }

  function handleCheckoutSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    resetFeedback();

    startTransition(() => {
      void (async () => {
        const result = await checkoutGuestStayAction(formData);

        if (!result.ok) {
          setError(result.error);
          return;
        }

        setMessage(result.message);
        setCheckoutStay(null);
        router.refresh();
      })();
    });
  }

  function updateCheckoutPayment(
    paymentId: string,
    updates: Partial<Omit<CheckoutPaymentDraft, 'id'>>
  ) {
    setCheckoutPayments((current) =>
      current.map((payment) =>
        payment.id === paymentId
          ? {
              ...payment,
              ...updates,
            }
          : payment
      )
    );
  }

  function addCheckoutPayment() {
    setCheckoutPayments((current) => [
      ...current,
      makeCheckoutPaymentDraft(
        centsToInputAmount(checkoutPreviewTotals.balanceDueCents)
      ),
    ]);
  }

  function removeCheckoutPayment(paymentId: string) {
    setCheckoutPayments((current) =>
      current.filter((payment) => payment.id !== paymentId)
    );
  }

  function handlePrintReceipt(stay: GuestStayRecord) {
    const printWindow = window.open('', '_blank', 'width=420,height=720');

    if (!printWindow) {
      setError('Please allow pop-ups to print the receipt.');
      return;
    }

    printWindow.document.open();
    printWindow.document.write(buildPrintableReceiptHtml(stay));
    printWindow.document.close();

    const formData = new FormData();
    formData.set('guestStayId', stay.id);

    startTransition(() => {
      void (async () => {
        const result = await markGuestStayReceiptPrintedAction(formData);

        if (!result.ok) {
          setError(result.error);
          return;
        }

        router.refresh();
      })();
    });
  }

  function handleViewPasscode(guestStayId: string) {
  const formData = new FormData();
  formData.set('guestStayId', guestStayId);

  resetFeedback();
  setPasscodeLoadingId(guestStayId);

  startTransition(() => {
    void (async () => {
      try {
        const result = await getGuestStayPasscodeAction(formData);

        if (!result.ok) {
          setError(result.error);
          return;
        }

        setRevealedPasscodes((current) => ({
          ...current,
          [guestStayId]: result.passcode,
        }));
      } finally {
        setPasscodeLoadingId('');
      }
    })();
  });
}

function handleResetPasscode(guestStayId: string) {
  const confirmed = window.confirm(
    'Reset this room passcode? The old passcode will no longer work for new devices.'
  );

  if (!confirmed) {
    return;
  }

  const formData = new FormData();
  formData.set('guestStayId', guestStayId);

  resetFeedback();
  setPasscodeLoadingId(guestStayId);

  startTransition(() => {
    void (async () => {
      try {
        const result = await resetGuestStayPasscodeAction(formData);

        if (!result.ok) {
          setError(result.error);
          return;
        }

        setRevealedPasscodes((current) => ({
          ...current,
          [guestStayId]: result.passcode,
        }));

        setMessage(result.message);
        router.refresh();
      } finally {
        setPasscodeLoadingId('');
      }
    })();
  });
}

  return (
    <div className="space-y-7">
      {message ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-bold text-emerald-700">
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-700">
          {error}
        </div>
      ) : null}

<section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
  <FrontDeskMetricCard
    icon={<UserCheck className="size-5" />}
    label="Active Stays"
    value={activeCount}
    helper="Currently checked in"
    tone="green"
  />

  <FrontDeskMetricCard
    icon={<CalendarClock className="size-5" />}
    label="Checking Out Today"
    value={checkingOutTodayCount}
    helper="Expected checkout is today"
    tone="amber"
  />

  <FrontDeskMetricCard
    icon={<AlertTriangle className="size-5" />}
    label="Overdue Checkout"
    value={overdueCheckoutCount}
    helper="Past expected checkout"
    tone="red"
  />

  <FrontDeskMetricCard
    icon={<DoorOpen className="size-5" />}
    label="Checked Out"
    value={checkedOutCount}
    helper="Completed stays"
  />
</section>

<section className="flex flex-col gap-3 rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
  <div>
    <p className="text-xs font-black uppercase tracking-[0.2em] text-[#b88938]">
      Stay Records
    </p>

    <h2 className="mt-1 text-xl font-black text-[#11100b]">
      Room Stay List
    </h2>

    <p className="mt-1 text-sm font-medium text-neutral-500">
      View, edit, check out, and manage active or recent guest room stays.
    </p>
  </div>

  <button
    type="button"
    onClick={openCreateModal}
    className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#11100b] px-5 text-sm font-black text-white transition hover:bg-[#2a2417]"
  >
    <Plus className="size-4" />
    Check In Guest
  </button>
</section>


      <section className="rounded-[2rem] border border-neutral-200 bg-white shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1240px] text-left">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-5 py-3 text-xs font-black uppercase text-neutral-500">
                  Guest
                </th>
                <th className="px-5 py-3 text-xs font-black uppercase text-neutral-500">
                  Hotel / Room
                </th>
                <th className="px-5 py-3 text-xs font-black uppercase text-neutral-500">
                  Devices
                </th>
                <th className="px-5 py-3 text-xs font-black uppercase text-neutral-500">
                  Orders / Requests
                </th>
                <th className="px-5 py-3 text-xs font-black uppercase text-neutral-500">
                  Points
                </th>
                <th className="px-5 py-3 text-xs font-black uppercase text-neutral-500">
                  Check-in
                </th>
                <th className="px-5 py-3 text-xs font-black uppercase text-neutral-500">
                  Expected Checkout
                </th>
                <th className="px-5 py-3 text-xs font-black uppercase text-neutral-500">
                  Status
                </th>
                <th className="px-5 py-3 text-xs font-black uppercase text-neutral-500">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody>
             {paginatedGuestStays.map((stay) => {
             const frontDeskStatus = getStayFrontDeskStatus(stay);

          return (
            <tr key={stay.id} className="border-t border-neutral-100">
                  <td className="px-5 py-4">
                    <p className="font-black">{stay.guestName}</p>
                    <p className="text-xs font-semibold text-neutral-500">
                      {stay.guestPhone || stay.guestEmail || 'No contact'}
                    </p>
                  </td>

                  <td className="px-5 py-4">
                    <p className="font-black">{stay.hotelName}</p>
                    <p className="text-xs font-semibold text-neutral-500">
                      Room {stay.roomNumber}
                      {stay.roomName ? ` — ${stay.roomName}` : ''}
                    </p>
                  </td>

                  <td className="px-5 py-4 font-bold">
                    {stay.activeDevices} / {stay.maxDevices}
                  </td>

                  <td className="px-5 py-4 font-bold">
                    {stay.orderCount} orders · {stay.serviceRequestCount}{' '}
                    requests
                  </td>

                                  <td className="px-5 py-4">
                  <p className="font-black text-[#11100b]">
                    {stay.availablePoints} available
                  </p>
                  <p className="text-xs font-semibold text-neutral-500">
                    {stay.netStayPoints} this stay
                  </p>
                </td>

                  <td className="px-5 py-4 text-sm font-bold">
                    {formatDateTime(stay.checkInAt)}
                  </td>

                  <td className="px-5 py-4 text-sm font-bold">
                    {formatDateTime(stay.expectedCheckOutAt)}
                  </td>

                  <td className="px-5 py-4">
                    <div className="space-y-1">
                    <FrontDeskStatusBadge
                      label={frontDeskStatus.label}
                      tone={frontDeskStatus.tone}
                    />

                    <p className="text-[11px] font-semibold text-neutral-400">
                      System: {formatStatus(stay.status)}
                    </p>
                  </div>
                  </td>

                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          resetFeedback();
                          setViewStay(stay);
                        }}
                        className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-3 py-2 text-xs font-black text-neutral-700 transition hover:bg-neutral-200"
                      >
                        <Eye className="size-3.5" />
                        View
                      </button>

                      {stay.status === 'ACTIVE' ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              resetFeedback();
                              setEditStay(stay);
                            }}
                            className="inline-flex items-center gap-1 rounded-full bg-[#fff8e7] px-3 py-2 text-xs font-black text-[#9a6b18] transition hover:bg-[#f7e4ad]"
                          >
                            <Pencil className="size-3.5" />
                            Edit
                          </button>

                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => openCheckoutModal(stay)}
                            className="inline-flex items-center gap-1 rounded-full bg-[#11100b] px-3 py-2 text-xs font-black text-white transition hover:bg-[#2a2417] disabled:opacity-60"
                          >
                            <LogOut className="size-3.5" />
                            Checkout
                          </button>
                        </>
                      ) : null}
                    </div>
                  </td>
                    </tr>
              );
            })}

              {!guestStays.length ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-5 py-10 text-center font-bold text-neutral-500"
                  >
                    No guest stays yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
                   </table>
        </div>

        {guestStays.length > 0 ? (
          <div className="flex flex-col gap-4 border-t border-neutral-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={currentGuestStayPage <= 1}
                onClick={() =>
                  setGuestStayPage((page) => Math.max(1, page - 1))
                }
                className="inline-flex h-10 items-center justify-center rounded-xl border border-neutral-200 bg-white px-4 text-xs font-black text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>

              {guestStayPageItems.map((item, index) =>
                typeof item === 'number' ? (
                  <button
                    key={item}
                    type="button"
                    aria-current={
                      item === currentGuestStayPage ? 'page' : undefined
                    }
                    onClick={() => setGuestStayPage(item)}
                    className={
                      item === currentGuestStayPage
                        ? 'grid size-10 place-items-center rounded-xl bg-[#11100b] text-xs font-black text-white shadow-sm'
                        : 'grid size-10 place-items-center rounded-xl border border-neutral-200 bg-white text-xs font-black text-neutral-700 transition hover:bg-neutral-50'
                    }
                  >
                    {item}
                  </button>
                ) : (
                  <span
                    key={`${item}-${index}`}
                    className="grid size-10 place-items-center text-xs font-black text-neutral-400"
                  >
                    ...
                  </span>
                )
              )}

              <button
                type="button"
                disabled={currentGuestStayPage >= totalGuestStayPages}
                onClick={() =>
                  setGuestStayPage((page) =>
                    Math.min(totalGuestStayPages, page + 1)
                  )
                }
                className="inline-flex h-10 items-center justify-center rounded-xl border border-neutral-200 bg-white px-4 text-xs font-black text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-neutral-500">
              <span>
                Showing{' '}
                <b className="text-[#11100b]">{guestStayPaginationStart}</b>
                {' '}to{' '}
                <b className="text-[#11100b]">{guestStayPaginationEnd}</b>
                {' '}of{' '}
                <b className="text-[#11100b]">{guestStays.length}</b>
              </span>

              <label className="flex items-center gap-2">
                <span>Rows</span>

                <select
                  value={guestStayPageSize}
                  onChange={(event) => {
                    setGuestStayPageSize(Number(event.target.value));
                    setGuestStayPage(1);
                  }}
                  className="h-10 rounded-xl border border-neutral-200 bg-white px-3 text-xs font-black text-[#11100b] outline-none transition focus:border-[#b88938] focus:ring-4 focus:ring-[#b88938]/10"
                >
                  {GUEST_STAYS_PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        ) : null}
      </section>

      {isCreateOpen ? (
        <Modal
          title="Create Guest Stay"
          description="Check in a guest, generate a room passcode, and set device limits."
          onClose={() => setIsCreateOpen(false)}
        >
          {createdStay ? (
            <div className="mb-5 rounded-[1.5rem] border border-emerald-200 bg-emerald-50 p-5">
              <div className="flex items-center gap-2 text-emerald-800">
                <CheckCircle2 className="size-5" />
                <p className="text-sm font-black">
                  Guest stay created successfully.
                </p>
              </div>

              <div className="mt-4 rounded-2xl bg-white p-4">
                <p className={labelClass}>Room Passcode</p>
                <p className="mt-1 font-mono text-4xl font-black tracking-[0.2em] text-[#11100b]">
                  {createdStay.passcode}
                </p>
              </div>

              <p className="mt-3 text-sm font-bold leading-6 text-emerald-800">
                Give this passcode to <b>{createdStay.guestName}</b> for Room{' '}
                <b>{createdStay.roomNumber}</b>. Allowed devices:{' '}
                <b>{createdStay.maxDevices}</b>.
              </p>

              {createdStay.smsRequested ? (
                <div
                  className={
                    createdStay.smsSent
                      ? 'mt-4 rounded-2xl border border-emerald-200 bg-white p-4'
                      : 'mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4'
                  }
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={
                        createdStay.smsSent
                          ? 'grid size-10 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-emerald-700'
                          : 'grid size-10 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-700'
                      }
                    >
                      <MessageSquare className="size-5" />
                    </span>

                    <div>
                      <p
                        className={
                          createdStay.smsSent
                            ? 'text-sm font-black text-emerald-800'
                            : 'text-sm font-black text-amber-800'
                        }
                      >
                        {createdStay.smsSent
                          ? 'Passcode SMS sent'
                          : 'Passcode SMS not sent'}
                      </p>
                      <p className="mt-1 text-xs font-bold leading-5 text-neutral-600">
                        Recipient: {createdStay.smsRecipient || '—'}
                        {createdStay.smsWarning
                          ? ` · ${createdStay.smsWarning}`
                          : ''}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              <p className="mt-2 text-xs font-bold text-emerald-700/80">
                This passcode is shown only now. Store or send it to the guest
                before closing this modal.
              </p>
            </div>
          ) : null}

          <form onSubmit={handleCreateSubmit} className="grid gap-4">
            {isSuperAdmin ? (
              <label className="grid gap-1">
                <span className={labelClass}>Hotel</span>
                <select
                  name="hotelId"
                  value={selectedHotelId}
                  onChange={(event) => setSelectedHotelId(event.target.value)}
                  className={inputClass}
                  required
                >
                  {hotels.map((hotel) => (
                    <option key={hotel.id} value={hotel.id}>
                      {hotel.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <input type="hidden" name="hotelId" value={selectedHotelId} />
            )}

            <label className="grid gap-1">
              <span className={labelClass}>Room</span>
              <select name="roomId" className={inputClass} required>
                <option value="">Select room</option>
                {filteredRooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    Room {room.number} {room.name ? `— ${room.name}` : ''}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1">
              <span className={labelClass}>Guest Name</span>
              <input
                name="guestName"
                placeholder="Guest full name"
                className={inputClass}
                required
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1">
                <span className={labelClass}>Phone</span>
                <input
                  name="phone"
                  inputMode="tel"
                  placeholder="09XXXXXXXXX"
                  className={inputClass}
                  required={createSendPasscodeSms}
                />
              </label>

              <label className="grid gap-1">
                <span className={labelClass}>Email</span>
                <input
                  name="email"
                  type="email"
                  placeholder="Email address"
                  className={inputClass}
                />
              </label>
            </div>

            <label className="flex items-start gap-3 rounded-[1.5rem] border border-[#c99c38]/25 bg-[#fffaf0] p-4">
              <input
                type="checkbox"
                name="sendPasscodeSms"
                value="yes"
                checked={createSendPasscodeSms}
                onChange={(event) =>
                  setCreateSendPasscodeSms(event.currentTarget.checked)
                }
                className="mt-1 size-4 rounded border-neutral-300 accent-[#b88938]"
              />

              <span>
                <span className="flex items-center gap-2 text-sm font-black text-[#11100b]">
                  <MessageSquare className="size-4 text-[#b88938]" />
                  Send room passcode via SMS
                </span>
                <span className="mt-1 block text-xs font-semibold leading-5 text-neutral-500">
                  Sends only the guest room passcode and NFC instructions. The
                  internal NFC tag secret is never sent.
                </span>
              </span>
            </label>

            {createSendPasscodeSms ? (
              <div className="rounded-[1.25rem] border border-dashed border-emerald-200 bg-emerald-50 p-4">
                <p className="text-xs font-black uppercase tracking-wide text-emerald-700">
                  SMS Preview
                </p>
                <p className="mt-1 text-sm font-bold leading-6 text-emerald-900">
                  Welcome message will include the selected room number, the
                  generated passcode, and instructions to scan the room NFC tag.
                </p>
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1">
                <span className={labelClass}>Max Devices</span>
                <input
                  name="maxDevices"
                  type="number"
                  min="1"
                  max="10"
                  defaultValue={2}
                  className={inputClass}
                  required
                />
              </label>

              <label className="grid gap-1">
                <span className={labelClass}>Expected Checkout</span>
                <input
                  name="expectedCheckOutAt"
                  type="datetime-local"
                  className={inputClass}
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="mt-2 inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#11100b] text-sm font-black text-white disabled:opacity-60"
            >
              <KeyRound className="size-4" />
              {isPending ? 'Creating Stay...' : 'Create Stay & Generate Passcode'}
            </button>
          </form>
        </Modal>
      ) : null}

      {viewStay ? (
        <Modal
          title="View Guest Stay"
          description="Stay details, device usage, orders, and service request summary."
          onClose={() => setViewStay(null)}
        >
          <div className="grid gap-4">
            <div className="rounded-[1.5rem] bg-[#11100b] p-5 text-white">
              <div className="flex items-start gap-3">
                <span className="grid size-12 place-items-center rounded-2xl bg-[#c99c38] text-black">
                  <UserCheck className="size-6" />
                </span>

                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-[#c99c38]">
                    Guest
                  </p>
                  <h3 className="mt-1 text-2xl font-black">
                    {viewStay.guestName}
                  </h3>
                  <p className="mt-1 text-sm font-semibold text-white/55">
                    {viewStay.guestPhone ||
                      viewStay.guestEmail ||
                      'No contact provided'}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-[#c99c38]/25 bg-[#fffaf0] p-5">
  <div className="mb-4 flex items-center gap-2">
    <span className="grid size-10 place-items-center rounded-2xl bg-[#c99c38] text-black">
      <Coins className="size-5" />
    </span>

    <div>
      <h3 className="text-lg font-black text-[#11100b]">
        Point Synchronization
      </h3>
      <p className="text-xs font-semibold text-neutral-500">
        Points are linked to the guest profile and this room stay.
      </p>
    </div>
  </div>

        <div className="grid gap-3 md:grid-cols-4">
          <PointStatCard
            icon={<Coins className="size-4" />}
            label="Available"
            value={viewStay.availablePoints}
            helper="Redeemable"
          />

          <PointStatCard
            icon={<History className="size-4" />}
            label="Pending"
            value={viewStay.pendingPoints}
            helper="Not final yet"
          />

          <PointStatCard
            icon={<Trophy className="size-4" />}
            label="This Stay"
            value={viewStay.netStayPoints}
            helper={`${viewStay.confirmedStayPoints} earned · ${viewStay.voidedStayPoints} voided`}
          />

          <PointStatCard
            label="Lifetime"
            value={viewStay.lifetimeEarnedPoints}
            helper={`${viewStay.lifetimeRedeemedPoints} redeemed`}
          />
        </div>

        <div className="mt-5">
          <p className="mb-2 text-xs font-black uppercase tracking-wide text-neutral-500">
            Recent Point Ledger
          </p>

          <PointLedgerList ledgers={viewStay.recentPointLedgers} />
        </div>
      </div>

            <div className="grid gap-3 md:grid-cols-2">
              <InfoCard
                icon={<BedDouble className="size-5" />}
                label="Room"
                value={`Room ${viewStay.roomNumber}${
                  viewStay.roomName ? ` · ${viewStay.roomName}` : ''
                }`}
              />
              <div className="rounded-[1.5rem] border border-neutral-200 bg-neutral-50 p-4">
                <div className="flex items-center gap-2 text-[#b88938]">
                    <KeyRound className="size-5" />
                    <p className="text-xs font-black uppercase tracking-wide">
                    Passcode
                    </p>
                </div>

                {revealedPasscodes[viewStay.id] ? (
                    <p className="mt-2 font-mono text-3xl font-black tracking-[0.18em] text-[#11100b]">
                    {revealedPasscodes[viewStay.id]}
                    </p>
                ) : (
                    <p className="mt-2 text-sm font-black text-[#11100b]">
                    Hidden for security
                    </p>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                    <button
                    type="button"
                    disabled={passcodeLoadingId === viewStay.id}
                    onClick={() => handleViewPasscode(viewStay.id)}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-full bg-[#11100b] px-3 text-xs font-black text-white disabled:opacity-60"
                    >
                    <Eye className="size-3.5" />
                    {passcodeLoadingId === viewStay.id ? 'Loading...' : 'View'}
                    </button>

                    {viewStay.status === 'ACTIVE' ? (
                    <button
                        type="button"
                        disabled={passcodeLoadingId === viewStay.id}
                        onClick={() => handleResetPasscode(viewStay.id)}
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-full bg-[#fff8e7] px-3 text-xs font-black text-[#9a6b18] disabled:opacity-60"
                    >
                        <RefreshCw className="size-3.5" />
                        Reset
                    </button>
                    ) : null}
                </div>

                <p className="mt-2 text-[11px] font-semibold leading-4 text-neutral-500">
                    Resetting changes the passcode for new device authorization.
                </p>
                </div>
              <InfoCard
                label="Devices"
                value={`${viewStay.activeDevices} / ${viewStay.maxDevices} active`}
              />
              <InfoCard
                label="Orders / Requests"
                value={`${viewStay.orderCount} orders · ${viewStay.serviceRequestCount} requests`}
              />
              <InfoCard
                label="Check-in"
                value={formatDateTime(viewStay.checkInAt)}
              />
              <InfoCard
                label="Expected Checkout"
                value={formatDateTime(viewStay.expectedCheckOutAt)}
              />
              <InfoCard
                label="Checked Out"
                value={formatDateTime(viewStay.checkedOutAt)}
              />
              <InfoCard label="Status" value={formatStatus(viewStay.status)} />
            </div>

            {viewStay.checkoutSummary.folio ? (
              <FolioSummaryCard
                stay={viewStay}
                onPrint={() => handlePrintReceipt(viewStay)}
              />
            ) : null}

            {viewStay.status === 'ACTIVE' ? (
              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditStay(viewStay);
                    setViewStay(null);
                  }}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[#fff8e7] px-4 text-sm font-black text-[#9a6b18]"
                >
                  <Pencil className="size-4" />
                  Edit Stay
                </button>

                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => openCheckoutModal(viewStay)}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[#11100b] px-4 text-sm font-black text-white disabled:opacity-60"
                >
                  <LogOut className="size-4" />
                  Checkout
                </button>
              </div>
            ) : null}
          </div>
        </Modal>
      ) : null}


      {checkoutStay ? (
        <Modal
          title="Checkout Details"
          description="Review food orders, service charges, payment option, and final balance before checking out the guest."
          onClose={() => setCheckoutStay(null)}
        >
          <form onSubmit={handleCheckoutSubmit} className="grid gap-5">
            <input type="hidden" name="guestStayId" value={checkoutStay.id} />

            <div className="overflow-hidden rounded-[1.75rem] border border-[#c99c38]/25 bg-[#11100b] text-white">
              <div className="flex flex-col gap-4 p-5 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-[#d6a738]">
                    Stay Settlement
                  </p>
                  <h3 className="mt-2 text-2xl font-black">
                    Room {checkoutStay.roomNumber}
                    {checkoutStay.roomName ? ` · ${checkoutStay.roomName}` : ''}
                  </h3>
                  <p className="mt-1 text-sm font-semibold text-white/60">
                    {checkoutStay.guestName} · {checkoutStay.hotelName}
                  </p>
                </div>

                <div className="rounded-2xl bg-white/10 p-4 text-right">
                  <p className="text-xs font-black uppercase tracking-wide text-white/45">
                    Balance Due
                  </p>
                  <p className="mt-1 text-3xl font-black text-[#f1c66a]">
                    {money(checkoutPreviewTotals.balanceDueCents)}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <InfoCard
                icon={<ReceiptText className="size-5" />}
                label="Food Orders"
                value={money(checkoutStay.checkoutSummary.foodTotalCents)}
              />
              <InfoCard
                icon={<WalletCards className="size-5" />}
                label="Service Charges"
                value={money(checkoutStay.checkoutSummary.serviceTotalCents)}
              />
              <InfoCard
                icon={<Calculator className="size-5" />}
                label="Current Subtotal"
                value={money(checkoutPreviewTotals.subtotalCents)}
              />
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="grid gap-4">
                <section className="rounded-[1.5rem] border border-neutral-200 bg-neutral-50 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-wide text-neutral-500">
                        Food Orders
                      </p>
                      <p className="text-sm font-semibold text-neutral-500">
                        Ready or delivered unpaid food orders are included.
                      </p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#11100b]">
                      {money(checkoutStay.checkoutSummary.foodTotalCents)}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {checkoutStay.checkoutSummary.orders.length ? (
                      checkoutStay.checkoutSummary.orders.map((order) => (
                        <div
                          key={order.id}
                          className="rounded-2xl border border-neutral-200 bg-white p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-black text-[#11100b]">
                                {order.orderCode}
                              </p>
                              <p className="mt-1 text-xs font-semibold text-neutral-500">
                                {formatStatus(order.status)} ·{' '}
                                {formatStatus(order.paymentStatus)} ·{' '}
                                {formatDateTime(order.createdAt)}
                              </p>
                            </div>
                            <p className="shrink-0 text-sm font-black text-[#11100b]">
                              {money(order.amountCents)}
                            </p>
                          </div>

                          <div className="mt-3 space-y-1">
                            {order.items.map((item) => (
                              <p
                                key={item.id}
                                className="text-xs font-semibold text-neutral-600"
                              >
                                {Math.max(item.quantity - item.cancelledQty, 0)}
                                × {item.name}
                                {item.cancelledQty > 0 ? (
                                  <span className="ml-2 text-red-600">
                                    {item.cancelledQty} cancelled
                                  </span>
                                ) : null}
                              </p>
                            ))}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="rounded-2xl border border-dashed border-neutral-200 bg-white p-5 text-center text-sm font-bold text-neutral-500">
                        No unpaid ready or delivered food orders.
                      </p>
                    )}
                  </div>
                </section>

                <section className="rounded-[1.5rem] border border-neutral-200 bg-neutral-50 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-wide text-neutral-500">
                        Service / Add-On Charges
                      </p>
                      <p className="text-sm font-semibold text-neutral-500">
                        Posted unpaid service charges from completed requests.
                      </p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#11100b]">
                      {money(checkoutStay.checkoutSummary.serviceTotalCents)}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {checkoutStay.checkoutSummary.serviceCharges.length ? (
                      checkoutStay.checkoutSummary.serviceCharges.map((charge) => (
                        <div
                          key={charge.id}
                          className="rounded-2xl border border-neutral-200 bg-white p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-black text-[#11100b]">
                                {charge.itemName}
                              </p>
                              <p className="mt-1 text-xs font-semibold text-neutral-500">
                                {charge.requestCode} · {charge.requestType} ·{' '}
                                {formatStatus(charge.paymentStatus)}
                              </p>
                              {charge.description ? (
                                <p className="mt-1 text-xs font-medium text-neutral-500">
                                  {charge.description}
                                </p>
                              ) : null}
                            </div>
                            <p className="shrink-0 text-sm font-black text-[#11100b]">
                              {money(charge.totalAmountCents)}
                            </p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="rounded-2xl border border-dashed border-neutral-200 bg-white p-5 text-center text-sm font-bold text-neutral-500">
                        No unpaid service or add-on charges.
                      </p>
                    )}
                  </div>
                </section>
              </div>

              <aside className="grid gap-4">
                <section className="rounded-[1.5rem] border border-neutral-200 bg-white p-4">
                  <p className="text-xs font-black uppercase tracking-wide text-neutral-500">
                    Adjustments
                  </p>

                  <label className="mt-3 grid gap-1">
                    <span className={labelClass}>Manual Charge</span>
                    <input
                      name="manualChargeAmount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={checkoutManualChargeAmount}
                      onChange={(event) =>
                        setCheckoutManualChargeAmount(event.target.value)
                      }
                      className={inputClass}
                    />
                  </label>

                  <label className="mt-3 grid gap-1">
                    <span className={labelClass}>Manual Charge Note</span>
                    <textarea
                      name="manualChargeNote"
                      defaultValue={checkoutStay.checkoutSummary.manualChargeNote}
                      className="min-h-20 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-bold outline-none transition focus:border-[#b88938] focus:ring-4 focus:ring-[#b88938]/10"
                      placeholder="Mini bar, lost key, damage fee..."
                    />
                  </label>

                  <label className="mt-3 grid gap-1">
                    <span className={labelClass}>Discount / Waiver</span>
                    <input
                      name="discountAmount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={checkoutDiscountAmount}
                      onChange={(event) =>
                        setCheckoutDiscountAmount(event.target.value)
                      }
                      className={inputClass}
                    />
                  </label>

                  <label className="mt-3 grid gap-1">
                    <span className={labelClass}>Discount Note</span>
                    <textarea
                      name="discountNote"
                      defaultValue={checkoutStay.checkoutSummary.discountNote}
                      className="min-h-20 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-bold outline-none transition focus:border-[#b88938] focus:ring-4 focus:ring-[#b88938]/10"
                      placeholder="Approved discount, senior discount, manager adjustment..."
                    />
                  </label>
                </section>

                <section className="rounded-[1.5rem] border border-[#c99c38]/25 bg-[#fffaf0] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-wide text-[#9a6b18]">
                        Split Payments
                      </p>
                      <p className="mt-1 text-xs font-semibold text-[#9a6b18]/70">
                        Add cash, card, wallet, company account, or pay-later rows.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={addCheckoutPayment}
                      className="inline-flex h-9 items-center justify-center rounded-full bg-[#11100b] px-3 text-xs font-black text-white"
                    >
                      Add
                    </button>
                  </div>

                  <div className="mt-4 space-y-3">
                    {checkoutPayments.map((payment, index) => (
                      <div
                        key={payment.id}
                        className="rounded-2xl border border-[#c99c38]/20 bg-white p-3"
                      >
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <p className="text-xs font-black uppercase tracking-wide text-neutral-500">
                            Payment {index + 1}
                          </p>

                          {checkoutPayments.length > 1 ? (
                            <button
                              type="button"
                              onClick={() => removeCheckoutPayment(payment.id)}
                              className="grid size-8 place-items-center rounded-full bg-red-50 text-red-600"
                              aria-label="Remove payment row"
                            >
                              <X className="size-4" />
                            </button>
                          ) : null}
                        </div>

                        <label className="grid gap-1">
                          <span className={labelClass}>Payment Method</span>
                          <select
                            name="paymentMethod"
                            value={payment.method}
                            onChange={(event) =>
                              updateCheckoutPayment(payment.id, {
                                method: event.target
                                  .value as GuestStayCheckoutPaymentMethodValue,
                              })
                            }
                            className={inputClass}
                          >
                            {checkoutPaymentMethods.map((method) => (
                              <option key={method.value} value={method.value}>
                                {method.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="mt-3 grid gap-1">
                          <span className={labelClass}>
                            Amount Collected / Settled
                          </span>
                          <input
                            name="paymentAmount"
                            type="number"
                            min="0"
                            step="0.01"
                            value={payment.amount}
                            onChange={(event) =>
                              updateCheckoutPayment(payment.id, {
                                amount: event.target.value,
                              })
                            }
                            className={inputClass}
                          />
                        </label>

                        <label className="mt-3 grid gap-1">
                          <span className={labelClass}>Reference Number</span>
                          <input
                            name="paymentReference"
                            value={payment.reference}
                            onChange={(event) =>
                              updateCheckoutPayment(payment.id, {
                                reference: event.target.value,
                              })
                            }
                            className={inputClass}
                            placeholder="OR number, GCash ref, bank ref..."
                          />
                        </label>

                        <label className="mt-3 grid gap-1">
                          <span className={labelClass}>Payment Note</span>
                          <textarea
                            name="paymentNote"
                            value={payment.note}
                            onChange={(event) =>
                              updateCheckoutPayment(payment.id, {
                                note: event.target.value,
                              })
                            }
                            className="min-h-16 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-bold outline-none transition focus:border-[#b88938] focus:ring-4 focus:ring-[#b88938]/10"
                            placeholder="Optional cashier/front desk note."
                          />
                        </label>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 space-y-2 rounded-2xl bg-white p-4 text-sm font-bold">
                    <div className="flex justify-between gap-3">
                      <span>Food</span>
                      <span>{money(checkoutPreviewTotals.foodTotalCents)}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span>Services</span>
                      <span>{money(checkoutPreviewTotals.serviceTotalCents)}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span>Manual Charge</span>
                      <span>{money(checkoutPreviewTotals.manualChargeCents)}</span>
                    </div>
                    <div className="flex justify-between gap-3 text-red-600">
                      <span>Discount</span>
                      <span>-{money(checkoutPreviewTotals.discountCents)}</span>
                    </div>
                    <div className="flex justify-between gap-3 border-t border-neutral-100 pt-2">
                      <span>Subtotal</span>
                      <span>{money(checkoutPreviewTotals.subtotalCents)}</span>
                    </div>
                    <div className="flex justify-between gap-3 text-emerald-700">
                      <span>Payments</span>
                      <span>{money(checkoutPreviewTotals.paymentCents)}</span>
                    </div>
                    <div className="flex justify-between gap-3 text-[#11100b]">
                      <span>Balance After Payments</span>
                      <span>{money(checkoutPreviewTotals.balanceDueCents)}</span>
                    </div>
                  </div>
                </section>

                <button
                  type="submit"
                  disabled={isPending}
                  className="inline-flex h-14 min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#11100b] px-5 py-4 text-sm font-black text-white transition hover:bg-[#2a2417] disabled:opacity-60"
                >
                  <Banknote className="size-4" />
                  {isPending ? 'Completing Checkout...' : 'Complete Checkout'}
                </button>

                <p className="text-xs font-semibold leading-5 text-neutral-500">
                  Completing checkout revokes authorized stay devices and ends
                  active NFC guest sessions for this room stay.
                </p>
              </aside>
            </div>
          </form>
        </Modal>
      ) : null}

      {editStay ? (
        <Modal
          title="Edit Guest Stay"
          description="Update guest information, assigned room, device limit, expected checkout, and status."
          onClose={() => setEditStay(null)}
        >
          <form onSubmit={handleEditSubmit} className="grid gap-4">
            <input type="hidden" name="guestStayId" value={editStay.id} />

            <label className="grid gap-1">
              <span className={labelClass}>Hotel</span>
              <input
                value={editStay.hotelName}
                className={inputClass}
                disabled
                readOnly
              />
            </label>

            <label className="grid gap-1">
              <span className={labelClass}>Room</span>
              <select
                name="roomId"
                defaultValue={editStay.roomId}
                className={inputClass}
                required
              >
                {rooms
                  .filter((room) => room.hotelId === editStay.hotelId)
                  .map((room) => (
                    <option key={room.id} value={room.id}>
                      Room {room.number} {room.name ? `— ${room.name}` : ''}
                    </option>
                  ))}
              </select>
            </label>

            <label className="grid gap-1">
              <span className={labelClass}>Guest Name</span>
              <input
                name="guestName"
                defaultValue={editStay.guestName}
                className={inputClass}
                required
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1">
                <span className={labelClass}>Phone</span>
                <input
                  name="phone"
                  defaultValue={editStay.guestPhone}
                  className={inputClass}
                />
              </label>

              <label className="grid gap-1">
                <span className={labelClass}>Email</span>
                <input
                  name="email"
                  type="email"
                  defaultValue={editStay.guestEmail}
                  className={inputClass}
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1">
                <span className={labelClass}>Max Devices</span>
                <input
                  name="maxDevices"
                  type="number"
                  min="1"
                  max="10"
                  defaultValue={editStay.maxDevices}
                  className={inputClass}
                  required
                />
              </label>

              <label className="grid gap-1">
                <span className={labelClass}>Expected Checkout</span>
                <input
                  name="expectedCheckOutAt"
                  type="datetime-local"
                  defaultValue={toDateTimeLocalValue(
                    editStay.expectedCheckOutAt
                  )}
                  className={inputClass}
                />
              </label>
            </div>

            <label className="grid gap-1">
              <span className={labelClass}>Status</span>
              <select
                name="status"
                defaultValue={editStay.status}
                className={inputClass}
              >
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {formatStatus(status)}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="submit"
              disabled={isPending}
              className="mt-2 inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#11100b] text-sm font-black text-white disabled:opacity-60"
            >
              <Pencil className="size-4" />
              {isPending ? 'Saving Changes...' : 'Save Changes'}
            </button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

function FolioSummaryCard({
  stay,
  onPrint,
}: {
  stay: GuestStayRecord;
  onPrint: () => void;
}) {
  const folio = stay.checkoutSummary.folio;

  if (!folio) {
    return null;
  }

  return (
    <section className="rounded-[1.75rem] border border-[#c99c38]/25 bg-[#fffaf0] p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-[#9a6b18]">
            Checkout Folio
          </p>
          <h3 className="mt-1 text-xl font-black text-[#11100b]">
            {folio.folioNumber}
          </h3>
          <p className="mt-1 text-xs font-semibold text-neutral-500">
            Closed {formatDateTime(folio.closedAt)} · Printed{' '}
            {folio.receiptPrintCount} time
            {folio.receiptPrintCount === 1 ? '' : 's'}
          </p>
        </div>

        <button
          type="button"
          onClick={onPrint}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[#11100b] px-4 text-sm font-black text-white"
        >
          <Printer className="size-4" />
          Print Receipt
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <InfoCard label="Subtotal" value={money(folio.subtotalCents)} />
        <InfoCard label="Paid" value={money(folio.paidCents)} />
        <InfoCard label="Balance Due" value={money(folio.balanceDueCents)} />
        <InfoCard
          label="Last Printed"
          value={formatDateTime(folio.receiptPrintedAt)}
        />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-black uppercase tracking-wide text-neutral-500">
            Folio Lines
          </p>
          <div className="space-y-2">
            {folio.lines.length ? (
              folio.lines.map((line) => (
                <div
                  key={line.id}
                  className="flex items-start justify-between gap-3 rounded-2xl border border-neutral-200 bg-white p-4"
                >
                  <div>
                    <p className="text-sm font-black text-[#11100b]">
                      {line.title}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-neutral-500">
                      {formatStatus(line.lineType)} ·{' '}
                      {formatDateTime(line.postedAt)}
                    </p>
                    {line.description ? (
                      <p className="mt-1 text-xs font-medium text-neutral-500">
                        {line.description}
                      </p>
                    ) : null}
                  </div>
                  <p className="shrink-0 text-sm font-black text-[#11100b]">
                    {money(line.amountCents)}
                  </p>
                </div>
              ))
            ) : (
              <p className="rounded-2xl border border-dashed border-neutral-200 bg-white p-5 text-center text-sm font-bold text-neutral-500">
                No folio lines recorded.
              </p>
            )}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-black uppercase tracking-wide text-neutral-500">
            Payment History
          </p>
          <div className="space-y-2">
            {folio.payments.length ? (
              folio.payments.map((payment) => (
                <div
                  key={payment.id}
                  className="rounded-2xl border border-neutral-200 bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-[#11100b]">
                        {formatStatus(payment.paymentMethod)}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-neutral-500">
                        {formatDateTime(payment.paidAt)}
                        {payment.receivedByName
                          ? ` · ${payment.receivedByName}`
                          : ''}
                      </p>
                      {payment.reference ? (
                        <p className="mt-1 text-xs font-medium text-neutral-500">
                          Ref: {payment.reference}
                        </p>
                      ) : null}
                      {payment.note ? (
                        <p className="mt-1 text-xs font-medium text-neutral-500">
                          {payment.note}
                        </p>
                      ) : null}
                    </div>
                    <p className="shrink-0 text-sm font-black text-emerald-700">
                      {money(payment.amountCents)}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-2xl border border-dashed border-neutral-200 bg-white p-5 text-center text-sm font-bold text-neutral-500">
                No payment history recorded.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}


function InfoCard({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-neutral-200 bg-neutral-50 p-4">
      <div className="flex items-center gap-2 text-[#b88938]">
        {icon}
        <p className="text-xs font-black uppercase tracking-wide">{label}</p>
      </div>

      <p className="mt-2 text-sm font-black text-[#11100b]">{value}</p>
    </div>
  );
}