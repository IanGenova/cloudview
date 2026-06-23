'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCcw } from 'lucide-react';

export function KitchenManualRefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        startTransition(() => {
          router.refresh();
        });
      }}
      className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-4 py-2 text-sm font-black text-black hover:bg-neutral-100 disabled:cursor-wait disabled:opacity-60 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white dark:hover:bg-neutral-800"
    >
      <RefreshCcw className={`size-4 ${pending ? 'animate-spin' : ''}`} />
      {pending ? 'Refreshing...' : 'Refresh'}
    </button>
  );
}