import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Check,
  Clock3,
  CreditCard,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { PaymentMethod, PaymentStatus, OrderStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { GuestBottomNav, GuestShell } from '@/components/guest/GuestShell';
import { money } from '@/lib/money';
import { requireNfcGuestAccess } from '@/lib/nfc-security';
import { requireCurrentNfcGuestSession } from '@/lib/nfc-guest-session';

export const dynamic = 'force-dynamic';

function label(value: string) {
  return value.replaceAll('_', ' ');
}

export default async function OrderConfirmedPage({
  params,
}: {
  params: Promise<{ tagCode: string; orderCode: string }>;
}) {
  const { tagCode, orderCode } = await params;

  const tag = await requireNfcGuestAccess(tagCode);
  const guestSession = await requireCurrentNfcGuestSession(tagCode);

  if (tag.status !== 'ACTIVE') notFound();

  const order = await db.order.findFirst({
    where: {
      orderCode,
      hotelId: tag.hotelId,
      tagId: tag.id,
      guestSessionId: guestSession.id,
    },
    include: {
      items: true,
      guestXenditSessions: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          status: true,
          refundStatus: true,
          refundedAmountCents: true,
          refundErrorMessage: true,
        },
      },
    },
  });

  if (!order) notFound();

  const displayName = order.guestName?.trim() || 'Guest';
  const deliveryPlace = tag.room
    ? `Room ${tag.room.number}`
    : tag.location?.name || tag.label;
  const payment = order.guestXenditSessions[0];
  const isCancelled = order.status === OrderStatus.CANCELLED;
  const isRefunding =
    order.paymentStatus === PaymentStatus.REFUND_PENDING ||
    order.paymentStatus === PaymentStatus.REFUND_FAILED;
  const isRefunded = order.paymentStatus === PaymentStatus.REFUNDED;

  const title = isRefunded
    ? 'Payment Refunded'
    : isRefunding
      ? 'Refund Update'
      : isCancelled
        ? 'Order Cancelled'
        : 'Order Confirmed';

  return (
    <>
      <GuestShell
        hotel={tag.hotel}
        title={title}
        subtitle={deliveryPlace}
        variant="dark"
        showTopBar={false}
      >
        {/*
          This screen was a centred 36px "Thank You, <name>!" above a centred
          sentence of reassurance, with the one thing the guest would read out
          to a member of staff — the order code — set at 15px three blocks
          further down. The thanks is a line; the code is the heading.
        */}
        <div className="min-h-[calc(100vh-8rem)] bg-[#050505] py-10 text-white">
          <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top,rgba(214,167,56,0.12),transparent_45%)]" />

          <div className="relative z-10">
            <div
              className={`grid size-12 place-items-center border ${
 isCancelled || isRefunding
 ? 'border-amber-400/20 bg-amber-400/10 text-amber-300'
 : isRefunded
 ? 'border-blue-400/20 bg-blue-400/10 text-blue-300'
 : 'border-gold/20 bg-gold/5 text-gold'
 }`}
            >
              {isRefunding ? (
                <RotateCcw className="size-6" />
              ) : isRefunded ? (
                <CreditCard className="size-6" />
              ) : isCancelled ? (
                <XCircle className="size-6" />
              ) : (
                <Check className="size-6" strokeWidth={2} />
              )}
            </div>

            <p className="mt-5 text-sm font-medium text-white/70">
              {isCancelled || isRefunding || isRefunded
                ? title
                : `Thank you, ${displayName}. Your order is with the kitchen.`}
            </p>

            <h1 className="mt-2 font-serif text-4xl font-normal leading-tight tracking-wide text-white">
              {order.orderCode}
            </h1>

            <p className="mt-3 max-w-xs text-sm font-medium leading-6 text-white/60">
              {isRefunded
                ? 'Xendit confirmed the refund. The return timing depends on the original payment method.'
                : isRefunding
                  ? 'The order is cancelled and CloudView is processing the eligible Xendit refund.'
                  : isCancelled
                    ? 'This order was cancelled. Review the payment status below for any refund update.'
                    : 'Quote this code if you ask staff about the order.'}
            </p>

            <div className="mt-8 w-full border border-white/10 bg-white/[0.04] p-6 text-left backdrop-blur-xl">
              {!isCancelled && !isRefunding && !isRefunded ? (
                <div className="flex items-start gap-4">
                  <div className="grid size-12 shrink-0 place-items-center bg-gold/20 text-gold">
                    <Clock3 className="size-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-widest text-white/50">
                      Estimated Delivery
                    </p>
                    <p className="mt-1 font-serif text-2xl font-normal tracking-wide text-white">
                      20–30 mins
                    </p>
                  </div>
                </div>
              ) : null}

              <div className="mt-6 border border-white/10 bg-black/40 p-5">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="text-white/50">Order status</span>
                    <b className="text-white">{label(order.status)}</b>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-white/50">Payment</span>
                    <b className="text-white">{label(order.paymentStatus)}</b>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-white/50">Method</span>
                    <b className="text-white">{label(order.paymentMethod)}</b>
                  </div>
                  {payment?.status ? (
                    <div className="flex justify-between gap-3">
                      <span className="text-white/50">Xendit</span>
                      <b className="text-white">{label(payment.status)}</b>
                    </div>
                  ) : null}
                  {payment?.refundedAmountCents ? (
                    <div className="flex justify-between gap-3">
                      <span className="text-white/50">Refunded</span>
                      <b className="text-blue-300">
                        {money(payment.refundedAmountCents)}
                      </b>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between border-t border-white/10 pt-3">
                    <span className="font-medium text-white/60">Total</span>
                    <span className="font-serif text-lg font-medium tracking-wide text-gold">
                      {money(order.totalCents)}
                    </span>
                  </div>
                </div>
              </div>

              <Link
                href={`/t/${tagCode}/track/${order.orderCode}`}
                className="mt-6 block bg-gold px-5 py-4 text-center text-[15px] font-semibold tracking-wide text-black shadow-[0_12px_30px_rgba(214,167,56,0.25)] transition hover:brightness-110"
              >
                Track Order
              </Link>

              {order.paymentMethod === PaymentMethod.XENDIT &&
              payment?.refundErrorMessage ? (
                <p className="mt-4 border border-red-400/20 bg-red-500/10 p-3 text-xs font-semibold leading-5 text-red-200">
                  Refund review: {payment.refundErrorMessage}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </GuestShell>

      <GuestBottomNav tagCode={tagCode} active="order" dark />
    </>
  );
}
