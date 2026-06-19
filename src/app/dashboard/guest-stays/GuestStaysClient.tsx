'use client';

import { type FormEvent, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  BedDouble,
  CheckCircle2,
  Coins,
  Eye,
  History,
  KeyRound,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Trophy,
  UserCheck,
  X,
} from 'lucide-react';
import {
  checkoutGuestStayAction,
  createGuestStayAction,
  getGuestStayPasscodeAction,
  resetGuestStayPasscodeAction,
  updateGuestStayAction,
} from './actions';

type GuestStayStatusValue =
  | 'ACTIVE'
  | 'CHECKED_OUT'
  | 'CANCELLED'
  | 'EXPIRED';

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
};



type CreatedStayResult = {
  passcode: string;
  guestName: string;
  roomNumber: string;
  hotelName: string;
  maxDevices: number;
};

const inputClass =
  'h-12 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none transition focus:border-[#b88938] focus:ring-4 focus:ring-[#b88938]/10';

const labelClass =
  'text-xs font-black uppercase tracking-wide text-neutral-500';

const statusOptions: GuestStayStatusValue[] = [
  'ACTIVE',
  'CHECKED_OUT',
  'CANCELLED',
  'EXPIRED',
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
      <section className="max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-[2rem] bg-white shadow-2xl">
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
  const [selectedHotelId, setSelectedHotelId] = useState(defaultHotelId);
  const [createdStay, setCreatedStay] = useState<CreatedStayResult | null>(
    null
  );
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  const filteredRooms = useMemo(() => {
    return rooms.filter((room) => room.hotelId === selectedHotelId);
  }, [rooms, selectedHotelId]);

  const activeCount = guestStays.filter((stay) => stay.status === 'ACTIVE').length;
  const checkedOutCount = guestStays.filter(
    (stay) => stay.status === 'CHECKED_OUT'
  ).length;
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
        });

        form.reset();
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

  function handleCheckout(guestStayId: string) {
    const formData = new FormData();
    formData.set('guestStayId', guestStayId);

    resetFeedback();

    startTransition(() => {
      void (async () => {
        const result = await checkoutGuestStayAction(formData);

        if (!result.ok) {
          setError(result.error);
          return;
        }

        setMessage(result.message);
        setViewStay(null);
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

      <section className="grid gap-4 md:grid-cols-4">
        <StatCard label="Active Stays" value={activeCount} />
        <StatCard label="Checked Out" value={checkedOutCount} />
        <StatCard label="Rooms Available" value={rooms.length} />
        <StatCard label="Recent Records" value={guestStays.length} />
      </section>

      <section className="flex flex-col gap-3 rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-black text-[#11100b]">Stay Records</h2>
          <p className="mt-1 text-sm font-medium text-neutral-500">
            View, edit, and manage active or recent guest room stays.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#11100b] px-5 text-sm font-black text-white transition hover:bg-[#2a2417]"
        >
          <Plus className="size-4" />
          Create Guest Stay
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
              {guestStays.map((stay) => (
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
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-black ${statusClass(
                        stay.status
                      )}`}
                    >
                      {formatStatus(stay.status)}
                    </span>
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

                      {stay.status === 'ACTIVE' ? (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleCheckout(stay.id)}
                          className="inline-flex items-center gap-1 rounded-full bg-[#11100b] px-3 py-2 text-xs font-black text-white transition hover:bg-[#2a2417] disabled:opacity-60"
                        >
                          <LogOut className="size-3.5" />
                          Checkout
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}

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
                  placeholder="Phone number"
                  className={inputClass}
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

              {viewStay.status === 'ACTIVE' ? (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleCheckout(viewStay.id)}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[#11100b] px-4 text-sm font-black text-white disabled:opacity-60"
                >
                  <LogOut className="size-4" />
                  Checkout
                </button>
              ) : null}
            </div>
          </div>
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