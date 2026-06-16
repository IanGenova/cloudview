import Link from 'next/link';
import {
  ChevronLeft,
  ChevronRight,
  Gift,
  ReceiptText,
  Sparkles,
  Trophy,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Role } from '@prisma/client';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { RewardRedemptionActionButtons } from './RewardRedemptionActionButtons';
import { RewardsActionModals } from './RewardsActionModals';
import { RewardCatalogManager } from './RewardCatalogManager';

export const dynamic = 'force-dynamic';

const LEDGER_PAGE_SIZE = 10;

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-PH').format(value);
}

function formatDate(date: Date | null | undefined) {
  if (!date) return '—';

  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function parsePage(value?: string) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 1;
  }

  return Math.max(1, Math.floor(parsed));
}

function StatCard({
  label,
  value,
  helper,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  helper: string;
  icon: LucideIcon;
}) {
  return (
    <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
      <div className="flex items-center gap-4">
        <span className="grid size-12 place-items-center rounded-2xl bg-[#fff8e7] text-[#b88938]">
          <Icon className="size-6" />
        </span>

        <div>
          <p className="text-xs font-black uppercase tracking-wide text-neutral-500">
            {label}
          </p>
          <p className="mt-1 text-2xl font-black text-neutral-950">{value}</p>
          <p className="mt-1 text-xs font-bold text-neutral-500">{helper}</p>
        </div>
      </div>
    </div>
  );
}

function RedemptionStatusPill({ status }: { status: string }) {
  const className =
    status === 'RESERVED'
      ? 'bg-amber-100 text-amber-700'
      : status === 'USED'
        ? 'bg-emerald-100 text-emerald-700'
        : status === 'CANCELLED'
          ? 'bg-red-100 text-red-700'
          : 'bg-neutral-100 text-neutral-600';

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-black ${className}`}>
      {status}
    </span>
  );
}

function LedgerPagination({
  currentPage,
  totalPages,
  totalItems,
}: {
  currentPage: number;
  totalPages: number;
  totalItems: number;
}) {
  const start = totalItems === 0 ? 0 : (currentPage - 1) * LEDGER_PAGE_SIZE + 1;
  const end = Math.min(currentPage * LEDGER_PAGE_SIZE, totalItems);

  return (
    <div className="flex flex-col gap-3 border-t border-neutral-100 px-6 py-4 md:flex-row md:items-center md:justify-between">
      <p className="text-sm font-bold text-neutral-500">
        Showing {start}-{end} of {formatNumber(totalItems)} ledger entries
      </p>

      <div className="flex items-center gap-2">
        {currentPage > 1 ? (
          <Link
            href={`/dashboard/rewards?ledgerPage=${currentPage - 1}`}
            className="inline-flex h-10 items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-black text-neutral-700 hover:bg-neutral-50"
          >
            <ChevronLeft className="size-4" />
            Previous
          </Link>
        ) : (
          <span className="inline-flex h-10 cursor-not-allowed items-center gap-2 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 text-sm font-black text-neutral-300">
            <ChevronLeft className="size-4" />
            Previous
          </span>
        )}

        <span className="rounded-2xl bg-[#fff8e7] px-4 py-2 text-sm font-black text-[#9d741f]">
          Page {currentPage} of {totalPages}
        </span>

        {currentPage < totalPages ? (
          <Link
            href={`/dashboard/rewards?ledgerPage=${currentPage + 1}`}
            className="inline-flex h-10 items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-black text-neutral-700 hover:bg-neutral-50"
          >
            Next
            <ChevronRight className="size-4" />
          </Link>
        ) : (
          <span className="inline-flex h-10 cursor-not-allowed items-center gap-2 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 text-sm font-black text-neutral-300">
            Next
            <ChevronRight className="size-4" />
          </span>
        )}
      </div>
    </div>
  );
}

export default async function RewardsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    ledgerPage?: string;
  }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const requestedLedgerPage = parsePage(params?.ledgerPage);

  const hotels = await db.hotel.findMany({
    where:
      user.role === Role.SUPER_ADMIN
        ? {}
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

  const hotelWhere =
    user.role === Role.SUPER_ADMIN
      ? {
          in: hotelIds.length ? hotelIds : ['__NO_ACCESS__'],
        }
      : user.hotelId || '__NO_ACCESS__';

  const [
    memberCount,
    rewards,
    accounts,
    ledgerCount,
    memberOptions,
    redemptions,
  ] = await Promise.all([
    db.guestMember.count({
      where: {
        hotelId: hotelWhere,
      },
    }),

    db.reward.findMany({
  where: {
    hotelId: hotelWhere,
  },
  include: {
    hotel: {
      select: {
        name: true,
      },
    },
    _count: {
      select: {
        redemptions: true,
      },
    },
  },
      orderBy: {
        createdAt: 'desc',
      },
      take: 20,
    }),

    db.guestPointAccount.findMany({
      where: {
        hotelId: hotelWhere,
      },
      include: {
        guestMember: true,
        hotel: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        availablePoints: 'desc',
      },
      take: 20,
    }),

    db.guestPointLedger.count({
      where: {
        hotelId: hotelWhere,
      },
    }),

    db.guestMember.findMany({
      where: {
        hotelId: hotelWhere,
      },
      include: {
        hotel: {
          select: {
            name: true,
          },
        },
        pointAccount: {
          select: {
            availablePoints: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
      take: 250,
    }),

    db.rewardRedemption.findMany({
      where: {
        hotelId: hotelWhere,
      },
      include: {
        hotel: {
          select: {
            name: true,
          },
        },
        guestMember: true,
        reward: true,
      },
      orderBy: {
        redeemedAt: 'desc',
      },
      take: 50,
    }),
  ]);

  const totalLedgerPages = Math.max(
    1,
    Math.ceil(ledgerCount / LEDGER_PAGE_SIZE)
  );

  const currentLedgerPage = Math.min(requestedLedgerPage, totalLedgerPages);

  const ledger = await db.guestPointLedger.findMany({
    where: {
      hotelId: hotelWhere,
    },
    include: {
      guestMember: true,
      hotel: {
        select: {
          name: true,
        },
      },
      createdBy: {
        select: {
          name: true,
          email: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    skip: (currentLedgerPage - 1) * LEDGER_PAGE_SIZE,
    take: LEDGER_PAGE_SIZE,
  });

  const totalAvailablePoints = accounts.reduce(
    (sum, account) => sum + account.availablePoints,
    0
  );

  const totalLifetimeEarned = accounts.reduce(
    (sum, account) => sum + account.lifetimeEarnedPoints,
    0
  );

  const totalRedeemed = accounts.reduce(
    (sum, account) => sum + account.lifetimeRedeemedPoints,
    0
  );

  const defaultHotelId = hotels[0]?.id ?? '';

  const rewardCatalogItems = rewards.map((reward) => ({
  id: reward.id,
  name: reward.name,
  description: reward.description ?? '',
  pointsCost: reward.pointsCost,
  rewardType: reward.rewardType,
  discountCents: reward.discountCents,
  discountPercent: reward.discountPercent,
  freeProductId: reward.freeProductId ?? '',
  isActive: reward.isActive,
  validFrom: reward.validFrom ? reward.validFrom.toISOString().slice(0, 10) : '',
  validUntil: reward.validUntil
    ? reward.validUntil.toISOString().slice(0, 10)
    : '',
  redemptionCount: reward._count.redemptions,
}));

  const modalMembers = memberOptions.map((member) => ({
    id: member.id,
    hotelId: member.hotelId,
    hotelName: member.hotel.name,
    name: member.name,
    contact: member.phone || member.email || 'No contact',
    availablePoints: member.pointAccount?.availablePoints ?? 0,
  }));

  return (
    <div className="space-y-7">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-[#11100b]">
            CloudView Rewards
          </h1>
          <p className="mt-2 text-base font-medium text-neutral-500">
            Manage guest loyalty points, rewards, redemptions, and point
            activity.
          </p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Members"
          value={formatNumber(memberCount)}
          helper="Registered loyalty guests"
          icon={Users}
        />

        <StatCard
          label="Available Points"
          value={formatNumber(totalAvailablePoints)}
          helper="Unused guest point balance"
          icon={Sparkles}
        />

        <StatCard
          label="Lifetime Earned"
          value={formatNumber(totalLifetimeEarned)}
          helper="Total issued points"
          icon={Trophy}
        />

        <StatCard
          label="Redeemed Points"
          value={formatNumber(totalRedeemed)}
          helper="Used or adjusted points"
          icon={ReceiptText}
        />
      </section>

      <RewardsActionModals
        hotels={hotels}
        members={modalMembers}
        defaultHotelId={defaultHotelId}
        isSuperAdmin={user.role === Role.SUPER_ADMIN}
      />

      <section className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="rounded-[2rem] border border-neutral-200 bg-white shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
          <div className="border-b border-neutral-100 px-6 py-5">
            <h2 className="text-xl font-black">Top Members</h2>
            <p className="mt-1 text-sm font-medium text-neutral-500">
              Guests with the highest available point balance.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="px-5 py-3 text-xs font-black uppercase text-neutral-500">
                    Guest
                  </th>
                  <th className="px-5 py-3 text-xs font-black uppercase text-neutral-500">
                    Hotel
                  </th>
                  <th className="px-5 py-3 text-xs font-black uppercase text-neutral-500">
                    Available
                  </th>
                  <th className="px-5 py-3 text-xs font-black uppercase text-neutral-500">
                    Lifetime Earned
                  </th>
                  <th className="px-5 py-3 text-xs font-black uppercase text-neutral-500">
                    Redeemed
                  </th>
                </tr>
              </thead>

              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id} className="border-t border-neutral-100">
                    <td className="px-5 py-4">
                      <p className="font-black">{account.guestMember.name}</p>
                      <p className="text-xs font-semibold text-neutral-500">
                        {account.guestMember.phone ||
                          account.guestMember.email ||
                          'No contact'}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-sm font-bold">
                      {account.hotel.name}
                    </td>
                    <td className="px-5 py-4 font-black text-[#b88938]">
                      {formatNumber(account.availablePoints)}
                    </td>
                    <td className="px-5 py-4 font-bold">
                      {formatNumber(account.lifetimeEarnedPoints)}
                    </td>
                    <td className="px-5 py-4 font-bold">
                      {formatNumber(account.lifetimeRedeemedPoints)}
                    </td>
                  </tr>
                ))}

                {!accounts.length ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 py-10 text-center font-bold text-neutral-500"
                    >
                      No rewards members yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-[2rem] border border-neutral-200 bg-white shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-100 px-6 py-5">
            <div>
              <h2 className="text-xl font-black">Point Ledger</h2>
              <p className="mt-1 text-sm font-medium text-neutral-500">
                Latest point movements. Limited to 10 entries per page.
              </p>
            </div>

            <span className="rounded-full bg-[#fff8e7] px-3 py-1 text-xs font-black text-[#9d741f]">
              10 per page
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="px-5 py-3 text-xs font-black uppercase text-neutral-500">
                    Date
                  </th>
                  <th className="px-5 py-3 text-xs font-black uppercase text-neutral-500">
                    Guest
                  </th>
                  <th className="px-5 py-3 text-xs font-black uppercase text-neutral-500">
                    Type
                  </th>
                  <th className="px-5 py-3 text-xs font-black uppercase text-neutral-500">
                    Points
                  </th>
                  <th className="px-5 py-3 text-xs font-black uppercase text-neutral-500">
                    Source
                  </th>
                  <th className="px-5 py-3 text-xs font-black uppercase text-neutral-500">
                    Notes
                  </th>
                </tr>
              </thead>

              <tbody>
                {ledger.map((item) => (
                  <tr key={item.id} className="border-t border-neutral-100">
                    <td className="px-5 py-4 text-sm font-bold">
                      {formatDate(item.createdAt)}
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-black">{item.guestMember.name}</p>
                      <p className="text-xs text-neutral-500">
                        {item.hotel.name}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-sm font-black">
                      {item.type}
                    </td>
                    <td
                      className={
                        item.points >= 0
                          ? 'px-5 py-4 font-black text-emerald-700'
                          : 'px-5 py-4 font-black text-red-600'
                      }
                    >
                      {item.points >= 0 ? '+' : ''}
                      {formatNumber(item.points)}
                    </td>
                    <td className="px-5 py-4 text-sm font-bold">
                      {item.source}
                    </td>
                    <td className="px-5 py-4 text-sm font-medium text-neutral-500">
                      {item.description || '—'}
                    </td>
                  </tr>
                ))}

                {!ledger.length ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-10 text-center font-bold text-neutral-500"
                    >
                      No point activity yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <LedgerPagination
            currentPage={currentLedgerPage}
            totalPages={totalLedgerPages}
            totalItems={ledgerCount}
          />
        </div>
      </section>

      <section className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
        <h2 className="text-xl font-black">Reward Redemptions</h2>
        <p className="mt-1 text-sm font-medium text-neutral-500">
          Guest redemption codes from the guest rewards page. Staff can verify,
          mark as used, or cancel/refund unused codes.
        </p>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[980px] text-left">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-5 py-3 text-xs font-black uppercase text-neutral-500">
                  Code
                </th>
                <th className="px-5 py-3 text-xs font-black uppercase text-neutral-500">
                  Guest
                </th>
                <th className="px-5 py-3 text-xs font-black uppercase text-neutral-500">
                  Reward
                </th>
                <th className="px-5 py-3 text-xs font-black uppercase text-neutral-500">
                  Hotel
                </th>
                <th className="px-5 py-3 text-xs font-black uppercase text-neutral-500">
                  Points
                </th>
                <th className="px-5 py-3 text-xs font-black uppercase text-neutral-500">
                  Status
                </th>
                <th className="px-5 py-3 text-xs font-black uppercase text-neutral-500">
                  Date
                </th>
                <th className="px-5 py-3 text-xs font-black uppercase text-neutral-500">
                  Action
                </th>
              </tr>
            </thead>

            <tbody>
              {redemptions.map((redemption) => (
                <tr key={redemption.id} className="border-t border-neutral-100">
                  <td className="px-5 py-4">
                    <p className="font-mono text-sm font-black tracking-widest text-[#11100b]">
                      {redemption.code}
                    </p>
                  </td>

                  <td className="px-5 py-4">
                    <p className="font-black">{redemption.guestMember.name}</p>
                    <p className="text-xs font-semibold text-neutral-500">
                      {redemption.guestMember.phone ||
                        redemption.guestMember.email ||
                        'No contact'}
                    </p>
                  </td>

                  <td className="px-5 py-4">
                    <p className="font-black">{redemption.reward.name}</p>
                    <p className="text-xs font-semibold text-neutral-500">
                      {redemption.reward.rewardType}
                    </p>
                  </td>

                  <td className="px-5 py-4 text-sm font-bold">
                    {redemption.hotel.name}
                  </td>

                  <td className="px-5 py-4 font-black text-[#b88938]">
                    {formatNumber(redemption.pointsUsed)}
                  </td>

                  <td className="px-5 py-4">
                    <RedemptionStatusPill status={redemption.status} />
                  </td>

                  <td className="px-5 py-4 text-sm font-bold">
                    {formatDate(redemption.redeemedAt)}
                  </td>

                  <td className="px-5 py-4">
                    {redemption.status === 'RESERVED' ? (
                      <RewardRedemptionActionButtons redemptionId={redemption.id} />
                    ) : (
                      <span className="text-xs font-bold text-neutral-400">
                        No action
                      </span>
                    )}
                  </td>
                </tr>
              ))}

              {!redemptions.length ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-5 py-10 text-center font-bold text-neutral-500"
                  >
                    No reward redemptions yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <RewardCatalogManager rewards={rewardCatalogItems} />
    </div>
  );
}