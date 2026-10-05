'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { OrderStatus } from '@prisma/client';
import { cn } from '@/lib/utils';
import { confirmMessage, type ConfirmContext, type StaffAction } from '@/lib/staff-confirm';
import { updateOrderStatusAction } from '@/app/dashboard/orders/actions';

/*
 * IX-1, a blocker in the 2 October audit: Reject on this screen fired
 * `updateOrderStatusAction(CANCELLED)` from a bare onClick — no dialog, no
 * reason, no undo — eight pixels from Accept and the same size, while the
 * identical action on the desk screen was gated behind a modal demanding a
 * reason. A cook with wet hands moving past a wall-mounted tablet could
 * cancel a guest's dinner, and nobody at the desk would learn of it until the
 * guest asked where the food was.
 *
 * Whether an action asks is now decided in `src/lib/staff-confirm.ts`, which
 * is tested, rather than per button — so an action added later and forgotten
 * here still asks, because the rule treats what it does not recognise as
 * destructive. `staff-confirm-wiring.test.ts` reads this file and fails if
 * the question stops being asked.
 */

export function KitchenStatusActionButton({
  orderId,
  status,
  label,
  action,
  order,
  tone = 'dark',
}: {
  orderId: string;
  status: OrderStatus;
  label: string;
  /** What this does in staff terms, for the confirmation rule. */
  action: StaffAction;
  order: ConfirmContext;
  tone?: 'dark' | 'danger' | 'gold' | 'light';
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    const question = confirmMessage(action, order);

    if (question && !window.confirm(question)) {
      return;
    }

    const formData = new FormData();

    formData.set('orderId', orderId);
    formData.set('status', status);
    formData.set(
      'note',
      `Kitchen display changed status to ${status.replaceAll('_', ' ')}`
    );

    startTransition(async () => {
      await updateOrderStatusAction(formData);

      /**
       * Important:
       * router.refresh() updates the kitchen board without navigating away.
       * This helps preserve fullscreen mode.
       */
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={handleClick}
      className={cn(
        'min-h-11 w-full border px-3 py-2 text-xs font-semibold transition disabled:cursor-wait disabled:opacity-60',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current',
        tone === 'dark' &&
          'border-black bg-black text-white hover:bg-neutral-800 dark:border-gold dark:bg-gold dark:text-black dark:hover:bg-gold/80',
        /*
         * VH-4: the destructive action was the most saturated element on the
         * card, so the eye landed on Reject before Accept. A hairline and the
         * danger colour in the text says the same thing without shouting it.
         */
        tone === 'danger' &&
          'border-red-600/60 bg-transparent text-red-700 hover:border-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40',
        tone === 'gold' && 'border-gold bg-gold text-black hover:bg-gold/80',
        tone === 'light' &&
          'border-neutral-300 bg-white text-black hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:hover:bg-neutral-800'
      )}
    >
      {pending ? 'Working…' : label}
    </button>
  );
}
