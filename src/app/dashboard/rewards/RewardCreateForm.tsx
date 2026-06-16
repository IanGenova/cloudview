'use client';

import { useState } from 'react';
import { Gift } from 'lucide-react';
import { createRewardAction } from './actions';

type HotelOption = {
  id: string;
  name: string;
};

export function RewardCreateForm({
  hotels,
  defaultHotelId,
  isSuperAdmin,
}: {
  hotels: HotelOption[];
  defaultHotelId: string;
  isSuperAdmin: boolean;
}) {
  const [rewardType, setRewardType] = useState('DISCOUNT_AMOUNT');

  return (
    <div className="rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
      <h2 className="flex items-center gap-2 text-lg font-black">
        <Gift className="size-5 text-[#b88938]" />
        Create Reward
      </h2>

      <form action={createRewardAction} className="mt-5 space-y-4">
        {isSuperAdmin ? (
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
          Save Reward
        </button>
      </form>
    </div>
  );
}