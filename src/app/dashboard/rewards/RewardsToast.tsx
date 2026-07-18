'use client';

import { DashboardToastViewport } from '@/components/dashboard/DashboardToastViewport';

import { useEffect } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';

export type RewardsToastMessage = {
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  description?: string;
  action?: 'added' | 'edited' | 'deleted' | 'failed' | 'used' | 'refunded';
};

function getToastIcon(message: RewardsToastMessage) {
  if (message.type === 'error') return AlertTriangle;
  if (message.type === 'warning') return AlertTriangle;
  if (message.type === 'info') return Info;

  if (message.action === 'added') return Plus;
  if (message.action === 'edited') return Pencil;
  if (message.action === 'deleted') return Trash2;
  if (message.action === 'refunded') return RefreshCw;

  return CheckCircle2;
}

function getToastClass(type: RewardsToastMessage['type']) {
  if (type === 'success') {
    return {
      wrapper:
        'border-emerald-200 bg-emerald-50 text-emerald-900 shadow-[0_18px_60px_rgba(16,185,129,0.20)]',
      icon: 'bg-emerald-600 text-white',
    };
  }

  if (type === 'error') {
    return {
      wrapper:
        'border-red-200 bg-red-50 text-red-900 shadow-[0_18px_60px_rgba(220,38,38,0.20)]',
      icon: 'bg-red-600 text-white',
    };
  }

  if (type === 'warning') {
    return {
      wrapper:
        'border-amber-200 bg-amber-50 text-amber-900 shadow-[0_18px_60px_rgba(245,158,11,0.20)]',
      icon: 'bg-amber-500 text-white',
    };
  }

  return {
    wrapper:
      'border-blue-200 bg-blue-50 text-blue-900 shadow-[0_18px_60px_rgba(59,130,246,0.20)]',
    icon: 'bg-blue-600 text-white',
  };
}

export function RewardsToast({
  message,
  onClose,
}: {
  message: RewardsToastMessage | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!message) return;

    const timeout = window.setTimeout(() => {
      onClose();
    }, 4200);

    return () => window.clearTimeout(timeout);
  }, [message, onClose]);

  if (!message) {
    return null;
  }

  const Icon = getToastIcon(message);
  const classes = getToastClass(message.type);

  return (
    <DashboardToastViewport>
      <div
        className={`flex items-start gap-3 rounded-[1.5rem] border p-4 ${classes.wrapper}`}
      >
        <div
          className={`grid size-10 shrink-0 place-items-center rounded-full ${classes.icon}`}
        >
          <Icon className="size-5" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-black">{message.title}</p>

          {message.description ? (
            <p className="mt-1 text-sm font-bold leading-6 opacity-75">
              {message.description}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="grid size-8 shrink-0 place-items-center rounded-full bg-white/70 hover:bg-white"
          aria-label="Close toast"
        >
          <X className="size-4" />
        </button>
      </div>
    </DashboardToastViewport>
  );
}