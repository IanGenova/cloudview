import Link from 'next/link';
import { Gift, Sparkles, Trophy, UserRound } from 'lucide-react';
import { TagStatus } from '@prisma/client';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { getGuestRewardsContextForTag } from '@/lib/nfc-rewards';
import { claimNfcRewardsAction } from './actions';

export const dynamic = 'force-dynamic';

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-PH').format(value);
}

export default async function GuestRewardsPage({
  params,
  searchParams,
}: {
  params: Promise<{
    tagCode: string;
  }>;
  searchParams?: Promise<{
    claimed?: string;
    points?: string;
    reason?: string;
    error?: string;
  }>;
}) {
  const { tagCode } = await params;
  const query = await searchParams;

  const tag = await db.nfcTag.findUnique({
    where: {
      code: tagCode,
    },
    include: {
      hotel: {
        select: {
          name: true,
        },
      },
      room: {
        select: {
          number: true,
          name: true,
        },
      },
      location: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!tag || tag.status !== TagStatus.ACTIVE || tag.deletedAt) {
    notFound();
  }

  const context = await getGuestRewardsContextForTag(tagCode);

  const placeLabel =
    tag.room?.number || tag.room?.name
      ? `Room ${tag.room?.number || tag.room?.name}`
      : tag.location?.name || tag.label;

  const claimed = query?.claimed === '1';
  const points = Number(query?.points ?? 0);
  const error = query?.error;

  return (
    <main className="min-h-screen bg-[#080704] px-5 py-6 text-white">
      <div className="mx-auto max-w-xl space-y-5">
        <section className="rounded-[2rem] border border-[#c99c38]/30 bg-[radial-gradient(circle_at_top,#2b210f_0%,#11100b_42%,#070604_100%)] p-6 shadow-2xl">
          <div className="flex items-center gap-4">
            <span className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-[#f1c66a] via-[#c99c38] to-[#8f6820] text-[#080704]">
              <Gift className="size-7" />
            </span>

            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-[#d6a738]">
                CloudView Rewards
              </p>
              <h1 className="mt-1 text-3xl font-black">Claim Your Points</h1>
            </div>
          </div>

          <p className="mt-5 text-sm font-semibold leading-7 text-white/70">
            Earn points from NFC visits, orders, and completed guest services
            during your stay at {tag.hotel.name}.
          </p>

          <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-xs font-black uppercase tracking-wide text-white/45">
              Current NFC Location
            </p>
            <p className="mt-1 font-black text-[#f1c66a]">{placeLabel}</p>
          </div>
        </section>

        {claimed ? (
          <section className="rounded-[1.75rem] border border-emerald-500/20 bg-emerald-500/10 p-5">
            <p className="font-black text-emerald-200">
              Rewards linked successfully.
            </p>
            <p className="mt-1 text-sm font-semibold text-emerald-100/80">
              {points > 0
                ? `You earned +${points} NFC visit point${points === 1 ? '' : 's'}.`
                : 'No NFC visit points were added because this reward may have already been claimed today.'}
            </p>
          </section>
        ) : null}

        {error ? (
          <section className="rounded-[1.75rem] border border-red-500/20 bg-red-500/10 p-5">
            <p className="font-black text-red-200">
              {error === 'name-required'
                ? 'Please enter your name.'
                : error === 'contact-required'
                  ? 'Please enter your phone or email.'
                  : 'Unable to claim rewards.'}
            </p>
          </section>
        ) : null}

        {!context.session ? (
          <section className="rounded-[1.75rem] border border-red-500/20 bg-red-500/10 p-5">
            <p className="font-black text-red-200">NFC session expired.</p>
            <p className="mt-2 text-sm font-semibold text-red-100/80">
              Please tap the NFC card again to claim rewards.
            </p>
          </section>
        ) : context.guestMember && context.pointAccount ? (
          <section className="rounded-[2rem] border border-[#c99c38]/25 bg-white text-[#11100b] p-6 shadow-2xl">
            <div className="flex items-center gap-4">
              <span className="grid size-12 place-items-center rounded-2xl bg-[#fff8e7] text-[#b88938]">
                <UserRound className="size-6" />
              </span>

              <div>
                <p className="text-sm font-black">Welcome back,</p>
                <p className="text-xl font-black">
                  {context.guestMember.name}
                </p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-[#fff8e7] p-4">
                <p className="text-xs font-black uppercase text-[#9d741f]">
                  Available
                </p>
                <p className="mt-1 text-3xl font-black">
                  {formatNumber(context.pointAccount.availablePoints)}
                </p>
              </div>

              <div className="rounded-2xl bg-neutral-100 p-4">
                <p className="text-xs font-black uppercase text-neutral-500">
                  Lifetime Earned
                </p>
                <p className="mt-1 text-3xl font-black">
                  {formatNumber(context.pointAccount.lifetimeEarnedPoints)}
                </p>
              </div>
            </div>

            <Link
              href={`/t/${tagCode}`}
              className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-2xl bg-[#11100b] text-sm font-black text-white"
            >
              Back to Guest Portal
            </Link>
          </section>
        ) : (
          <section className="rounded-[2rem] border border-[#c99c38]/25 bg-white p-6 text-[#11100b] shadow-2xl">
            <div className="flex items-center gap-3">
              <Sparkles className="size-6 text-[#b88938]" />
              <h2 className="text-xl font-black">Join CloudView Rewards</h2>
            </div>

            <p className="mt-2 text-sm font-semibold leading-6 text-neutral-500">
              Enter your details once. Your future orders and service requests
              from this NFC portal can earn points.
            </p>

            <form action={claimNfcRewardsAction} className="mt-6 space-y-4">
              <input type="hidden" name="tagCode" value={tagCode} />

              <input
                name="name"
                placeholder="Guest name"
                required
                className="h-12 w-full rounded-2xl border border-neutral-200 px-4 text-sm font-bold outline-none focus:border-[#c99c38]"
              />

              <input
                name="phone"
                placeholder="Phone number"
                className="h-12 w-full rounded-2xl border border-neutral-200 px-4 text-sm font-bold outline-none focus:border-[#c99c38]"
              />

              <input
                name="email"
                placeholder="Email address"
                type="email"
                className="h-12 w-full rounded-2xl border border-neutral-200 px-4 text-sm font-bold outline-none focus:border-[#c99c38]"
              />

              <button className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#11100b] text-sm font-black text-white">
                <Trophy className="size-5 text-[#c99c38]" />
                Claim Rewards
              </button>
            </form>
          </section>
        )}
      </div>
    </main>
  );
}