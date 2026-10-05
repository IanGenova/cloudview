'use client';

import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function ModalOpenButton({
  modalId,
  children,
  className = ''
}: {
  modalId: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        const modal = document.getElementById(modalId) as HTMLDialogElement | null;
        modal?.showModal();
      }}
      className={cn(
        'inline-flex min-h-11 items-center justify-center px-4 py-2 text-sm font-semibold transition',
        className
      )}
    >
      {children}
    </button>
  );
}