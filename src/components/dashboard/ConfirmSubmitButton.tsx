'use client';

import { cn } from '@/lib/utils';

export function ConfirmSubmitButton({
  label = 'Delete',
  message = 'Are you sure you want to delete this?',
  className = ''
}: {
  label?: string;
  message?: string;
  className?: string;
}) {
  return (
    <button
      type="submit"
      onClick={(event) => {
        const confirmed = window.confirm(message);

        if (!confirmed) {
          event.preventDefault();
        }
      }}
      className={cn(
        'inline-flex min-h-11 w-full items-center justify-center rounded-2xl px-4 py-2 text-sm font-black transition active:scale-[0.98]',
        className
      )}
    >
      {label}
    </button>
  );
}