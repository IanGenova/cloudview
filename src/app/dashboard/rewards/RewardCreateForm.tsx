'use client';

import { useState } from 'react';
import { Gift, Globe2 } from 'lucide-react';
import { createRewardAction } from './actions';

type HotelOption = {
  id: string;
  name: string;
};

export function RewardCreateForm(_props: {
  hotels: HotelOption[];
  defaultHotelId: string;
  isSuperAdmin: boolean;
}) {
  const [rewardType, setRewardType] = useState('DISCOUNT_AMOUNT');

  return (
    <div className="rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
      <h2 className="flex items-center gap-2 text-lg font-black">
        <Gift className="size-5 text-[#b88938]" />
        Create Global Reward
      </h2>

      <div className="mt-4 rounded-2xl border border-[#c99c38]/25 bg-[#fff8e7] p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white text-[#b88938]">
            <Globe2 className="size-5" />
          </span>

          <div>
            <p className="text-sm font-black text-[#11100b]">
              Super Admin global catalog
            </p>
            <p className="mt-1 text-xs font-semibold leading-5 text-neutral-600">
              Saving this reward creates matching reward records for every active
              CloudView hotel so guests across the system can redeem it.
            </p>
          </div>
        </div>
      </div>

      <form action={createRewardAction} className="mt-5 space-y-4">
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
          value={rewardType}
          onChange={(event) => setRewardType(event.target.value)}
          className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold"
        >
          <option value="DISCOUNT_AMOUNT">Peso Discount</option>
          <option value="DISCOUNT_PERCENT">Percent Discount</option>
          <option value="FREE_ITEM">Free Item</option>
          <option value="CUSTOM">Custom Reward</option>
        </select>

        {rewardType === 'DISCOUNT_AMOUNT' ? (
          <input
            name="discountPesos"
            type="number"
            min="0.01"
            step="0.01"
            placeholder="Discount amount in pesos"
            className="h-11 w-full rounded-2xl border border-neutral-200 px-4 text-sm font-bold"
            required
          />
        ) : null}

        {rewardType === 'DISCOUNT_PERCENT' ? (
          <input
            name="discountPercent"
            type="number"
            min="1"
            max="100"
            placeholder="Discount percent"
            className="h-11 w-full rounded-2xl border border-neutral-200 px-4 text-sm font-bold"
            required
          />
        ) : null}

        {rewardType === 'FREE_ITEM' ? (
          <input
            name="freeProductId"
            placeholder="Free product ID optional"
            className="h-11 w-full rounded-2xl border border-neutral-200 px-4 text-sm font-bold"
          />
        ) : null}

        {rewardType === 'CUSTOM' ? (
          <div className="rounded-2xl bg-[#fff8e7] p-4 text-sm font-bold text-[#8a641d]">
            Custom rewards do not need discount fields. Describe the reward
            clearly in the description box.
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1">
            <span className="text-xs font-black uppercase text-neutral-500">
              Valid From Optional
            </span>
            <input
              name="validFrom"
              type="date"
              className="h-11 rounded-2xl border border-neutral-200 px-4 text-sm font-bold"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-xs font-black uppercase text-neutral-500">
              Valid Until Optional
            </span>
            <input
              name="validUntil"
              type="date"
              className="h-11 rounded-2xl border border-neutral-200 px-4 text-sm font-bold"
            />
          </label>
        </div>

        <button className="h-11 w-full rounded-2xl bg-[#11100b] text-sm font-black text-white">
          Save Global Reward
        </button>
      </form>
    </div>
  );
}
