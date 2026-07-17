'use client';

import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type ExistingXenditGuardStatus =
  | 'PENDING'
  | 'PAID'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'PAID_REVIEW_REQUIRED';

export function ExistingXenditSessionGuard({
  open,
  title,
  description,
  sessionReference,
  status,
  checkoutUrl,
  busy = false,
  dark = false,
  onContinue,
  onCancel,
  onRefresh,
}: {
  open: boolean;
  title: string;
  description: string;
  sessionReference: string;
  status: ExistingXenditGuardStatus;
  checkoutUrl?: string | null;
  busy?: boolean;
  dark?: boolean;
  onContinue: () => void;
  onCancel?: () => void;
  onRefresh: () => void;
}) {
  if (!open) return null;

  const paymentReceived =
    status === 'PAID' || status === 'PROCESSING' || status === 'COMPLETED';
  const needsReview = status === 'PAID_REVIEW_REQUIRED';
  const Icon = paymentReceived
    ? status === 'COMPLETED'
      ? CheckCircle2
      : LoaderCircle
    : needsReview
      ? AlertTriangle
      : ShieldCheck;

  return (
    <div className="fixed inset-0 z-[10000] flex items-start justify-center overflow-y-auto overscroll-contain bg-black/75 px-3 py-3 backdrop-blur-sm sm:items-center sm:px-4 sm:py-8">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="existing-xendit-title"
        className={cn(
          'max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-[1.5rem] border shadow-2xl sm:max-h-[calc(100dvh-4rem)] sm:rounded-[2rem]',
          dark
            ? 'border-white/12 bg-[#0b0b0b] text-white'
            : 'border-neutral-200 bg-white text-neutral-950'
        )}
      >
        <div
          className={cn(
            'border-b p-4 sm:p-6',
            dark
              ? 'border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(214,167,56,0.18),transparent_48%)]'
              : 'border-neutral-100 bg-[radial-gradient(circle_at_top_right,rgba(214,167,56,0.20),transparent_48%)]'
          )}
        >
          <div className="flex items-start gap-4">
            <span
              className={cn(
                'grid size-12 shrink-0 place-items-center rounded-2xl',
                paymentReceived
                  ? 'bg-emerald-500/15 text-emerald-500'
                  : needsReview
                    ? 'bg-red-500/15 text-red-500'
                    : 'bg-[#d6a738] text-black'
              )}
            >
              <Icon
                className={cn(
                  'size-6',
                  status === 'PAID' || status === 'PROCESSING'
                    ? 'animate-spin'
                    : ''
                )}
              />
            </span>

            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#b88938]">
                Existing Xendit session
              </p>
              <h2 id="existing-xendit-title" className="mt-1 text-xl font-black">
                {title}
              </h2>
              <p
                className={cn(
                  'mt-2 text-sm font-semibold leading-6',
                  dark ? 'text-white/55' : 'text-neutral-500'
                )}
              >
                {description}
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-6">
          <div
            className={cn(
              'rounded-2xl border p-4 text-sm',
              dark
                ? 'border-white/10 bg-white/[0.04]'
                : 'border-neutral-200 bg-neutral-50'
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <span className={dark ? 'text-white/45' : 'text-neutral-500'}>
                Status
              </span>
              <span
                className={cn(
                  'rounded-full px-3 py-1 text-[10px] font-black',
                  paymentReceived
                    ? 'bg-emerald-100 text-emerald-700'
                    : needsReview
                      ? 'bg-red-100 text-red-700'
                      : 'bg-amber-100 text-amber-800'
                )}
              >
                {status.replaceAll('_', ' ')}
              </span>
            </div>
            <p className={cn('mt-3 break-all text-xs font-bold', dark ? 'text-white/40' : 'text-neutral-400')}>
              Reference: {sessionReference}
            </p>
          </div>

          <div
            className={cn(
              'mt-4 rounded-2xl border p-4 text-xs font-bold leading-5',
              dark
                ? 'border-amber-400/20 bg-amber-400/10 text-amber-100'
                : 'border-amber-200 bg-amber-50 text-amber-800'
            )}
          >
            Do not create another payment. Continue this checkout, or cancel it
            first. Once Xendit receives payment, CloudView will finalize the
            transaction automatically even if this browser page was closed.
          </div>

          <div className="mt-5 grid gap-3">
            {status === 'PENDING' && checkoutUrl ? (
              <button
                type="button"
                onClick={onContinue}
                disabled={busy}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#d6a738] px-5 text-sm font-black text-black disabled:opacity-50"
              >
                Continue Existing Payment
                <ExternalLink className="size-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onContinue}
                disabled={busy}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 text-sm font-black text-white disabled:opacity-50"
              >
                View Payment Progress
                <CheckCircle2 className="size-4" />
              </button>
            )}

            <button
              type="button"
              onClick={onRefresh}
              disabled={busy}
              className={cn(
                'inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border px-5 text-sm font-black disabled:opacity-50',
                dark
                  ? 'border-white/12 bg-white/[0.05] text-white'
                  : 'border-neutral-200 bg-white text-neutral-800'
              )}
            >
              <RefreshCw className={cn('size-4', busy && 'animate-spin')} />
              Refresh Status
            </button>

            {status === 'PENDING' && onCancel ? (
              <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-red-400/25 bg-red-500/10 px-5 text-sm font-black text-red-500 disabled:opacity-50"
              >
                <Ban className="size-4" />
                Cancel Existing Checkout
              </button>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
