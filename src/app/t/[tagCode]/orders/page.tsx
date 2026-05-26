import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  PackageCheck,
  ReceiptText,
  ShoppingBag,
} from 'lucide-react';
import { OrderStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { GuestBottomNav } from '@/components/guest/GuestShell';
import { requireNfcGuestAccess } from '@/lib/nfc-security';

export const dynamic = 'force-dynamic';

const pesoFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
});

function money(cents: number) {
  return pesoFormatter.format(cents / 100);
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function statusBadgeClass(status: OrderStatus) {
  switch (status) {
    case OrderStatus.DELIVERED:
      return 'bg-emerald-100 text-emerald-700';
    case OrderStatus.CANCELLED:
      return 'bg-red-100 text-red-700';
    case OrderStatus.PREPARING:
    case OrderStatus.READY:
      return 'bg-gold/20 text-gold';
    case OrderStatus.ACCEPTED:
      return 'bg-blue-100 text-blue-700';
    default:
      return 'bg-white/10 text-white/70';
  }
}

function statusLabel(status: OrderStatus) {
  return status.replaceAll('_', ' ');
}

export default async function MyOrdersPage({
  params,
}: {
  params: Promise<{
    tagCode: string;
  }>;
}) {
  const { tagCode } = await params;

  const tag = await requireNfcGuestAccess(tagCode);

  if (!tag || tag.status !== 'ACTIVE') {
    notFound();
  }

  const location = tag.room
    ? `Room ${tag.room.number}`
    : tag.location?.name ?? tag.label;

  const orders = await db.order.findMany({
    where: {
      tagId: tag.id,
      hotelId: tag.hotelId,
    },
    include: {
      items: {
        orderBy: {
          createdAt: 'asc',
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 50,
  });

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto min-h-screen max-w-md bg-black px-5 pb-32 pt-5">
        <div className="mb-7 grid grid-cols-[44px_1fr_44px] items-center">
          <Link
            href={`/t/${tagCode}/contact`}
            className="grid size-11 place-items-center rounded-full text-white hover:bg-white/10"
            aria-label="Back"
          >
            <ChevronLeft className="size-6" />
          </Link>

          <div className="text-center">
            <h1 className="text-xl font-black">My Orders</h1>
            <p className="text-sm text-white/45">{location}</p>
          </div>

          <div />
        </div>

        <section className="mb-5 rounded-[2rem] border border-gold/20 bg-gold/10 p-5">
          <div className="flex items-center gap-3">
            <div className="grid size-12 place-items-center rounded-2xl bg-gold/15 text-gold">
              <ShoppingBag className="size-6" />
            </div>

            <div>
              <p className="text-sm font-bold text-white/50">Order History</p>
              <h2 className="text-2xl font-black text-white">
                {orders.length} order{orders.length === 1 ? '' : 's'}
              </h2>
            </div>
          </div>
        </section>

        <div className="space-y-3">
          {orders.map((order) => {
            const itemCount = order.items.reduce(
              (sum, item) => sum + item.quantity,
              0
            );

            const firstItems = order.items
              .slice(0, 2)
              .map((item) => `${item.quantity}× ${item.productNameSnapshot}`)
              .join(', ');

            return (
              <Link
                key={order.id}
                href={`/t/${tagCode}/track/${order.orderCode}`}
                className="block rounded-[2rem] border border-white/10 bg-white/5 p-5 hover:bg-white/10"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-black text-white">
                        {order.orderCode}
                      </h3>

                      <span
                        className={`rounded-full px-3 py-1 text-[10px] font-black ${statusBadgeClass(
                          order.status
                        )}`}
                      >
                        {statusLabel(order.status)}
                      </span>
                    </div>

                    <p className="mt-1 text-xs text-white/40">
                      {formatDateTime(order.createdAt)}
                    </p>
                  </div>

                  <ChevronRight className="mt-1 size-5 shrink-0 text-white/35" />
                </div>

                <div className="mt-4 space-y-3">
                  <div className="flex items-start gap-3 rounded-2xl bg-white/5 p-3">
                    <ReceiptText className="mt-0.5 size-4 shrink-0 text-gold" />
                    <div>
                      <p className="text-sm font-bold text-white">
                        {itemCount} item{itemCount === 1 ? '' : 's'}
                      </p>
                      <p className="mt-1 text-xs text-white/45">
                        {firstItems || 'No items'}
                        {order.items.length > 2 ? '…' : ''}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-white/5 p-3">
                      <p className="flex items-center gap-2 text-xs font-bold text-white/45">
                        <CreditCard className="size-4 text-gold" />
                        Payment
                      </p>
                      <p className="mt-1 text-sm font-black">
                        {order.paymentStatus}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-white/5 p-3">
                      <p className="flex items-center gap-2 text-xs font-bold text-white/45">
                        <PackageCheck className="size-4 text-gold" />
                        Total
                      </p>
                      <p className="mt-1 text-sm font-black">
                        {money(order.totalCents)}
                      </p>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}

          {!orders.length ? (
            <div className="rounded-[2rem] border border-white/10 bg-white/5 p-8 text-center">
              <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-white/5 text-gold">
                <Clock className="size-7" />
              </div>

              <h2 className="mt-4 font-black">No orders yet</h2>
              <p className="mt-2 text-sm leading-6 text-white/45">
                Your food and drink orders will appear here after you place an
                order.
              </p>

              <Link
                href={`/t/${tagCode}/menu`}
                className="mt-5 inline-block rounded-2xl bg-gold px-5 py-3 text-sm font-black text-ink"
              >
                Order Food
              </Link>
            </div>
          ) : null}
        </div>
      </div>

      <GuestBottomNav tagCode={tagCode} active="profile" dark />
    </main>
  );
}