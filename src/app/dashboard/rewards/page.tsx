import {
  Gift,
  Medal,
  Plus,
  ReceiptText,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';
import { Role } from '@prisma/client';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import {
  createGuestMemberAction,
  createRewardAction,
  manualPointAdjustmentAction,
} from './actions';

export const dynamic = 'force-dynamic';

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

function StatCard({
  label,
  value,
  helper,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  helper: string;
  icon: typeof Gift;
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

export default async function RewardsPage() {
  const user = await requireUser();

  const hotels = await db.hotel.findMany({
    where:
      user.role === Role.SUPER_ADMIN
        ? {}
        : user.hotelId
          ? { id: user.hotelId }
          : { id: '__NO_ACCESS__' },
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
          in: hotelIds,
        }
      : user.hotelId || '__NO_ACCESS__';

  const [
    memberCount,
    rewards,
    accounts,
    ledger,
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

    db.guestPointLedger.findMany({
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
      take: 50,
    }),

    db.rewardRedemption.findMany({
      where: {
        hotelId: hotelWhere,
      },
      include: {
        guestMember: true,
        reward: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 20,
    }),
  ]);

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

  return (
    <div className="space-y-7">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-[#11100b]">
            CloudView Rewards
          </h1>
          <p className="mt-2 text-base font-medium text-neutral-500">
            Manage guest loyalty points, rewards, redemptions, and point activity.
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

      <section className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <div className="space-y-6">
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
                    <tr
                      key={account.id}
                      className="border-t border-neutral-100"
                    >
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
            <div className="border-b border-neutral-100 px-6 py-5">
              <h2 className="text-xl font-black">Point Ledger</h2>
              <p className="mt-1 text-sm font-medium text-neutral-500">
                Every point movement must be recorded here. No silent balance changes.
              </p>
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
          </div>
        </div>

        <aside className="space-y-6">
          <div className="rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
            <h2 className="flex items-center gap-2 text-lg font-black">
              <Plus className="size-5 text-[#b88938]" />
              Add Guest Member
            </h2>

            <form action={createGuestMemberAction} className="mt-5 space-y-4">
              {user.role === Role.SUPER_ADMIN ? (
                <select
                  name="hotelId"
                  defaultValue={defaultHotelId}
                  className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold"
                >
                  {hotels.map((hotel) => (
                    <option key={hotel.id} value={hotel.id}>
                      {hotel.name}
                    </option>
                  ))}
                </select>
              ) : null}

              <input
                name="name"
                placeholder="Guest name"
                className="h-11 w-full rounded-2xl border border-neutral-200 px-4 text-sm font-bold"
                required
              />

              <input
                name="phone"
                placeholder="Phone number"
                className="h-11 w-full rounded-2xl border border-neutral-200 px-4 text-sm font-bold"
              />

              <input
                name="email"
                placeholder="Email"
                type="email"
                className="h-11 w-full rounded-2xl border border-neutral-200 px-4 text-sm font-bold"
              />

              <button className="h-11 w-full rounded-2xl bg-[#11100b] text-sm font-black text-white">
                Create Member
              </button>
            </form>
          </div>

          <div className="rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
            <h2 className="flex items-center gap-2 text-lg font-black">
              <Gift className="size-5 text-[#b88938]" />
              Create Reward
            </h2>

            <form action={createRewardAction} className="mt-5 space-y-4">
              {user.role === Role.SUPER_ADMIN ? (
                <select
                  name="hotelId"
                  defaultValue={defaultHotelId}
                  className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold"
                >
                  {hotels.map((hotel) => (
                    <option key={hotel.id} value={hotel.id}>
                      {hotel.name}
                    </option>
                  ))}
                </select>
              ) : null}

              <input
                name="name"
                placeholder="Reward name"
                className="h-11 w-full rounded-2xl border border-neutral-200 px-4 text-sm font-bold"
                required
              />

              <textarea
                name="description"
                placeholder="Description"
                className="min-h-24 w-full rounded-2xl border border-neutral-200 px-4 py-3 text-sm font-bold"
              />

              <input
                name="pointsCost"
                type="number"
                min="1"
                placeholder="Points cost"
                className="h-11 w-full rounded-2xl border border-neutral-200 px-4 text-sm font-bold"
                required
              />

              <select
                name="rewardType"
                className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold"
              >
                <option value="DISCOUNT_AMOUNT">Peso Discount</option>
                <option value="DISCOUNT_PERCENT">Percent Discount</option>
                <option value="FREE_ITEM">Free Item</option>
                <option value="CUSTOM">Custom Reward</option>
              </select>

              <input
                name="discountPesos"
                type="number"
                min="0"
                placeholder="Discount amount in pesos"
                className="h-11 w-full rounded-2xl border border-neutral-200 px-4 text-sm font-bold"
              />

              <input
                name="discountPercent"
                type="number"
                min="0"
                max="100"
                placeholder="Discount percent"
                className="h-11 w-full rounded-2xl border border-neutral-200 px-4 text-sm font-bold"
              />

              <button className="h-11 w-full rounded-2xl bg-[#11100b] text-sm font-black text-white">
                Save Reward
              </button>
            </form>
          </div>

          <div className="rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
            <h2 className="flex items-center gap-2 text-lg font-black">
              <Medal className="size-5 text-[#b88938]" />
              Manual Adjustment
            </h2>

            <form action={manualPointAdjustmentAction} className="mt-5 space-y-4">
              {user.role === Role.SUPER_ADMIN ? (
                <select
                  name="hotelId"
                  defaultValue={defaultHotelId}
                  className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold"
                >
                  {hotels.map((hotel) => (
                    <option key={hotel.id} value={hotel.id}>
                      {hotel.name}
                    </option>
                  ))}
                </select>
              ) : null}

              <select
                name="guestMemberId"
                className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold"
                required
              >
                <option value="">Select guest</option>
                {accounts.map((account) => (
                  <option
                    key={account.guestMemberId}
                    value={account.guestMemberId}
                  >
                    {account.guestMember.name} — {account.availablePoints} pts
                  </option>
                ))}
              </select>

              <input
                name="points"
                type="number"
                placeholder="+50 or -20"
                className="h-11 w-full rounded-2xl border border-neutral-200 px-4 text-sm font-bold"
                required
              />

              <textarea
                name="description"
                placeholder="Reason for adjustment"
                className="min-h-24 w-full rounded-2xl border border-neutral-200 px-4 py-3 text-sm font-bold"
              />

              <button className="h-11 w-full rounded-2xl bg-[#11100b] text-sm font-black text-white">
                Apply Adjustment
              </button>
            </form>
          </div>
        </aside>
      </section>

      <section className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
        <h2 className="text-xl font-black">Reward Catalog</h2>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rewards.map((reward) => (
            <div
              key={reward.id}
              className="rounded-[1.5rem] border border-neutral-200 bg-neutral-50 p-5"
            >
              <p className="text-lg font-black">{reward.name}</p>
              <p className="mt-1 text-sm font-medium text-neutral-500">
                {reward.description || 'No description'}
              </p>

              <div className="mt-4 flex items-center justify-between">
                <span className="rounded-full bg-[#fff8e7] px-3 py-1 text-xs font-black text-[#9d741f]">
                  {formatNumber(reward.pointsCost)} pts
                </span>

                <span className="text-xs font-black text-neutral-500">
                  {reward.rewardType}
                </span>
              </div>
            </div>
          ))}

          {!rewards.length ? (
            <p className="rounded-2xl border border-dashed border-neutral-200 p-5 text-sm font-bold text-neutral-500">
              No rewards created yet.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}