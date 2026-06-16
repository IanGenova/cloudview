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
};

const inputClass =
  'h-12 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none transition focus:border-[#b88938] focus:ring-4 focus:ring-[#b88938]/10';

const textAreaClass =
  'min-h-28 w-full resize-none rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-bold outline-none transition focus:border-[#b88938] focus:ring-4 focus:ring-[#b88938]/10';

const selectClass =
  'h-12 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none transition focus:border-[#b88938] focus:ring-4 focus:ring-[#b88938]/10';

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
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-[#11100b]">{title}</h2>
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
    <form onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="rewardId" value={reward.id} />

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

      <div className="grid gap-4 md:grid-cols-2">
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
        <div className="rounded-2xl bg-[#fff8e7] p-4 text-sm font-bold text-[#8a641d]">
          Custom rewards do not need discount fields.
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
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

      <label className="flex items-center gap-3 rounded-2xl bg-neutral-50 p-4 text-sm font-bold text-neutral-700">
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
        className="h-12 w-full rounded-2xl bg-[#11100b] text-sm font-black text-white disabled:opacity-60"
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
  const [editingReward, setEditingReward] = useState<RewardCatalogItem | null>(
    null
  );
  const [deletingReward, setDeletingReward] =
    useState<RewardCatalogItem | null>(null);
  const [toast, setToast] = useState<RewardsToastMessage | null>(null);
  const [isPending, startTransition] = useTransition();

  const filteredRewards = useMemo(() => {
    const search = query.trim().toLowerCase();

    if (!search) {
      return rewards;
    }

    return rewards.filter((reward) =>
      `${reward.name} ${reward.description} ${reward.rewardType}`
        .toLowerCase()
        .includes(search)
    );
  }, [query, rewards]);

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
    formData.set('rewardId', deletingReward.id);

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

      <section className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-xl font-black">Reward Catalog</h2>
            <p className="mt-1 text-sm font-medium text-neutral-500">
              Edit, deactivate, or delete rewards shown in the guest portal.
            </p>
          </div>

          <div className="flex h-11 w-full items-center gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 md:w-80">
            <Search className="size-4 text-neutral-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search rewards..."
              className="w-full bg-transparent text-sm font-bold outline-none"
            />
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredRewards.map((reward) => (
            <div
              key={reward.id}
              className="rounded-[1.5rem] border border-neutral-200 bg-neutral-50 p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-black">{reward.name}</p>
                  <p className="mt-1 text-sm font-medium text-neutral-500">
                    {reward.description || 'No description'}
                  </p>
                </div>

                <span
                  className={
                    reward.isActive
                      ? 'rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black text-emerald-700'
                      : 'rounded-full bg-neutral-200 px-2.5 py-1 text-[10px] font-black text-neutral-600'
                  }
                >
                  {reward.isActive ? 'ACTIVE' : 'INACTIVE'}
                </span>
              </div>

              <p className="mt-3 text-sm font-bold text-neutral-600">
                {rewardValueText(reward)}
              </p>

              <div className="mt-4 flex items-center justify-between">
                <span className="rounded-full bg-[#fff8e7] px-3 py-1 text-xs font-black text-[#9d741f]">
                  {formatNumber(reward.pointsCost)} pts
                </span>

                <span className="text-xs font-black text-neutral-500">
                  {rewardTypeLabel(reward.rewardType)}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setEditingReward(reward)}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-[#11100b] px-4 text-sm font-black text-white"
                >
                  <Edit3 className="size-4" />
                  Edit
                </button>

                <button
                  type="button"
                  onClick={() => setDeletingReward(reward)}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 text-sm font-black text-white"
                >
                  <Trash2 className="size-4" />
                  Delete
                </button>
              </div>

              {reward.redemptionCount > 0 ? (
                <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-700">
                  {reward.redemptionCount} redemption
                  {reward.redemptionCount === 1 ? '' : 's'} linked. Delete will
                  deactivate this reward only.
                </p>
              ) : null}
            </div>
          ))}

          {!filteredRewards.length ? (
            <div className="rounded-2xl border border-dashed border-neutral-200 p-8 text-center text-sm font-bold text-neutral-500">
              <Gift className="mx-auto mb-3 size-8 text-neutral-400" />
              No rewards found.
            </div>
          ) : null}
        </div>
      </section>

      {editingReward ? (
        <Modal
          title="Edit Reward"
          description="Update the reward details shown in the guest rewards catalog."
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
          title="Delete Reward"
          description={
            deletingReward.redemptionCount > 0
              ? 'This reward has redemption history. It will be deactivated instead of permanently deleted.'
              : 'This reward has no redemption history and can be permanently deleted.'
          }
          onClose={() => setDeletingReward(null)}
        >
          <div className="rounded-2xl bg-red-50 p-4 text-sm font-bold leading-6 text-red-700">
            Are you sure you want to remove <b>{deletingReward.name}</b> from
            the reward catalog?
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