import Link from 'next/link';
import { redirect } from 'next/navigation';
import { KeyRound, Lock, ShieldCheck } from 'lucide-react';
import { db } from '@/lib/db';
import {
  passcodeIsBlocking,
  passcodeVerifyMessage,
} from '@/lib/guest-passcode-messages';
import { verifyTagScanSecret } from '@/lib/nfc-security';
import { getActiveGuestStayForRoom } from '@/lib/guest-stay-device-auth';
import { verifyGuestStayPasscodeAction } from './actions';

export const dynamic = 'force-dynamic';

/*
 * The code -> sentence table lives in lib/guest-passcode-messages.ts, shared
 * with the action that chooses the codes, so a code cannot be added to one
 * side and not the other. That is how passcode_locked went unrendered.
 */
function getErrorMessage(error?: string, retry?: string) {
  return passcodeVerifyMessage(error, retry ? Number(retry) : undefined);
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
    retry?: string;
  }>;
}) {
  const { tagCode } = await params;
  const { k, error, retry } = await searchParams;

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
      scanSecretHash: true,
      deletedAt: true,
      hotel: {
        select: {
          name: true,
          logoUrl: true,
          settings: {
            select: {
              nfcRoomPasscodeEnabled: true,
            },
          },
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
    !scanSecret ||
    !verifyTagScanSecret(scanSecret, tag)
  ) {
    redirect('/nfc-access-denied?reason=bad-secret');
  }

  if (!tag.roomId) {
    redirect('/nfc-access-denied?reason=room-required');
  }

  const nfcRoomPasscodeEnabled =
    tag.hotel.settings?.nfcRoomPasscodeEnabled ?? true;

  if (!nfcRoomPasscodeEnabled) {
    redirect(`/n/${tagCode}?k=${encodeURIComponent(scanSecret)}`);
  }

  const activeStay = await getActiveGuestStayForRoom({
    hotelId: tag.hotelId,
    roomId: tag.roomId,
  });

  const failureCode = activeStay ? error : 'no_active_stay';
  const errorMessage = getErrorMessage(failureCode, retry);
  const blocked = passcodeIsBlocking(failureCode);

  const roomLabel = tag.room
    ? `Room ${tag.room.number}${tag.room.name ? ` · ${tag.room.name}` : ''}`
    : tag.label;

  return (
    <main className="grid min-h-screen place-items-center bg-black px-5 py-8 text-white">
      <section className="w-full max-w-md border border-gold/20 bg-white/[0.06] p-6 shadow-2xl">
        <div className="mx-auto grid size-16 place-items-center bg-gold text-black">
          <Lock className="size-8" />
        </div>

        <div className="mt-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">
            Secure Room Access
          </p>

          <h1 className="mt-2 text-3xl font-semibold">{roomLabel}</h1>

          <p className="mt-2 text-sm font-semibold leading-6 text-white/55">
            Enter your room passcode to authorize this device for the current
            stay at {tag.hotel.name}.
          </p>
        </div>

        {errorMessage ? (
          <div
            role="alert"
            className="mt-5 border border-red-400/25 bg-red-500/10 p-4 text-sm font-semibold leading-6 text-red-200"
          >
            {errorMessage}
          </div>
        ) : null}

        {/*
          ST-3 and CP-8. A lockout, a device limit and a missing stay all used
          to appear above a live, enabled passcode form: the screen said
          "contact the front desk" and then offered "Authorize Device", which
          could not have worked. When the failure is not the guest's to fix,
          the form goes and the front desk becomes the action.
        */}
        {blocked ? (
          <div className="mt-6 border border-white/10 bg-black/30 p-5">
            <p className="text-sm font-semibold leading-6 text-white/70">
              The front desk can authorise this device for you. Nothing you can
              type here will unlock it.
            </p>

            <Link
              href={`/t/${tagCode}/contact`}
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center bg-gold px-5 py-3 text-sm font-semibold text-black transition hover:brightness-110"
            >
              Contact the front desk
            </Link>
          </div>
        ) : (
        <form
          action={verifyGuestStayPasscodeAction}
          className="mt-6 space-y-4"
        >
          <input type="hidden" name="tagCode" value={tagCode} />
          <input type="hidden" name="scanSecret" value={scanSecret} />

          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-white/45">
              Room Passcode
            </span>

            <input
              name="passcode"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="Enter 6-digit code"
              className="h-14 border border-white/10 bg-white px-4 text-center font-mono text-2xl font-semibold tracking-[0.2em] text-black outline-none"
              required
            />
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-white/45">
              Device Label Optional
            </span>

            <input
              name="deviceLabel"
              placeholder="Example: Juan’s iPhone"
              className="h-12 border border-white/10 bg-white px-4 text-sm font-bold text-black outline-none"
            />
          </label>

          <button className="inline-flex min-h-11 w-full items-center justify-center gap-2 bg-gold py-3 text-sm font-semibold text-black">
            <KeyRound className="size-4" />
            Authorize Device
          </button>
        </form>
        )}

        {!blocked ? (
          <div className="mt-5 flex items-start gap-3 bg-black/30 p-4">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-gold" />
            <p className="text-xs font-semibold leading-5 text-white/45">
              This device will be remembered for this stay only.
            </p>
          </div>
        ) : null}
      </section>
    </main>
  );
}
