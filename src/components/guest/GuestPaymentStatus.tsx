'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock3,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  TimerOff,
  Undo2,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import {
  cancelGuestPaymentAction,
  finalizeGuestPaymentAction,
  getGuestPaymentStatusAction,
  type GuestPaymentFlow,
  type GuestPaymentStatusValue,
} from '@/app/t/[tagCode]/payment/actions';

const POLL_INTERVAL_MS = 1_500;
const MAX_AUTOMATIC_POLLS = 60;

type ReturnResult = 'success' | 'cancelled' | null;

type GuestPaymentStatusProps = {
  tagCode: string;
  paymentSessionId: string;
  flow: GuestPaymentFlow;
  returnResult: ReturnResult;
  initialStatus: GuestPaymentStatusValue;
  initialReferenceCode?: string | null;
  initialCheckoutUrl?: string | null;
  initialErrorMessage?: string | null;
  initialRefundStatus?: string | null;
  initialRefundedAmountCents?: number;
  amountCents: number;
  currency: string;
  expiresAt?: string | null;
};

type StatusPresentation = {
  title: string;
  description: string;
  icon: LucideIcon;
  tone: 'gold' | 'green' | 'blue' | 'red' | 'neutral';
  spinning?: boolean;
};

function money(cents: number, currency: string) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

function label(value: string) {
  return value.replaceAll('_', ' ');
}

function getPresentation(
  status: GuestPaymentStatusValue,
  flow: GuestPaymentFlow
): StatusPresentation {
  const itemName = flow === 'FOOD_ORDER' ? 'order' : 'service request';

  switch (status) {
    case 'PENDING':
      return {
        title: 'Waiting for payment confirmation',
        description:
          'Xendit has not confirmed the payment yet. Keep this page open while we check securely.',
        icon: Clock3,
        tone: 'gold',
      };
    case 'PAID':
      return {
        title: 'Payment received',
        description: `Your payment was verified. CloudView is now creating your ${itemName}.`,
        icon: CheckCircle2,
        tone: 'green',
      };
    case 'PROCESSING':
      return {
        title:
          flow === 'FOOD_ORDER'
            ? 'Creating your order'
            : 'Submitting your service request',
        description:
          'The payment is confirmed and the final inventory and request records are being completed.',
        icon: LoaderCircle,
        tone: 'blue',
        spinning: true,
      };
    case 'COMPLETED':
      return {
        title:
          flow === 'FOOD_ORDER'
            ? 'Order confirmed'
            : 'Service request submitted',
        description:
          'Everything is complete. You can now view the confirmation and track the request.',
        icon: CheckCircle2,
        tone: 'green',
      };
    case 'FAILED':
      return {
        title: 'Payment was not completed',
        description:
          'No confirmed payment was recorded and no paid request was created. You may return and try again.',
        icon: XCircle,
        tone: 'red',
      };
    case 'EXPIRED':
      return {
        title: 'QR payment expired',
        description:
          'The checkout expired before Xendit confirmed payment. Create a new checkout to continue.',
        icon: TimerOff,
        tone: 'red',
      };
    case 'CANCELLED':
      return {
        title: 'Payment was cancelled',
        description:
          'The checkout was cancelled. No paid request was created and no inventory was deducted.',
        icon: Ban,
        tone: 'neutral',
      };
    case 'PAID_REVIEW_REQUIRED':
      return {
        title: 'Payment received — staff review required',
        description:
          'CloudView received the payment, but the final request could not be completed automatically. Staff review or an automatic refund is required.',
        icon: ShieldAlert,
        tone: 'red',
      };
    case 'REFUND_PENDING':
      return {
        title: 'Refund is being processed',
        description:
          'CloudView requested a refund through Xendit. The money will return through the original payment method after processing.',
        icon: RotateCcw,
        tone: 'gold',
        spinning: true,
      };
    case 'REFUNDED':
      return {
        title: 'Payment refunded',
        description:
          'Xendit confirmed the refund. The return timing depends on the original bank or payment method.',
        icon: Undo2,
        tone: 'blue',
      };
    case 'REFUND_FAILED':
      return {
        title: 'Refund needs staff attention',
        description:
          'The request remains cancelled, but the automatic refund could not be completed. Hotel staff must review and retry it.',
        icon: AlertTriangle,
        tone: 'red',
      };
  }
}

function toneClasses(tone: StatusPresentation['tone']) {
  if (tone === 'green') {
    return {
      ring: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300',
      pill: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
    };
  }

  if (tone === 'blue') {
    return {
      ring: 'border-blue-400/25 bg-blue-400/10 text-blue-300',
      pill: 'border-blue-400/20 bg-blue-400/10 text-blue-200',
    };
  }

  if (tone === 'red') {
    return {
      ring: 'border-red-400/25 bg-red-400/10 text-red-300',
      pill: 'border-red-400/20 bg-red-400/10 text-red-200',
    };
  }

  if (tone === 'neutral') {
    return {
      ring: 'border-white/15 bg-white/[0.06] text-white/60',
      pill: 'border-white/10 bg-white/[0.05] text-white/60',
    };
  }

  return {
    ring: 'border-gold/25 bg-gold/10 text-gold',
    pill: 'border-gold/20 bg-gold/10 text-gold',
  };
}

function isTerminal(status: GuestPaymentStatusValue) {
  return (
    status === 'COMPLETED' ||
    status === 'FAILED' ||
    status === 'EXPIRED' ||
    status === 'CANCELLED' ||
    status === 'PAID_REVIEW_REQUIRED' ||
    status === 'REFUNDED' ||
    status === 'REFUND_FAILED'
  );
}

export function GuestPaymentStatus({
  tagCode,
  paymentSessionId,
  flow,
  returnResult,
  initialStatus,
  initialReferenceCode = null,
  initialCheckoutUrl = null,
  initialErrorMessage = null,
  initialRefundStatus = null,
  initialRefundedAmountCents = 0,
  amountCents,
  currency,
  expiresAt = null,
}: GuestPaymentStatusProps) {
  const router = useRouter();
  const mountedRef = useRef(true);
  const finalizationInFlightRef = useRef(false);
  const [status, setStatus] =
    useState<GuestPaymentStatusValue>(initialStatus);
  const [referenceCode, setReferenceCode] = useState<string | null>(
    initialReferenceCode
  );
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(
    initialCheckoutUrl
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(
    initialErrorMessage
  );
  const [refundStatus, setRefundStatus] = useState<string | null>(
    initialRefundStatus
  );
  const [refundedAmountCents, setRefundedAmountCents] = useState(
    initialRefundedAmountCents
  );
  const [automaticPollingStopped, setAutomaticPollingStopped] =
    useState(false);
  const [isRefreshing, startRefreshTransition] = useTransition();

  const returnHref =
    flow === 'FOOD_ORDER'
      ? `/t/${tagCode}/menu`
      : `/t/${tagCode}/service`;

  const activityHref =
    flow === 'FOOD_ORDER'
      ? `/t/${tagCode}/orders`
      : `/t/${tagCode}/requests`;

  function buildCompletionHref(code: string | null = referenceCode) {
    if (flow === 'FOOD_ORDER') {
      return code
        ? `/t/${tagCode}/confirmed/${encodeURIComponent(code)}`
        : `/t/${tagCode}/orders`;
    }

    return code
      ? `/t/${tagCode}/service/thanks?code=${encodeURIComponent(code)}`
      : `/t/${tagCode}/requests`;
  }

  const completionHref = buildCompletionHref();
  const presentation = getPresentation(status, flow);
  const classes = toneClasses(presentation.tone);
  const Icon = presentation.icon;

  function applyStatusResult(result: {
    status?: GuestPaymentStatusValue;
    referenceCode?: string | null;
    checkoutUrl?: string | null;
    errorMessage?: string | null;
    refundStatus?: string | null;
    refundedAmountCents?: number;
  }) {
    if (result.status) setStatus(result.status);
    if (result.referenceCode) setReferenceCode(result.referenceCode);
    if (result.checkoutUrl) setCheckoutUrl(result.checkoutUrl);
    setErrorMessage(result.errorMessage || null);
    setRefundStatus(result.refundStatus || null);
    setRefundedAmountCents(result.refundedAmountCents ?? 0);
  }

  async function finalizePaidPayment() {
    if (finalizationInFlightRef.current) {
      return false;
    }

    finalizationInFlightRef.current = true;

    try {
      const result = await finalizeGuestPaymentAction({
        tagCode,
        paymentSessionId,
        flow,
      });

      if (!mountedRef.current) return false;

      if (result.ok && result.referenceCode) {
        setReferenceCode(result.referenceCode);
      }

      if (!result.ok && !result.waiting) {
        setErrorMessage(
          result.error ||
            'Payment was received, but the request could not be finalized.'
        );
      }

      return result.ok;
    } finally {
      finalizationInFlightRef.current = false;
    }
  }

  async function readStatus(verifyRemote = false) {
    const result = await getGuestPaymentStatusAction({
      tagCode,
      paymentSessionId,
      flow,
      verifyRemote,
    });

    if (!mountedRef.current) return null;

    if (!result.ok) {
      setErrorMessage(result.error || 'Unable to read the payment status.');
      return null;
    }

    applyStatusResult(result);
    return result;
  }

  useEffect(() => {
    mountedRef.current = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    async function handleCancelledReturn() {
      const result = await cancelGuestPaymentAction({
        tagCode,
        paymentSessionId,
        flow,
      });

      if (stopped || !mountedRef.current) return;

      if (result.ok) {
        setStatus('CANCELLED');
        setErrorMessage(null);
        return;
      }

      setErrorMessage(
        result.error ||
          'The checkout could not be cancelled because its state already changed.'
      );

      await poll(0);
    }

    async function poll(attempt: number) {
      if (stopped) return;

      const shouldVerifyRemote =
        returnResult === 'success' && attempt % 3 === 0;

      let result = await readStatus(shouldVerifyRemote);
      if (!result?.status || stopped) return;

      if (result.status === 'PAID') {
        const finalized = await finalizePaidPayment();

        if (stopped) return;

        if (finalized) {
          const refreshed = await readStatus(true);
          if (refreshed) result = refreshed;
        }
      }

      if (result.status === 'COMPLETED') {
        window.setTimeout(() => {
          if (mountedRef.current) {
            router.replace(
              buildCompletionHref(result.referenceCode || referenceCode)
            );
          }
        }, 900);
        return;
      }

      const currentStatus = result.status;
      if (!currentStatus || isTerminal(currentStatus)) {
        return;
      }

      if (attempt >= MAX_AUTOMATIC_POLLS) {
        setAutomaticPollingStopped(true);
        return;
      }

      timer = setTimeout(() => {
        void poll(attempt + 1);
      }, POLL_INTERVAL_MS);
    }

    if (returnResult === 'cancelled') {
      void handleCancelledReturn();
    } else if (initialStatus === 'COMPLETED') {
      timer = setTimeout(
        () => router.replace(buildCompletionHref(initialReferenceCode)),
        900
      );
    } else {
      void poll(0);
    }

    return () => {
      stopped = true;
      mountedRef.current = false;
      if (timer) clearTimeout(timer);
    };
    // The page owns one immutable payment session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow, paymentSessionId, returnResult, tagCode]);

  function refreshStatus() {
    setAutomaticPollingStopped(false);

    startRefreshTransition(async () => {
      let result = await readStatus(true);

      if (result?.status === 'PAID') {
        await finalizePaidPayment();
        result = (await readStatus(true)) ?? result;
      }

      if (result?.status === 'COMPLETED') {
        router.replace(
          buildCompletionHref(result.referenceCode || referenceCode)
        );
      }
    });
  }

  function cancelPendingCheckout() {
    startRefreshTransition(async () => {
      const result = await cancelGuestPaymentAction({
        tagCode,
        paymentSessionId,
        flow,
      });

      if (result.ok) {
        setStatus('CANCELLED');
        setErrorMessage(null);
        return;
      }

      setErrorMessage(result.error || 'Unable to cancel this checkout.');
      await readStatus(true);
    });
  }

  return (
    <div className="relative mx-auto w-full max-w-md py-8 text-center">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top,rgba(214,167,56,0.13),transparent_44%)]" />

      <div className="relative z-10">
        <div
          className={`mx-auto grid size-24 place-items-center rounded-full border shadow-[0_0_48px_rgba(0,0,0,0.22)] ${classes.ring}`}
        >
          <Icon
            className={`size-10 ${presentation.spinning ? 'animate-spin' : ''}`}
            strokeWidth={1.8}
          />
        </div>

        <span
          className={`mt-6 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.17em] ${classes.pill}`}
        >
          <ShieldCheck className="size-3.5" />
          Xendit secure status
        </span>

        <h1 className="mt-5 font-serif text-3xl font-normal tracking-wide text-white">
          {presentation.title}
        </h1>

        <p className="mx-auto mt-3 max-w-sm text-sm font-medium leading-6 text-white/55">
          {presentation.description}
        </p>

        <section className="mt-7 rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 text-left shadow-[0_24px_70px_rgba(0,0,0,0.28)] backdrop-blur-xl">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-black/25 p-4">
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-white/35">
                Amount
              </p>
              <p className="mt-1 font-serif text-xl text-gold">
                {money(amountCents, currency)}
              </p>
            </div>

            <div className="rounded-2xl bg-black/25 p-4">
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-white/35">
                Status
              </p>
              <p className="mt-1 text-sm font-black text-white">
                {label(status)}
              </p>
            </div>
          </div>

          <div className="mt-3 rounded-2xl border border-white/8 bg-black/20 p-4 text-xs font-medium leading-5 text-white/50">
            <p>
              <b className="text-white/75">Reference:</b>{' '}
              {referenceCode || paymentSessionId}
            </p>
            <p className="mt-1">
              <b className="text-white/75">Type:</b>{' '}
              {flow === 'FOOD_ORDER' ? 'Food order' : 'Service request'}
            </p>
            {expiresAt && status === 'PENDING' ? (
              <p className="mt-1">
                <b className="text-white/75">Checkout expires:</b>{' '}
                {new Intl.DateTimeFormat('en-PH', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(expiresAt))}
              </p>
            ) : null}
            {refundStatus ? (
              <p className="mt-1">
                <b className="text-white/75">Refund:</b> {label(refundStatus)}
              </p>
            ) : null}
            {refundedAmountCents > 0 ? (
              <p className="mt-1">
                <b className="text-white/75">Refunded amount:</b>{' '}
                {money(refundedAmountCents, currency)}
              </p>
            ) : null}
          </div>

          {errorMessage ? (
            <div className="mt-3 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm font-semibold leading-6 text-red-200">
              {errorMessage}
            </div>
          ) : null}

          {automaticPollingStopped && !isTerminal(status) ? (
            <div className="mt-3 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm font-semibold leading-6 text-amber-100">
              Payment confirmation is taking longer than expected. This does not
              mean the payment failed. Refresh the status or contact the front
              desk with this reference.
            </div>
          ) : null}

          <div className="mt-5 grid gap-3">
            {status === 'COMPLETED' ? (
              <Link
                href={completionHref}
                className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-gold px-5 text-sm font-black text-black"
              >
                View Confirmation
              </Link>
            ) : null}

            {status === 'PENDING' && checkoutUrl ? (
              <a
                href={checkoutUrl}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-gold px-5 text-sm font-black text-black"
              >
                Continue Xendit Payment
                <ExternalLink className="size-4" />
              </a>
            ) : null}

            {!isTerminal(status) ? (
              <button
                type="button"
                onClick={refreshStatus}
                disabled={isRefreshing}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/[0.05] px-5 text-sm font-black text-white disabled:opacity-50"
              >
                <RefreshCw
                  className={`size-4 ${isRefreshing ? 'animate-spin' : ''}`}
                />
                Refresh Payment Status
              </button>
            ) : null}

            {status === 'PENDING' ? (
              <button
                type="button"
                onClick={cancelPendingCheckout}
                disabled={isRefreshing}
                className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-red-400/20 bg-red-500/10 px-5 text-sm font-black text-red-200 disabled:opacity-50"
              >
                Cancel Checkout
              </button>
            ) : null}

            {isTerminal(status) && status !== 'COMPLETED' ? (
              <Link
                href={returnHref}
                className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-gold px-5 text-sm font-black text-black"
              >
                {status === 'CANCELLED' || status === 'FAILED' || status === 'EXPIRED'
                  ? 'Return and Try Again'
                  : 'Return to Guest Portal'}
              </Link>
            ) : null}

            <Link
              href={activityHref}
              className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/12 bg-white/[0.04] px-5 text-sm font-black text-white"
            >
              {flow === 'FOOD_ORDER' ? 'View My Orders' : 'View My Requests'}
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}