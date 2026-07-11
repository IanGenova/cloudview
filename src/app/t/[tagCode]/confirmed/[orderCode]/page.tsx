import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Check,
  Clock3,
  CreditCard,
  ReceiptText,
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
      guestPayMongoSessions: {
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
  const payment = order.guestPayMongoSessions[0];
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
        <div className="grid min-h-[calc(100vh-8rem)] content-center bg-[#050505] py-10 text-center text-white">
          <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top,rgba(214,167,56,0.12),transparent_45%)]" />

          <div className="relative z-10">
            <div
              className={`mx-auto grid size-24 place-items-center rounded-full border shadow-[0_0_40px_rgba(214,167,56,0.15)] ${
                isCancelled || isRefunding
                  ? 'border-amber-400/20 bg-amber-400/10 text-amber-300'
                  : isRefunded
                    ? 'border-blue-400/20 bg-blue-400/10 text-blue-300'
                    : 'border-gold/20 bg-gold/5 text-gold'
              }`}
            >
              {isRefunding ? (
                <RotateCcw className="size-9" />
              ) : isRefunded ? (
                <CreditCard className="size-9" />
              ) : isCancelled ? (
                <XCircle className="size-9" />
              ) : (
                <Check className="size-8" strokeWidth={2} />
              )}
            </div>

            <h1 className="mt-8 font-serif text-4xl font-light capitalize leading-tight tracking-wide text-white">
              {isCancelled || isRefunding || isRefunded
                ? title
                : `Thank You, ${displayName}!`}
            </h1>

            <p className="mx-auto mt-4 max-w-xs text-sm font-medium leading-6 text-white/60">
              {isRefunded
                ? 'PayMongo confirmed the refund. The return timing depends on the original payment method.'
                : isRefunding
                  ? 'The order is cancelled and CloudView is processing the eligible PayMongo refund.'
                  : isCancelled
                    ? 'This order was cancelled. Review the payment status below for any refund update.'
                    : 'Your order has been received. You can track it in real time from confirmation to delivery.'}
            </p>

            <div className="mx-auto mt-8 w-full max-w-xs rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 text-left shadow-[0_24px_60px_rgba(0,0,0,0.4)] backdrop-blur-xl">
              {!isCancelled && !isRefunding && !isRefunded ? (
                <div className="flex items-start gap-4">
                  <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gold/20 text-gold">
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

              <div className="mt-6 rounded-[1.25rem] border border-white/10 bg-black/40 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                <div className="flex items-center gap-2 font-serif text-[15px] font-medium tracking-wide text-white">
                  <ReceiptText className="size-4 text-gold" />
                  Order {order.orderCode}
                </div>

                <div className="mt-4 space-y-2 border-t border-white/10 pt-4 text-sm">
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
                      <span className="text-white/50">PayMongo</span>
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
                className="mt-6 block rounded-[1.25rem] bg-gold px-5 py-4 text-center text-[15px] font-semibold tracking-wide text-black shadow-[0_12px_30px_rgba(214,167,56,0.25)] transition hover:brightness-110 active:scale-[0.98]"
              >
                Track Order
              </Link>

              {order.paymentMethod === PaymentMethod.PAYMONGO &&
              payment?.refundErrorMessage ? (
                <p className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 p-3 text-xs font-semibold leading-5 text-red-200">
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
