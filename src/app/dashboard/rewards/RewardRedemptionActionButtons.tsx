'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, X } from 'lucide-react';
import {
  cancelRewardRedemptionAction,
  markRewardRedemptionUsedAction,
} from './actions';
import {
  RewardsToast,
  type RewardsToastMessage,
} from './RewardsToast';

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Action failed. Please try again.';
}

export function RewardRedemptionActionButtons({
  redemptionId,
}: {
  redemptionId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<RewardsToastMessage | null>(null);

  function runAction(
    action: (formData: FormData) => Promise<void>,
    successMessage: RewardsToastMessage
  ) {
    const formData = new FormData();
    formData.set('redemptionId', redemptionId);

    setToast(null);

    startTransition(() => {
      void (async () => {
        try {
          await action(formData);

          setToast(successMessage);
          router.refresh();
        } catch (error) {
          setToast({
            type: 'error',
            title: 'Action failed',
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

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            runAction(markRewardRedemptionUsedAction, {
              type: 'success',
              title: 'Redemption marked as used',
              description: 'The guest redemption code is now completed.',
              action: 'used',
            })
          }
          className="rounded-full bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-60"
        >
          <span className="inline-flex items-center gap-1">
            <CheckCircle2 className="size-3" />
            {isPending ? 'Saving...' : 'Mark Used'}
          </span>
        </button>

        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            runAction(cancelRewardRedemptionAction, {
              type: 'success',
              title: 'Redemption cancelled',
              description: 'The redemption was cancelled and points were refunded.',
              action: 'refunded',
            })
          }
          className="rounded-full bg-red-600 px-3 py-2 text-xs font-black text-white disabled:opacity-60"
        >
          <span className="inline-flex items-center gap-1">
            <X className="size-3" />
            {isPending ? 'Saving...' : 'Cancel / Refund'}
          </span>
        </button>
      </div>
    </>
  );
}