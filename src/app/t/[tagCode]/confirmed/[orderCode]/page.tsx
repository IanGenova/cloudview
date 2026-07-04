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
        variant="dark" // Switched to dark mode
        showTopBar={false}
      >
        <div className="grid min-h-[calc(100vh-8rem)] content-center bg-[#050505] py-10 text-center text-white">
          
          <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top,_rgba(214,167,56,0.12),_transparent_45%)]" />

          <div className="relative z-10">
            {/* Luxurious gold/champagne success icon for dark mode */}
            <div className="mx-auto grid size-24 place-items-center rounded-full border border-gold/20 bg-gold/5 shadow-[0_0_40px_rgba(214,167,56,0.15)]">
              <div className="grid size-16 place-items-center rounded-full bg-gold/15 text-gold">
                <Check className="size-8" strokeWidth={2} />
              </div>
            </div>

            <h1 className="mt-8 font-serif text-4xl font-light capitalize leading-tight tracking-wide text-white drop-shadow-[0_4px_20px_rgba(0,0,0,0.8)]">
              Thank You, {displayName}!
            </h1>
            <p className="mx-auto mt-4 max-w-xs text-sm font-medium leading-6 text-white/60">
              Your order has been received. You can track it in real-time from confirmation to delivery.
            </p>

            {/* Dark mode luxury card container */}
            <div className="mx-auto mt-8 w-full max-w-xs rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 text-left shadow-[0_24px_60px_rgba(0,0,0,0.4)] backdrop-blur-xl">
              <div className="flex items-start gap-4">
                <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gold/20 text-gold">
                  <Clock3 className="size-5" />
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-widest text-white/50">
                    Estimated Delivery
                  </p>
                  <p className="mt-1 font-serif text-2xl font-normal tracking-wide text-white">
                    20 - 30 mins
                  </p>
                </div>
              </div>

              {/* Order summary pill */}
              <div className="mt-6 rounded-[1.25rem] border border-white/10 bg-black/40 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                <div className="flex items-center gap-2 font-serif text-[15px] font-medium tracking-wide text-white">
                  <ReceiptText className="size-4 text-gold" />
                  Order {order.orderCode}
                </div>
                <p className="mt-1.5 text-xs font-medium text-white/50">
                  You can track this order anytime.
                </p>
                
                <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4 text-sm">
                  <span className="font-medium text-white/60">Total</span>
                  <span className="font-serif text-lg font-medium tracking-wide text-gold">
                    {money(order.totalCents)}
                  </span>
                </div>
              </div>

              {/* Premium button */}
              <Link
                href={`/t/${tagCode}/track/${order.orderCode}`}
                className="mt-6 block rounded-[1.25rem] bg-gold px-5 py-4 text-center text-[15px] font-semibold tracking-wide text-black shadow-[0_12px_30px_rgba(214,167,56,0.25)] transition hover:brightness-110 active:scale-[0.98]"
              >
                Track Order
              </Link>
            </div>
          </div>
        </div>
      </GuestShell>
      <GuestBottomNav tagCode={tagCode} active="order" dark />
    </>
  );
}