'use client';

import { type FormEvent, useMemo, useState, useTransition } from 'react';
import { KeyRound, UserPlus } from 'lucide-react';
import { createGuestStayAction } from './actions';

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

type CreatedStayResult = {
  passcode: string;
  guestName: string;
  roomNumber: string;
  hotelName: string;
  maxDevices: number;
};

const inputClass =
  'h-12 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none transition focus:border-[#b88938] focus:ring-4 focus:ring-[#b88938]/10';

const textClass =
  'text-xs font-black uppercase tracking-wide text-neutral-500';

export function GuestStayCheckInForm({
  hotels,
  rooms,
  defaultHotelId,
  isSuperAdmin,
}: {
  hotels: HotelOption[];
  rooms: RoomOption[];
  defaultHotelId: string;
  isSuperAdmin: boolean;
}) {
  const [selectedHotelId, setSelectedHotelId] = useState(defaultHotelId);
  const [createdStay, setCreatedStay] = useState<CreatedStayResult | null>(
    null
  );
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  const filteredRooms = useMemo(() => {
    return rooms.filter((room) => room.hotelId === selectedHotelId);
  }, [rooms, selectedHotelId]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);

    setError('');
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
      })();
    });
  }

  return (
    <section className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
      <div className="mb-5 flex items-start gap-3">
        <span className="grid size-12 place-items-center rounded-2xl bg-[#fff8e7] text-[#b88938]">
          <UserPlus className="size-6" />
        </span>

        <div>
          <h2 className="text-xl font-black text-[#11100b]">
            Create Guest Stay
          </h2>
          <p className="mt-1 text-sm font-semibold leading-6 text-neutral-500">
            Check in a guest, generate a room passcode, and set allowed devices.
          </p>
        </div>
      </div>

      {createdStay ? (
        <div className="mb-5 rounded-[1.5rem] border border-emerald-200 bg-emerald-50 p-5">
          <p className="text-sm font-black text-emerald-800">
            Guest stay created successfully.
          </p>

          <div className="mt-4 rounded-2xl bg-white p-4">
            <p className={textClass}>Room Passcode</p>
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
            This passcode is shown only now. Store it or send it to the guest
            before leaving this screen.
          </p>
        </div>
      ) : null}

      {error ? (
        <div className="mb-5 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">
          {error}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="grid gap-4">
        {isSuperAdmin ? (
          <label className="grid gap-1">
            <span className={textClass}>Hotel</span>
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
          <span className={textClass}>Room</span>
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
          <span className={textClass}>Guest Name</span>
          <input
            name="guestName"
            placeholder="Guest full name"
            className={inputClass}
            required
          />
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1">
            <span className={textClass}>Phone</span>
            <input
              name="phone"
              placeholder="Phone number"
              className={inputClass}
            />
          </label>

          <label className="grid gap-1">
            <span className={textClass}>Email</span>
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
            <span className={textClass}>Max Devices</span>
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
            <span className={textClass}>Expected Checkout</span>
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
    </section>
  );
}