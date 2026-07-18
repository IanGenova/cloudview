'use client';

import { type ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const TOAST_ROOT_ID = 'cloudview-dashboard-toast-root';

function getOrCreateToastRoot() {
  const existing = document.getElementById(TOAST_ROOT_ID);

  if (existing) {
    return existing;
  }

  const root = document.createElement('div');
  root.id = TOAST_ROOT_ID;
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', 'Activity notifications');
  root.setAttribute('aria-live', 'polite');
  root.className = [
    'pointer-events-none fixed inset-x-3',
    'top-[calc(env(safe-area-inset-top)+8.5rem)]',
    'z-[9999] mx-auto flex max-h-[calc(100dvh-env(safe-area-inset-top)-9.25rem)]',
    'w-auto max-w-md flex-col gap-3 overflow-y-auto overscroll-contain',
    'pb-[max(0.75rem,env(safe-area-inset-bottom))] pr-1 [overflow-wrap:anywhere]',
    'sm:inset-x-auto sm:right-5 sm:w-[calc(100vw-2.5rem)]',
    'lg:right-6 lg:top-[5.25rem] lg:max-h-[calc(100dvh-6rem)]',
  ].join(' ');

  document.body.appendChild(root);
  return root;
}

export function DashboardToastViewport({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = getOrCreateToastRoot();
    const nextSlot = document.createElement('div');

    nextSlot.className = 'pointer-events-auto min-w-0 w-full shrink-0';
    root.prepend(nextSlot);
    setSlot(nextSlot);

    return () => {
      nextSlot.remove();

      if (!root.childElementCount) {
        root.remove();
      }
    };
  }, []);

  if (!slot) {
    return null;
  }

  return createPortal(children, slot);
}
