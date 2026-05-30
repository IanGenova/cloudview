import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Lock, Utensils } from 'lucide-react';
import { db } from '@/lib/db';
import { GuestBottomNav, GuestShell } from '@/components/guest/GuestShell';
import { requireNfcGuestAccess } from '@/lib/nfc-security';
import { MenuClient } from '@/components/guest/MenuClient';

export const dynamic = 'force-dynamic';

export default async function GuestMenuPage({
  params,
}: {
  params: Promise<{
    tagCode: string;
  }>;
}) {
  const { tagCode } = await params;

  const tag = await requireNfcGuestAccess(tagCode);

  if (!tag) {
    notFound();
  }

  const location = tag.room
    ? `Room ${tag.room.number}`
    : tag.location?.name ?? tag.label;

  if (tag.status !== 'ACTIVE') {
    return (
      <>
        <GuestShell
          hotel={tag.hotel}
          title="Order Food"
          subtitle={location}
          backHref={`/t/${tagCode}`}
          variant="dark"
        >
          <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6 text-center text-white">
            <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-gold/15 text-gold">
              <Lock className="size-8" />
            </div>

            <h2 className="mt-5 text-2xl font-black">Ordering is disabled</h2>

            <p className="mt-3 text-sm leading-6 text-white/55">
              This NFC panel is currently inactive. You can still view the guest
              portal, but food ordering is not available from this NFC tag.
            </p>

            <div className="mt-5 grid gap-3">
              <Link
                href={`/t/${tagCode}/guide`}
                className="rounded-2xl bg-gold px-5 py-3 text-sm font-black text-ink"
              >
                View Hotel Guide
              </Link>

              <Link
                href={`/t/${tagCode}/contact`}
                className="rounded-2xl border border-white/15 px-5 py-3 text-sm font-black text-white"
              >
                Contact Front Desk
              </Link>
            </div>
          </div>
        </GuestShell>

        <GuestBottomNav tagCode={tagCode} active="order" dark />
      </>
    );
  }

  const products = await db.menuProduct.findMany({
    where: {
      hotelId: tag.hotelId,
      isAvailable: true,
      category: {
        isActive: true,
      },
    },
    include: {
      category: {
        select: {
          name: true,
          sortOrder: true,
        },
      },
      images: {
        select: {
          url: true,
          sortOrder: true,
        },
        orderBy: {
          sortOrder: 'asc',
        },
        take: 1,
      },
    },
    orderBy: [
      {
        category: {
          sortOrder: 'asc',
        },
      },
      {
        name: 'asc',
      },
    ],
  });

  const menuProducts = products.map((product) => ({
    id: product.id,
    name: product.name,
    description: product.description,
    priceCents: product.priceCents,
    imageUrl: product.images[0]?.url ?? null,
    categoryName: product.category?.name ?? 'Uncategorized',
  }));

  return (
    <>
      <GuestShell
        hotel={tag.hotel}
        title="Order Food"
        subtitle={location}
        backHref={`/t/${tagCode}`}
        variant="dark"
      >
        <MenuClient
          tagCode={tagCode}
          products={menuProducts}
          currency={tag.hotel.settings?.currency ?? 'PHP'}
          taxRate={Number(tag.hotel.settings?.taxRate ?? 0)}
          serviceChargeRate={Number(tag.hotel.settings?.serviceChargeRate ?? 0)}
        />
      </GuestShell>

      <GuestBottomNav tagCode={tagCode} active="order" dark />
    </>
  );
}