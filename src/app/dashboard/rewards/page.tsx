import Link from 'next/link';
import {
  ChevronLeft,
  ChevronRight,
  ReceiptText,
  Sparkles,
  Trophy,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { DashboardModule } from '@prisma/client';
import { db } from '@/lib/db';
import { requireDashboardPermission } from '@/lib/dashboard-permissions';
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
    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.07] p-4 shadow-[0_16px_40px_rgba(0,0,0,0.14)]">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#d6a738]/15 text-[#f1c66a]">
          <Icon className="size-5" />
        </span>

        <div className="min-w-0">
          <p className="truncate text-[10px] font-black uppercase tracking-[0.18em] text-[#f1c66a]">
            {label}
          </p>
          <p className="mt-1 text-2xl font-black leading-none text-white">
            {value}
          </p>
          <p className="mt-1 truncate text-[11px] font-bold text-white/45">
            {helper}
          </p>
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


type RewardCatalogSourceItem = {
  id: string;
  name: string;
  description: string | null;
  pointsCost: number;
  rewardType: string;
  discountCents: number | null;
  discountPercent: number | null;
  freeProductId: string | null;
  isActive: boolean;
  validFrom: Date | null;
  validUntil: Date | null;
  hotel: {
    name: string;
  };
  _count: {
    redemptions: number;
  };
};

function getRewardCatalogGroupKey(reward: RewardCatalogSourceItem) {
  return JSON.stringify({
    name: reward.name.trim().toLowerCase(),
    description: (reward.description ?? '').trim().toLowerCase(),
    pointsCost: reward.pointsCost,
    rewardType: reward.rewardType,
    discountCents: reward.discountCents ?? null,
    discountPercent: reward.discountPercent ?? null,
    freeProductId: reward.freeProductId ?? '',
    isActive: reward.isActive,
    validFrom: reward.validFrom ? reward.validFrom.toISOString().slice(0, 10) : '',
    validUntil: reward.validUntil
      ? reward.validUntil.toISOString().slice(0, 10)
      : '',
  });
}

function buildRewardCatalogItems(rewards: RewardCatalogSourceItem[]) {
  const groupedRewards = new Map<
    string,
    {
      id: string;
      rewardIds: string[];
      name: string;
      description: string;
      pointsCost: number;
      rewardType: string;
      discountCents: number | null;
      discountPercent: number | null;
      freeProductId: string;
      isActive: boolean;
      validFrom: string;
      validUntil: string;
      redemptionCount: number;
      hotelCount: number;
      hotelNames: string[];
    }
  >();

  for (const reward of rewards) {
    const key = getRewardCatalogGroupKey(reward);
    const existingGroup = groupedRewards.get(key);
    const validFrom = reward.validFrom
      ? reward.validFrom.toISOString().slice(0, 10)
      : '';
    const validUntil = reward.validUntil
      ? reward.validUntil.toISOString().slice(0, 10)
      : '';

    if (!existingGroup) {
      groupedRewards.set(key, {
        id: reward.id,
        rewardIds: [reward.id],
        name: reward.name,
        description: reward.description ?? '',
        pointsCost: reward.pointsCost,
        rewardType: reward.rewardType,
        discountCents: reward.discountCents,
        discountPercent: reward.discountPercent,
        freeProductId: reward.freeProductId ?? '',
        isActive: reward.isActive,
        validFrom,
        validUntil,
        redemptionCount: reward._count.redemptions,
        hotelCount: 1,
        hotelNames: [reward.hotel.name],
      });

      continue;
    }

    existingGroup.rewardIds.push(reward.id);
    existingGroup.redemptionCount += reward._count.redemptions;

    if (!existingGroup.hotelNames.includes(reward.hotel.name)) {
      existingGroup.hotelNames.push(reward.hotel.name);
      existingGroup.hotelNames.sort((a, b) => a.localeCompare(b));
      existingGroup.hotelCount = existingGroup.hotelNames.length;
    }
  }

  return Array.from(groupedRewards.values());
}

export default async function RewardsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    ledgerPage?: string;
  }>;
}) {
  const user = await requireDashboardPermission(
    DashboardModule.REWARDS,
    'canView'
  );

  const params = await searchParams;
  const requestedLedgerPage = parsePage(params?.ledgerPage);

  const hotels = await db.hotel.findMany({
    where: {
      isActive: true,
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

  const hotelWhere = {
    in: hotelIds.length ? hotelIds : ['__NO_ACCESS__'],
  };

  const [
    memberCount,
    rewards,
    accounts,
    pointTotals,
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

    db.guestPointAccount.aggregate({
      where: {
        hotelId: hotelWhere,
      },
      _sum: {
        availablePoints: true,
        lifetimeEarnedPoints: true,
        lifetimeRedeemedPoints: true,
      },
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

  const totalAvailablePoints = pointTotals._sum.availablePoints ?? 0;
  const totalLifetimeEarned = pointTotals._sum.lifetimeEarnedPoints ?? 0;
  const totalRedeemed = pointTotals._sum.lifetimeRedeemedPoints ?? 0;

  const defaultHotelId = hotels[0]?.id ?? '';

  const rewardCatalogItems = buildRewardCatalogItems(rewards);

  const modalMembers = memberOptions.map((member) => ({
    id: member.id,
    hotelId: member.hotelId,
    hotelName: member.hotel.name,
    name: member.name,
    contact: member.phone || member.email || 'No contact',
    availablePoints: member.pointAccount?.availablePoints ?? 0,
  }));

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[2rem] border border-[#c99c38]/25 bg-[#11100b] text-white shadow-[0_24px_70px_rgba(0,0,0,0.16)]">
        <div className="relative p-5 md:p-6">
          <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-[#c99c38]/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 left-10 size-72 rounded-full bg-emerald-500/10 blur-3xl" />

          <div className="relative z-10 grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)] xl:items-end">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-[#c99c38]/35 bg-white/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.22em] text-[#f1c66a]">
                <Sparkles className="size-4" />
                Super Admin Loyalty Center
              </p>

              <h1 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">
                Global CloudView Rewards
              </h1>

              <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-white/55">
                Manage global guest loyalty points, reward catalog, redemptions,
                and point activity for every active CloudView hotel.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Members"
                value={formatNumber(memberCount)}
                helper="Global loyalty guests"
                icon={Users}
              />

              <StatCard
                label="Available"
                value={formatNumber(totalAvailablePoints)}
                helper="All hotels balance"
                icon={Sparkles}
              />

              <StatCard
                label="Earned"
                value={formatNumber(totalLifetimeEarned)}
                helper="Issued points"
                icon={Trophy}
              />

              <StatCard
                label="Redeemed"
                value={formatNumber(totalRedeemed)}
                helper="Used points"
                icon={ReceiptText}
              />
            </div>
          </div>
        </div>
      </section>

      <RewardsActionModals
        hotels={hotels}
        members={modalMembers}
        defaultHotelId={defaultHotelId}
        isSuperAdmin={true}
      />

      <RewardCatalogManager rewards={rewardCatalogItems} />

      <section className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="overflow-hidden rounded-[1.75rem] border border-neutral-200 bg-white shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
          <div className="flex items-start justify-between gap-3 border-b border-neutral-100 px-5 py-4">
            <div>
              <h2 className="text-lg font-black text-[#11100b]">Top Members</h2>
              <p className="mt-1 text-xs font-semibold text-neutral-500">
                Highest available point balances across hotels.
              </p>
            </div>

            <span className="rounded-full bg-[#fff8e7] px-3 py-1 text-xs font-black text-[#9d741f]">
              Top {accounts.length}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="px-4 py-3 text-[11px] font-black uppercase text-neutral-500">
                    Guest
                  </th>
                  <th className="px-4 py-3 text-[11px] font-black uppercase text-neutral-500">
                    Hotel
                  </th>
                  <th className="px-4 py-3 text-[11px] font-black uppercase text-neutral-500">
                    Available
                  </th>
                  <th className="px-4 py-3 text-[11px] font-black uppercase text-neutral-500">
                    Earned
                  </th>
                  <th className="px-4 py-3 text-[11px] font-black uppercase text-neutral-500">
                    Redeemed
                  </th>
                </tr>
              </thead>

              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id} className="border-t border-neutral-100">
                    <td className="px-4 py-3">
                      <p className="text-sm font-black text-[#11100b]">
                        {account.guestMember.name}
                      </p>
                      <p className="text-xs font-semibold text-neutral-500">
                        {account.guestMember.phone ||
                          account.guestMember.email ||
                          'No contact'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs font-bold text-neutral-600">
                      {account.hotel.name}
                    </td>
                    <td className="px-4 py-3 text-sm font-black text-[#b88938]">
                      {formatNumber(account.availablePoints)}
                    </td>
                    <td className="px-4 py-3 text-sm font-bold">
                      {formatNumber(account.lifetimeEarnedPoints)}
                    </td>
                    <td className="px-4 py-3 text-sm font-bold">
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

        <div className="overflow-hidden rounded-[1.75rem] border border-neutral-200 bg-white shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-100 px-5 py-4">
            <div>
              <h2 className="text-lg font-black text-[#11100b]">Point Ledger</h2>
              <p className="mt-1 text-xs font-semibold text-neutral-500">
                Latest movements with audit notes and source labels.
              </p>
            </div>

            <span className="rounded-full bg-[#fff8e7] px-3 py-1 text-xs font-black text-[#9d741f]">
              10 per page
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="px-4 py-3 text-[11px] font-black uppercase text-neutral-500">
                    Date
                  </th>
                  <th className="px-4 py-3 text-[11px] font-black uppercase text-neutral-500">
                    Guest
                  </th>
                  <th className="px-4 py-3 text-[11px] font-black uppercase text-neutral-500">
                    Type
                  </th>
                  <th className="px-4 py-3 text-[11px] font-black uppercase text-neutral-500">
                    Points
                  </th>
                  <th className="px-4 py-3 text-[11px] font-black uppercase text-neutral-500">
                    Source
                  </th>
                  <th className="px-4 py-3 text-[11px] font-black uppercase text-neutral-500">
                    Notes
                  </th>
                </tr>
              </thead>

              <tbody>
                {ledger.map((item) => (
                  <tr key={item.id} className="border-t border-neutral-100">
                    <td className="px-4 py-3 text-xs font-bold text-neutral-600">
                      {formatDate(item.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-black text-[#11100b]">
                        {item.guestMember.name}
                      </p>
                      <p className="text-xs text-neutral-500">{item.hotel.name}</p>
                    </td>
                    <td className="px-4 py-3 text-xs font-black">
                      {item.type.replaceAll('_', ' ')}
                    </td>
                    <td
                      className={
                        item.points >= 0
                          ? 'px-4 py-3 text-sm font-black text-emerald-700'
                          : 'px-4 py-3 text-sm font-black text-red-600'
                      }
                    >
                      {item.points >= 0 ? '+' : ''}
                      {formatNumber(item.points)}
                    </td>
                    <td className="px-4 py-3 text-xs font-bold text-neutral-700">
                      {item.source.replaceAll('_', ' ')}
                    </td>
                    <td className="max-w-[240px] px-4 py-3 text-xs font-medium text-neutral-500">
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

      <section className="overflow-hidden rounded-[1.75rem] border border-neutral-200 bg-white shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-black text-[#11100b]">
              Reward Redemptions
            </h2>
            <p className="mt-1 text-xs font-semibold text-neutral-500">
              Codes submitted by guests. Verify, use, or refund reserved claims.
            </p>
          </div>

          <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-black text-neutral-600">
            Latest {redemptions.length}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-4 py-3 text-[11px] font-black uppercase text-neutral-500">
                  Code
                </th>
                <th className="px-4 py-3 text-[11px] font-black uppercase text-neutral-500">
                  Guest
                </th>
                <th className="px-4 py-3 text-[11px] font-black uppercase text-neutral-500">
                  Reward
                </th>
                <th className="px-4 py-3 text-[11px] font-black uppercase text-neutral-500">
                  Hotel
                </th>
                <th className="px-4 py-3 text-[11px] font-black uppercase text-neutral-500">
                  Points
                </th>
                <th className="px-4 py-3 text-[11px] font-black uppercase text-neutral-500">
                  Status
                </th>
                <th className="px-4 py-3 text-[11px] font-black uppercase text-neutral-500">
                  Date
                </th>
                <th className="px-4 py-3 text-[11px] font-black uppercase text-neutral-500">
                  Action
                </th>
              </tr>
            </thead>

            <tbody>
              {redemptions.map((redemption) => (
                <tr key={redemption.id} className="border-t border-neutral-100">
                  <td className="px-4 py-3">
                    <p className="font-mono text-xs font-black tracking-widest text-[#11100b]">
                      {redemption.code}
                    </p>
                  </td>

                  <td className="px-4 py-3">
                    <p className="text-sm font-black text-[#11100b]">
                      {redemption.guestMember.name}
                    </p>
                    <p className="text-xs font-semibold text-neutral-500">
                      {redemption.guestMember.phone ||
                        redemption.guestMember.email ||
                        'No contact'}
                    </p>
                  </td>

                  <td className="px-4 py-3">
                    <p className="text-sm font-black text-[#11100b]">
                      {redemption.reward.name}
                    </p>
                    <p className="text-xs font-semibold text-neutral-500">
                      {redemption.reward.rewardType.replaceAll('_', ' ')}
                    </p>
                  </td>

                  <td className="px-4 py-3 text-xs font-bold text-neutral-700">
                    {redemption.hotel.name}
                  </td>

                  <td className="px-4 py-3 text-sm font-black text-[#b88938]">
                    {formatNumber(redemption.pointsUsed)}
                  </td>

                  <td className="px-4 py-3">
                    <RedemptionStatusPill status={redemption.status} />
                  </td>

                  <td className="px-4 py-3 text-xs font-bold text-neutral-600">
                    {formatDate(redemption.redeemedAt)}
                  </td>

                  <td className="px-4 py-3">
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
    </div>
  );
}
