'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { OrderStatus } from '@prisma/client';
import { cn } from '@/lib/utils';
import { updateOrderStatusAction } from '@/app/dashboard/orders/actions';

export function KitchenStatusActionButton({
  orderId,
  status,
  label,
  tone = 'dark',
}: {
  orderId: string;
  status: OrderStatus;
  label: string;
  tone?: 'dark' | 'danger' | 'gold' | 'light';
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
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
        'min-h-10 w-full rounded-xl border px-3 py-2 text-xs font-black shadow-sm transition active:scale-[0.98] disabled:cursor-wait disabled:opacity-60',
        tone === 'dark' &&
          'border-black bg-black text-white hover:bg-neutral-800 dark:border-gold dark:bg-gold dark:text-black dark:hover:bg-gold/80',
        tone === 'danger' &&
          'border-red-600 bg-red-600 text-white hover:bg-red-700',
        tone === 'gold' &&
          'border-gold bg-gold text-black hover:bg-gold/80',
        tone === 'light' &&
          'border-neutral-300 bg-white text-black hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:hover:bg-neutral-800'
      )}
    >
      {pending ? 'Updating...' : label}
    </button>
  );
}