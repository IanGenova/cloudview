import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  CheckCircle2,
  ChevronRight,
  Gift,
  Lock,
  Sparkles,
  Ticket,
} from 'lucide-react';
import {
  GuestBottomNav,
  GuestShell,
} from '@/components/guest/GuestShell';
import { db } from '@/lib/db';
import { requireNfcGuestAccess } from '@/lib/nfc-security';
import { resolveGuestMemberIdForCurrentNfcSession } from '@/lib/nfc-rewards';
import {
  claimNfcRewardsAction,
  redeemGuestRewardAction,
} from './actions';

export const dynamic = 'force-dynamic';

function pointLabel(points: number) {
  return `${points} point${points === 1 ? '' : 's'}`;
}

function formatRewardValue(reward: {
  rewardType: string;
  discountCents: number | null;
  discountPercent: number | null;
}) {
  if (reward.rewardType === 'DISCOUNT_AMOUNT' && reward.discountCents) {
    return `₱${(reward.discountCents / 100).toLocaleString('en-PH')} discount`;
  }

  if (reward.rewardType === 'DISCOUNT_PERCENT' && reward.discountPercent) {
    return `${reward.discountPercent}% discount`;
  }

  if (reward.rewardType === 'FREE_ITEM') {
    return 'Free item';
  }

  return 'Special reward';
}

function getRewardsPageMessage(params: {
  success?: string;
  error?: string;
  code?: string;
  claimed?: string;
  points?: string;
}) {
  if (params.success === 'reward_redeemed') {
    return {
      type: 'success' as const,
      text: `Reward redeemed successfully. Your code is ${params.code}.`,
    };
  }

  if (params.claimed === '1') {
    const earnedPoints = Number(params.points || 0);

    return {
      type: 'success' as const,
      text:
        earnedPoints > 0
          ? `Rewards claimed successfully. You earned ${pointLabel(
              earnedPoints
            )}.`
          : 'Rewards account linked successfully.',
    };
  }

  if (!params.error) {
    return null;
  }

  const messages: Record<string, string> = {
    invalid_tag: 'Invalid guest access. Please scan the NFC tag again.',
    missing_name: 'Please enter your name.',
    missing_contact: 'Please enter your phone number or email address.',
    claim_failed: 'Unable to claim rewards. Please try again.',
    claim_rewards_first: 'Please claim your guest rewards account first.',
    insufficient_points: 'You do not have enough points to redeem this reward.',
    reward_inactive: 'This reward is no longer available.',
    invalid_reward: 'Invalid reward selected.',
    reward_failed: 'Unable to redeem reward. Please try again.',
    already_reserved:
  'You already have an unused code for this reward. Please use it first or ask staff to cancel/refund it.',
  };

  return {
    type: 'error' as const,
    text: messages[params.error] ?? 'Something went wrong.',
  };
}

export default async function GuestRewardsPage({
  params,
  searchParams,
}: {
  params: Promise<{
    tagCode: string;
  }>;
  searchParams: Promise<{
    success?: string;
    error?: string;
    code?: string;
    claimed?: string;
    points?: string;
  }>;
}) {
  const { tagCode } = await params;
  const query = await searchParams;

  const tag = await requireNfcGuestAccess(tagCode);

  if (!tag || tag.status !== 'ACTIVE') {
    notFound();
  }

  const guestMemberId = await resolveGuestMemberIdForCurrentNfcSession(tagCode);

  const guestMember = guestMemberId
    ? await db.guestMember.findFirst({
        where: {
          id: guestMemberId,
          hotelId: tag.hotelId,
          isActive: true,
        },
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
      })
    : null;

  const now = new Date();

  const rewards = await db.reward.findMany({
    where: {
      hotelId: tag.hotelId,
      isActive: true,
      AND: [
        {
          OR: [
            {
              validFrom: null,
            },
            {
              validFrom: {
                lte: now,
              },
            },
          ],
        },
        {
          OR: [
            {
              validUntil: null,
            },
            {
              validUntil: {
                gte: now,
              },
            },
          ],
        },
      ],
    },
    select: {
      id: true,
      name: true,
      description: true,
      pointsCost: true,
      rewardType: true,
      discountCents: true,
      discountPercent: true,
      validUntil: true,
    },
    orderBy: [
      {
        pointsCost: 'asc',
      },
      {
        name: 'asc',
      },
    ],
  });

  const redemptions = guestMember
    ? await db.rewardRedemption.findMany({
        where: {
          hotelId: tag.hotelId,
          guestMemberId: guestMember.id,
        },
        select: {
          id: true,
          code: true,
          pointsUsed: true,
          status: true,
          redeemedAt: true,
          usedAt: true,
          reward: {
            select: {
              name: true,
              rewardType: true,
              discountCents: true,
              discountPercent: true,
            },
          },
        },
        orderBy: {
          redeemedAt: 'desc',
        },
        take: 10,
      })
    : [];

  const message = getRewardsPageMessage(query);

  const location = tag.room
    ? `Room ${tag.room.number}`
    : tag.location?.name ?? tag.label;

  const availablePoints = guestMember?.pointAccount?.availablePoints ?? 0;
  const pendingPoints = guestMember?.pointAccount?.pendingPoints ?? 0;
  const lifetimeEarnedPoints =
    guestMember?.pointAccount?.lifetimeEarnedPoints ?? 0;
  const lifetimeRedeemedPoints =
    guestMember?.pointAccount?.lifetimeRedeemedPoints ?? 0;

  return (
    <>
      <GuestShell
        hotel={tag.hotel}
        title="CloudView Rewards"
        subtitle={location}
        backHref={`/t/${tagCode}`}
        variant="dark"
      >
        <div className="-mx-5 -mt-3 min-h-[calc(100vh-5rem)] bg-black px-5 pb-28 pt-4 text-white">
          {message ? (
            <div
              className={
                message.type === 'success'
                  ? 'mb-4 rounded-[1.5rem] border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm font-bold text-emerald-200'
                  : 'mb-4 rounded-[1.5rem] border border-red-400/20 bg-red-500/10 p-4 text-sm font-bold text-red-200'
              }
            >
              {message.text}
            </div>
          ) : null}

          {!guestMember ? (
            <ClaimRewardsCard tagCode={tagCode} hotelName={tag.hotel.name} />
          ) : (
            <>
              <section className="rounded-[2rem] border border-gold/25 bg-white/[0.06] p-5 shadow-2xl">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-gold">
                      <Sparkles className="size-4" />
                      Welcome back
                    </p>

                    <h1 className="mt-2 text-2xl font-black text-white">
                      {guestMember.name}
                    </h1>

                    <p className="mt-1 text-sm font-semibold text-white/50">
                      Redeem your available points below.
                    </p>
                  </div>

                  <div className="grid size-14 place-items-center rounded-2xl bg-gold text-black">
                    <Gift className="size-6" />
                  </div>
                </div>

                <div className="mt-5 rounded-[1.5rem] bg-black/30 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-white/40">
                    Available Points
                  </p>

                  <p className="mt-1 text-5xl font-black text-sand">
                    {availablePoints}
                  </p>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-black/25 p-3">
                    <p className="text-[10px] font-black uppercase text-white/35">
                      Pending
                    </p>
                    <p className="mt-1 text-sm font-black text-white">
                      {pointLabel(pendingPoints)}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-black/25 p-3">
                    <p className="text-[10px] font-black uppercase text-white/35">
                      Lifetime Earned
                    </p>
                    <p className="mt-1 text-sm font-black text-white">
                      {pointLabel(lifetimeEarnedPoints)}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-black/25 p-3">
                    <p className="text-[10px] font-black uppercase text-white/35">
                      Redeemed
                    </p>
                    <p className="mt-1 text-sm font-black text-white">
                      {pointLabel(lifetimeRedeemedPoints)}
                    </p>
                  </div>

                  <Link
                    href={`/t/${tagCode}/contact`}
                    className="rounded-2xl bg-gold/15 p-3 text-sm font-black text-gold"
                  >
                    View Profile
                    <ChevronRight className="mt-1 size-4" />
                  </Link>
                </div>
              </section>

              <section className="mt-6">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-lg font-black text-white">
                    Redeem Rewards
                  </h2>

                  <span className="text-xs font-bold text-white/40">
                    {rewards.length} available
                  </span>
                </div>

                <div className="space-y-3">
                  {rewards.map((reward) => {
                    const canRedeem = availablePoints >= reward.pointsCost;

                    return (
                      <article
                        key={reward.id}
                        className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-4"
                      >
                        <div className="flex items-start gap-3">
                          <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gold/15 text-gold">
                            <Ticket className="size-5" />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-black text-white">
                                {reward.name}
                              </h3>

                              <span className="rounded-full bg-gold/15 px-2.5 py-1 text-[10px] font-black text-gold">
                                {pointLabel(reward.pointsCost)}
                              </span>
                            </div>

                            <p className="mt-1 text-sm font-bold text-sand">
                              {formatRewardValue(reward)}
                            </p>

                            {reward.description ? (
                              <p className="mt-2 text-xs leading-5 text-white/50">
                                {reward.description}
                              </p>
                            ) : null}

                            {reward.validUntil ? (
                              <p className="mt-2 text-[11px] font-bold text-white/35">
                                Valid until{' '}
                                {reward.validUntil.toLocaleDateString('en-PH')}
                              </p>
                            ) : null}
                          </div>
                        </div>

                        <form action={redeemGuestRewardAction} className="mt-4">
                          <input type="hidden" name="tagCode" value={tagCode} />
                          <input
                            type="hidden"
                            name="rewardId"
                            value={reward.id}
                          />

                          <button
                            type="submit"
                            disabled={!canRedeem}
                            className={
                              canRedeem
                                ? 'h-11 w-full rounded-2xl bg-gold text-sm font-black text-black'
                                : 'h-11 w-full cursor-not-allowed rounded-2xl bg-white/10 text-sm font-black text-white/35'
                            }
                          >
                            {canRedeem
                              ? 'Redeem Reward'
                              : `Need ${pointLabel(
                                  reward.pointsCost - availablePoints
                                )} more`}
                          </button>
                        </form>
                      </article>
                    );
                  })}

                  {!rewards.length ? (
                    <div className="rounded-[1.5rem] border border-dashed border-white/15 p-8 text-center">
                      <Gift className="mx-auto size-8 text-white/35" />
                      <h3 className="mt-3 font-black text-white">
                        No rewards available yet
                      </h3>
                      <p className="mt-1 text-sm text-white/45">
                        Please check again later.
                      </p>
                    </div>
                  ) : null}
                </div>
              </section>

              <section className="mt-6">
                <h2 className="mb-3 text-lg font-black text-white">
                  My Redemption Codes
                </h2>

                <div className="space-y-3">
                  {redemptions.map((redemption) => (
                    <div
                      key={redemption.id}
                      className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-black text-white">
                            {redemption.reward.name}
                          </p>

                          <p className="mt-1 text-xs font-bold text-white/45">
                            {pointLabel(redemption.pointsUsed)} used ·{' '}
                            {redemption.status}
                          </p>
                        </div>

                        <CheckCircle2 className="size-5 text-gold" />
                      </div>

                      <div className="mt-3 rounded-2xl bg-black/35 p-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">
                          Redemption Code
                        </p>

                        <p className="mt-1 font-mono text-xl font-black tracking-widest text-sand">
                          {redemption.code}
                        </p>
                      </div>
                    </div>
                  ))}

                  {!redemptions.length ? (
                    <div className="rounded-[1.5rem] bg-white/[0.04] p-5 text-center text-sm font-bold text-white/45">
                      No redemptions yet.
                    </div>
                  ) : null}
                </div>
              </section>
            </>
          )}
        </div>
      </GuestShell>

      <GuestBottomNav tagCode={tagCode} active="profile" dark />
    </>
  );
}

function ClaimRewardsCard({
  tagCode,
  hotelName,
}: {
  tagCode: string;
  hotelName: string;
}) {
  return (
    <section className="rounded-[2rem] border border-gold/20 bg-white/[0.06] p-6 shadow-2xl">
      <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-gold text-black">
        <Lock className="size-8" />
      </div>

      <h1 className="mt-5 text-center text-2xl font-black text-white">
        Claim your rewards
      </h1>

      <p className="mt-3 text-center text-sm leading-6 text-white/55">
        Add your name and contact details so {hotelName} can connect your
        points, orders, requests, and redemptions.
      </p>

      <form action={claimNfcRewardsAction} className="mt-6 space-y-3">
        <input type="hidden" name="tagCode" value={tagCode} />

        <input
          name="name"
          required
          placeholder="Your name"
          className="h-13 w-full rounded-2xl border border-white/10 bg-white px-4 text-sm font-bold text-black outline-none"
        />

        <input
          name="phone"
          placeholder="Phone number"
          className="h-13 w-full rounded-2xl border border-white/10 bg-white px-4 text-sm font-bold text-black outline-none"
        />

        <input
          name="email"
          type="email"
          placeholder="Email address"
          className="h-13 w-full rounded-2xl border border-white/10 bg-white px-4 text-sm font-bold text-black outline-none"
        />

        <p className="text-xs font-semibold leading-5 text-white/45">
          Please provide at least your phone number or email address.
        </p>

        <button
          type="submit"
          className="h-12 w-full rounded-2xl bg-gold text-sm font-black text-black"
        >
          Claim Rewards
        </button>
      </form>
    </section>
  );
}