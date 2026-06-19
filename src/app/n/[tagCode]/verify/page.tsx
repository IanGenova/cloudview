import { redirect } from 'next/navigation';
import { KeyRound, Lock, ShieldCheck } from 'lucide-react';
import { db } from '@/lib/db';
import { verifyTagSecret } from '@/lib/nfc-security';
import { getActiveGuestStayForRoom } from '@/lib/guest-stay-device-auth';
import { verifyGuestStayPasscodeAction } from './actions';

export const dynamic = 'force-dynamic';

function getErrorMessage(error?: string) {
  if (!error) return null;

  const messages: Record<string, string> = {
    missing_passcode: 'Please enter the room passcode.',
    invalid_passcode: 'Invalid room passcode. Please try again.',
    device_limit:
      'Device limit reached for this room stay. Please contact the front desk.',
    no_active_stay:
      'No active guest stay was found for this room. Please contact the front desk.',
    authorization_failed:
      'Unable to authorize this device. Please try again or contact staff.',
  };

  return messages[error] ?? 'Unable to verify room access.';
}

export default async function VerifyGuestStayPage({
  params,
  searchParams,
}: {
  params: Promise<{
    tagCode: string;
  }>;
  searchParams: Promise<{
    k?: string;
    error?: string;
  }>;
}) {
  const { tagCode } = await params;
  const { k, error } = await searchParams;

  const scanSecret = k || '';

  const tag = await db.nfcTag.findUnique({
    where: {
      code: tagCode,
    },
    select: {
      id: true,
      hotelId: true,
      roomId: true,
      label: true,
      status: true,
      scanSecret: true,
      deletedAt: true,
      hotel: {
        select: {
          name: true,
          logoUrl: true,
        },
      },
      room: {
        select: {
          number: true,
          name: true,
        },
      },
    },
  });

  if (!tag || tag.deletedAt) {
    redirect('/nfc-access-denied?reason=tag-not-found');
  }

  if (tag.status !== 'ACTIVE') {
    redirect('/nfc-access-denied?reason=inactive-tag');
  }

  if (
    !tag.scanSecret ||
    !scanSecret ||
    !verifyTagSecret(scanSecret, tag.scanSecret)
  ) {
    redirect('/nfc-access-denied?reason=bad-secret');
  }

  if (!tag.roomId) {
    redirect('/nfc-access-denied?reason=room-required');
  }

  const activeStay = await getActiveGuestStayForRoom({
    hotelId: tag.hotelId,
    roomId: tag.roomId,
  });

  const errorMessage = getErrorMessage(
    activeStay ? error : 'no_active_stay'
  );

  const roomLabel = tag.room
    ? `Room ${tag.room.number}${tag.room.name ? ` · ${tag.room.name}` : ''}`
    : tag.label;

  return (
    <main className="grid min-h-screen place-items-center bg-black px-5 py-8 text-white">
      <section className="w-full max-w-md rounded-[2rem] border border-gold/20 bg-white/[0.06] p-6 shadow-2xl">
        <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-gold text-black">
          <Lock className="size-8" />
        </div>

        <div className="mt-6 text-center">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-gold">
            Secure Room Access
          </p>

          <h1 className="mt-2 text-3xl font-black">{roomLabel}</h1>

          <p className="mt-2 text-sm font-semibold leading-6 text-white/55">
            Enter your room passcode to authorize this device for the current
            stay at {tag.hotel.name}.
          </p>
        </div>

        {errorMessage ? (
          <div className="mt-5 rounded-2xl bg-red-500/10 p-4 text-sm font-bold text-red-200">
            {errorMessage}
          </div>
        ) : null}

        <form
          action={verifyGuestStayPasscodeAction}
          className="mt-6 space-y-4"
        >
          <input type="hidden" name="tagCode" value={tagCode} />
          <input type="hidden" name="scanSecret" value={scanSecret} />

          <label className="grid gap-2">
            <span className="text-xs font-black uppercase tracking-wide text-white/45">
              Room Passcode
            </span>

            <input
              name="passcode"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="Enter 6-digit code"
              className="h-14 rounded-2xl border border-white/10 bg-white px-4 text-center font-mono text-2xl font-black tracking-[0.2em] text-black outline-none"
              required
            />
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-black uppercase tracking-wide text-white/45">
              Device Label Optional
            </span>

            <input
              name="deviceLabel"
              placeholder="Example: Juan’s iPhone"
              className="h-12 rounded-2xl border border-white/10 bg-white px-4 text-sm font-bold text-black outline-none"
            />
          </label>

          <button className="inline-flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-gold text-sm font-black text-black">
            <KeyRound className="size-4" />
            Authorize Device
          </button>
        </form>

        <div className="mt-5 flex items-start gap-3 rounded-2xl bg-black/30 p-4">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-gold" />
          <p className="text-xs font-semibold leading-5 text-white/45">
            This device will be remembered for this stay only. If your device
            limit is reached, please contact the front desk.
          </p>
        </div>
      </section>
    </main>
  );
}