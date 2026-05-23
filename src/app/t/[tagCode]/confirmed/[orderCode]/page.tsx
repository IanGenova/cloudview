import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Check, Clock3, ReceiptText } from 'lucide-react';
import { db } from '@/lib/db';
import { GuestBottomNav, GuestShell } from '@/components/guest/GuestShell';
import { money } from '@/lib/money';
import { requireNfcGuestAccess } from '@/lib/nfc-security';

export const dynamic = 'force-dynamic';

export default async function OrderConfirmedPage({ params }: { params: Promise<{ tagCode: string; orderCode: string }> }) {
  const { tagCode, orderCode } = await params;

 const tag = await requireNfcGuestAccess(tagCode);
  if (!tag || tag.status !== 'ACTIVE') notFound();

  const order = await db.order.findUnique({
    where: { orderCode },
    include: { items: true }
  });
  if (!order || order.hotelId !== tag.hotelId) notFound();

  const displayName = order.guestName?.trim() || 'Guest';
  const deliveryPlace = tag.room ? `Room ${tag.room.number}` : tag.location?.name || tag.label;

  return (
    <>
      <GuestShell
        hotel={tag.hotel}
        title="Order Confirmed"
        subtitle={deliveryPlace}
        variant="light"
        showTopBar={false}
      >
        <div className="grid min-h-[calc(100vh-8rem)] content-center py-10 text-center">
          <div className="mx-auto grid size-24 place-items-center rounded-full border-2 border-green-600/20 bg-green-50">
            <div className="grid size-16 place-items-center rounded-full bg-green-100 text-green-700">
              <Check className="size-9" strokeWidth={3} />
            </div>
          </div>

          <h1 className="mt-8 text-2xl font-black leading-tight text-ink">Thank You, {displayName}!</h1>
          <p className="mx-auto mt-3 max-w-xs text-sm leading-6 text-neutral-500">
            Your order has been received. You can track it in real-time from confirmation to delivery.
          </p>

          <div className="mx-auto mt-8 w-full max-w-xs rounded-[2rem] bg-white p-5 text-left shadow-soft">
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-2xl bg-sand/40 text-ink">
                <Clock3 className="size-5" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-400">Estimated delivery time</p>
                <p className="text-xl font-black text-ink">20 - 30 mins</p>
              </div>
            </div>

            <div className="mt-5 rounded-2xl bg-neutral-50 p-4">
              <div className="flex items-center gap-2 text-sm font-black text-ink">
                <ReceiptText className="size-4" />
                Order {order.orderCode}
              </div>
              <p className="mt-1 text-xs text-neutral-500">You can track this order anytime.</p>
              <p className="mt-3 flex justify-between text-sm">
                <span className="text-neutral-500">Total</span>
                <b>{money(order.totalCents)}</b>
              </p>
            </div>

            <Link
              href={`/t/${tagCode}/track/${order.orderCode}`}
              className="mt-6 block rounded-2xl bg-sand px-5 py-4 text-center font-black text-ink shadow-soft transition hover:bg-gold"
            >
              Track Order
            </Link>
          </div>
        </div>
      </GuestShell>
      <GuestBottomNav tagCode={tagCode} active="order" />
    </>
  );
}
