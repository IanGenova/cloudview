'use client';

import { type FormEvent, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Edit3, Gift, Search, Trash2, X } from 'lucide-react';
import { deleteRewardAction, updateRewardAction } from './actions';
import {
  RewardsToast,
  type RewardsToastMessage,
} from './RewardsToast';

type RewardCatalogItem = {
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
};

type RewardStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';

const inputClass =
  'h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none transition focus:border-[#b88938] focus:ring-4 focus:ring-[#b88938]/10';

const textAreaClass =
  'min-h-24 w-full resize-none rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-bold outline-none transition focus:border-[#b88938] focus:ring-4 focus:ring-[#b88938]/10';

const selectClass =
  'h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none transition focus:border-[#b88938] focus:ring-4 focus:ring-[#b88938]/10';

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Action failed. Please try again.';
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-PH').format(value);
}

function rewardTypeLabel(type: string) {
  return type.replaceAll('_', ' ');
}

function rewardValueText(reward: RewardCatalogItem) {
  if (reward.rewardType === 'DISCOUNT_AMOUNT') {
    return `₱${((reward.discountCents ?? 0) / 100).toLocaleString('en-PH')} discount`;
  }

  if (reward.rewardType === 'DISCOUNT_PERCENT') {
    return `${reward.discountPercent ?? 0}% discount`;
  }

  if (reward.rewardType === 'FREE_ITEM') {
    return 'Free item';
  }

  return 'Custom reward';
}

function StatusPill({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={
        isActive
          ? 'inline-flex rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700'
          : 'inline-flex rounded-full bg-neutral-200 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-neutral-600'
      }
    >
      {isActive ? 'Active' : 'Inactive'}
    </span>
  );
}

function Modal({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/55 px-4 py-6 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-[#11100b]">{title}</h2>
            <p className="mt-1 text-sm font-semibold leading-6 text-neutral-500">
              {description}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="grid size-10 shrink-0 place-items-center rounded-full bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
            aria-label="Close modal"
          >
            <X className="size-5" />
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

function EditRewardForm({
  reward,
  isPending,
  onSubmit,
}: {
  reward: RewardCatalogItem;
  isPending: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [rewardType, setRewardType] = useState(reward.rewardType);

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input type="hidden" name="rewardIds" value={reward.rewardIds.join(',')} />

      <label className="grid gap-1">
        <span className="text-xs font-black uppercase tracking-wide text-neutral-500">
          Reward Name
        </span>
        <input
          name="name"
          defaultValue={reward.name}
          className={inputClass}
          required
        />
      </label>

      <label className="grid gap-1">
        <span className="text-xs font-black uppercase tracking-wide text-neutral-500">
          Description
        </span>
        <textarea
          name="description"
          defaultValue={reward.description}
          className={textAreaClass}
        />
      </label>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1">
          <span className="text-xs font-black uppercase tracking-wide text-neutral-500">
            Points Cost
          </span>
          <input
            name="pointsCost"
            type="number"
            min="1"
            defaultValue={reward.pointsCost}
            className={inputClass}
            required
          />
        </label>

        <label className="grid gap-1">
          <span className="text-xs font-black uppercase tracking-wide text-neutral-500">
            Reward Type
          </span>
          <select
            name="rewardType"
            value={rewardType}
            onChange={(event) => setRewardType(event.target.value)}
            className={selectClass}
          >
            <option value="DISCOUNT_AMOUNT">Peso Discount</option>
            <option value="DISCOUNT_PERCENT">Percent Discount</option>
            <option value="FREE_ITEM">Free Item</option>
            <option value="CUSTOM">Custom Reward</option>
          </select>
        </label>
      </div>

      {rewardType === 'DISCOUNT_AMOUNT' ? (
        <label className="grid gap-1">
          <span className="text-xs font-black uppercase tracking-wide text-neutral-500">
            Discount Amount in Pesos
          </span>
          <input
            name="discountPesos"
            type="number"
            min="0.01"
            step="0.01"
            defaultValue={
              reward.discountCents ? reward.discountCents / 100 : ''
            }
            className={inputClass}
            required
          />
        </label>
      ) : null}

      {rewardType === 'DISCOUNT_PERCENT' ? (
        <label className="grid gap-1">
          <span className="text-xs font-black uppercase tracking-wide text-neutral-500">
            Discount Percent
          </span>
          <input
            name="discountPercent"
            type="number"
            min="1"
            max="100"
            defaultValue={reward.discountPercent ?? ''}
            className={inputClass}
            required
          />
        </label>
      ) : null}

      {rewardType === 'FREE_ITEM' ? (
        <label className="grid gap-1">
          <span className="text-xs font-black uppercase tracking-wide text-neutral-500">
            Free Product ID Optional
          </span>
          <input
            name="freeProductId"
            defaultValue={reward.freeProductId}
            className={inputClass}
          />
        </label>
      ) : null}

      {rewardType === 'CUSTOM' ? (
        <div className="rounded-2xl bg-[#fff8e7] p-3 text-sm font-bold text-[#8a641d]">
          Custom rewards do not need discount fields.
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1">
          <span className="text-xs font-black uppercase tracking-wide text-neutral-500">
            Valid From Optional
          </span>
          <input
            name="validFrom"
            type="date"
            defaultValue={reward.validFrom}
            className={inputClass}
          />
        </label>

        <label className="grid gap-1">
          <span className="text-xs font-black uppercase tracking-wide text-neutral-500">
            Valid Until Optional
          </span>
          <input
            name="validUntil"
            type="date"
            defaultValue={reward.validUntil}
            className={inputClass}
          />
        </label>
      </div>

      <label className="flex items-center gap-3 rounded-2xl bg-neutral-50 p-3 text-sm font-bold text-neutral-700">
        <input
          name="isActive"
          type="checkbox"
          value="true"
          defaultChecked={reward.isActive}
          className="size-4"
        />
        Active and visible to guests
      </label>

      <button
        type="submit"
        disabled={isPending}
        className="h-11 w-full rounded-2xl bg-[#11100b] text-sm font-black text-white disabled:opacity-60"
      >
        {isPending ? 'Saving...' : 'Save Changes'}
      </button>
    </form>
  );
}

export function RewardCatalogManager({
  rewards,
}: {
  rewards: RewardCatalogItem[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<RewardStatusFilter>('ALL');
  const [editingReward, setEditingReward] = useState<RewardCatalogItem | null>(
    null
  );
  const [deletingReward, setDeletingReward] =
    useState<RewardCatalogItem | null>(null);
  const [toast, setToast] = useState<RewardsToastMessage | null>(null);
  const [isPending, startTransition] = useTransition();

  const activeCount = rewards.filter((reward) => reward.isActive).length;
  const inactiveCount = rewards.length - activeCount;

  const filteredRewards = useMemo(() => {
    const search = query.trim().toLowerCase();

    return rewards.filter((reward) => {
      if (statusFilter === 'ACTIVE' && !reward.isActive) {
        return false;
      }

      if (statusFilter === 'INACTIVE' && reward.isActive) {
        return false;
      }

      if (!search) {
        return true;
      }

      return `${reward.name} ${reward.description} ${reward.rewardType} ${reward.hotelNames.join(' ')}`
        .toLowerCase()
        .includes(search);
    });
  }, [query, rewards, statusFilter]);

  function handleEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    setToast(null);

    startTransition(() => {
      void (async () => {
        try {
          await updateRewardAction(formData);

          setEditingReward(null);
          setToast({
            type: 'success',
            title: 'Reward updated',
            description: 'The reward catalog item was edited successfully.',
            action: 'edited',
          });

          router.refresh();
        } catch (error) {
          setToast({
            type: 'error',
            title: 'Update failed',
            description: getErrorMessage(error),
            action: 'failed',
          });
        }
      })();
    });
  }

  function handleDeleteReward() {
    if (!deletingReward) {
      return;
    }

    const formData = new FormData();
    formData.set('rewardIds', deletingReward.rewardIds.join(','));

    setToast(null);

    startTransition(() => {
      void (async () => {
        try {
          await deleteRewardAction(formData);

          const hadRedemptions = deletingReward.redemptionCount > 0;

          setDeletingReward(null);
          setToast({
            type: 'success',
            title: hadRedemptions ? 'Reward deactivated' : 'Reward deleted',
            description: hadRedemptions
              ? 'This reward has redemption history, so it was safely deactivated instead of permanently deleted.'
              : 'The reward was permanently deleted from the catalog.',
            action: 'deleted',
          });

          router.refresh();
        } catch (error) {
          setToast({
            type: 'error',
            title: 'Delete failed',
            description: getErrorMessage(error),
            action: 'failed',
          });
        }
      })();
    });
  }

  return (
    <>
      <RewardsToast message={toast} onClose={() => setToast(null)} />

      <section className="overflow-hidden rounded-[1.75rem] border border-neutral-200 bg-white shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
        <div className="flex flex-col gap-4 border-b border-neutral-100 px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#b88938]">
              Global Catalog
            </p>
            <h2 className="mt-1 text-lg font-black text-[#11100b]">
              Rewards Broadcasted to Hotels
            </h2>
            <p className="mt-1 text-xs font-semibold text-neutral-500">
              Compact table view for editing, deactivating, and auditing global rewards.
            </p>
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <div className="flex h-11 min-w-0 items-center gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 md:w-80">
              <Search className="size-4 shrink-0 text-neutral-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search rewards, hotel, type..."
                className="w-full bg-transparent text-sm font-bold outline-none"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as RewardStatusFilter)
              }
              className="h-11 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-black outline-none transition focus:border-[#b88938] focus:ring-4 focus:ring-[#b88938]/10"
            >
              <option value="ALL">All rewards</option>
              <option value="ACTIVE">Active only</option>
              <option value="INACTIVE">Inactive only</option>
            </select>
          </div>
        </div>

        <div className="grid border-b border-neutral-100 bg-neutral-50 sm:grid-cols-4">
          <div className="border-b border-neutral-100 px-5 py-3 sm:border-b-0 sm:border-r">
            <p className="text-[10px] font-black uppercase tracking-wide text-neutral-500">
              Total
            </p>
            <p className="mt-1 text-xl font-black text-[#11100b]">
              {formatNumber(rewards.length)}
            </p>
          </div>

          <div className="border-b border-neutral-100 px-5 py-3 sm:border-b-0 sm:border-r">
            <p className="text-[10px] font-black uppercase tracking-wide text-neutral-500">
              Active
            </p>
            <p className="mt-1 text-xl font-black text-emerald-700">
              {formatNumber(activeCount)}
            </p>
          </div>

          <div className="border-b border-neutral-100 px-5 py-3 sm:border-b-0 sm:border-r">
            <p className="text-[10px] font-black uppercase tracking-wide text-neutral-500">
              Inactive
            </p>
            <p className="mt-1 text-xl font-black text-neutral-600">
              {formatNumber(inactiveCount)}
            </p>
          </div>

          <div className="px-5 py-3">
            <p className="text-[10px] font-black uppercase tracking-wide text-neutral-500">
              Showing
            </p>
            <p className="mt-1 text-xl font-black text-[#b88938]">
              {formatNumber(filteredRewards.length)}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left">
            <thead className="bg-white">
              <tr>
                <th className="px-5 py-3 text-[11px] font-black uppercase text-neutral-500">
                  Reward
                </th>
                <th className="px-5 py-3 text-[11px] font-black uppercase text-neutral-500">
                  Value / Type
                </th>
                <th className="px-5 py-3 text-[11px] font-black uppercase text-neutral-500">
                  Cost
                </th>
                <th className="px-5 py-3 text-[11px] font-black uppercase text-neutral-500">
                  Hotels
                </th>
                <th className="px-5 py-3 text-[11px] font-black uppercase text-neutral-500">
                  Redemptions
                </th>
                <th className="px-5 py-3 text-[11px] font-black uppercase text-neutral-500">
                  Status
                </th>
                <th className="px-5 py-3 text-[11px] font-black uppercase text-neutral-500">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody>
              {filteredRewards.map((reward) => (
                <tr key={reward.id} className="border-t border-neutral-100">
                  <td className="px-5 py-4">
                    <div className="flex items-start gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#fff8e7] text-[#b88938]">
                        <Gift className="size-5" />
                      </span>

                      <div className="min-w-0">
                        <p className="text-sm font-black text-[#11100b]">
                          {reward.name}
                        </p>
                        <p className="mt-1 max-w-[360px] truncate text-xs font-semibold text-neutral-500">
                          {reward.description || 'No description'}
                        </p>
                      </div>
                    </div>
                  </td>

                  <td className="px-5 py-4">
                    <p className="text-sm font-black text-[#11100b]">
                      {rewardValueText(reward)}
                    </p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      {rewardTypeLabel(reward.rewardType)}
                    </p>
                  </td>

                  <td className="px-5 py-4">
                    <span className="rounded-full bg-[#fff8e7] px-3 py-1 text-xs font-black text-[#9d741f]">
                      {formatNumber(reward.pointsCost)} pts
                    </span>
                  </td>

                  <td className="px-5 py-4">
                    <p className="text-sm font-black text-[#11100b]">
                      {reward.hotelCount} hotel
                      {reward.hotelCount === 1 ? '' : 's'}
                    </p>
                    <p className="mt-1 max-w-[260px] truncate text-xs font-semibold text-neutral-500">
                      {reward.hotelNames.join(', ')}
                    </p>
                  </td>

                  <td className="px-5 py-4 text-sm font-black text-neutral-700">
                    {formatNumber(reward.redemptionCount)}
                  </td>

                  <td className="px-5 py-4">
                    <StatusPill isActive={reward.isActive} />
                  </td>

                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingReward(reward)}
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-full bg-[#11100b] px-3 text-xs font-black text-white"
                      >
                        <Edit3 className="size-3.5" />
                        Edit
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeletingReward(reward)}
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-full bg-red-50 px-3 text-xs font-black text-red-700"
                      >
                        <Trash2 className="size-3.5" />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!filteredRewards.length ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-10 text-center text-sm font-bold text-neutral-500"
                  >
                    <Gift className="mx-auto mb-3 size-8 text-neutral-400" />
                    No rewards found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {editingReward ? (
        <Modal
          title="Edit Global Reward"
          description="Update this global reward across its linked hotel records."
          onClose={() => setEditingReward(null)}
        >
          <EditRewardForm
            reward={editingReward}
            isPending={isPending}
            onSubmit={handleEditSubmit}
          />
        </Modal>
      ) : null}

      {deletingReward ? (
        <Modal
          title="Delete Global Reward"
          description={
            deletingReward.redemptionCount > 0
              ? 'This global reward has redemption history. Linked records with redemptions will be deactivated instead of permanently deleted.'
              : 'This global reward has no redemption history and can be permanently deleted from all linked hotels.'
          }
          onClose={() => setDeletingReward(null)}
        >
          <div className="rounded-2xl bg-red-50 p-4 text-sm font-bold leading-6 text-red-700">
            Are you sure you want to remove <b>{deletingReward.name}</b> from
            the global reward catalog across {deletingReward.hotelCount} hotel
            {deletingReward.hotelCount === 1 ? '' : 's'}?
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setDeletingReward(null)}
              disabled={isPending}
              className="h-11 rounded-2xl border border-neutral-200 bg-white text-sm font-black text-neutral-700"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleDeleteReward}
              disabled={isPending}
              className="h-11 rounded-2xl bg-red-600 text-sm font-black text-white disabled:opacity-60"
            >
              {isPending ? 'Deleting...' : 'Confirm Delete'}
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
