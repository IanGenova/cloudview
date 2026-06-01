import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Lock } from 'lucide-react';
import { MenuProductType } from '@prisma/client';
import { db } from '@/lib/db';
import { GuestBottomNav, GuestShell } from '@/components/guest/GuestShell';
import { requireNfcGuestAccess } from '@/lib/nfc-security';
import { MenuClient } from '@/components/guest/MenuClient';

export const dynamic = 'force-dynamic';

function safeRequiredQuantity(value: number) {
  if (!Number.isInteger(value) || value <= 0) {
    return 1;
  }

  return value;
}

function getSingleProductStock(product: {
  availabilityStocks: {
    availableQty: number;
    soldQty: number;
    isSoldOut: boolean;
  }[];
}) {
  const stock = product.availabilityStocks[0];

  return {
    availableQty: stock?.availableQty ?? 0,
    soldQty: stock?.soldQty ?? 0,
    isSoldOut: !stock || stock.isSoldOut || stock.availableQty <= 0,
  };
}

function getBundleDerivedStock(product: {
  bundleComponents: {
    id: string;
    quantity: number;
    componentProduct: {
      id: string;
      name: string;
      priceCents: number;
      isAvailable: boolean;
      productType: MenuProductType;
      availabilityStocks: {
        availableQty: number;
        soldQty: number;
        isSoldOut: boolean;
      }[];
    };
  }[];
}) {
  const bundleComponents = product.bundleComponents.map((component) => {
    const requiredQty = safeRequiredQuantity(component.quantity);
    const stock = component.componentProduct.availabilityStocks[0];

    const availableQty = stock?.availableQty ?? 0;
    const soldQty = stock?.soldQty ?? 0;

    const canSellQty =
      component.componentProduct.isAvailable &&
      component.componentProduct.productType === MenuProductType.SINGLE &&
      stock &&
      !stock.isSoldOut &&
      availableQty >= requiredQty
        ? Math.floor(availableQty / requiredQty)
        : 0;

    return {
      id: component.id,
      productId: component.componentProduct.id,
      name: component.componentProduct.name,
      quantity: requiredQty,
      availableQty,
      soldQty,
      canSellQty,
      isSoldOut:
        !component.componentProduct.isAvailable ||
        component.componentProduct.productType !== MenuProductType.SINGLE ||
        !stock ||
        stock.isSoldOut ||
        availableQty < requiredQty,
    };
  });

  const availableQty =
    bundleComponents.length > 0
      ? Math.min(...bundleComponents.map((component) => component.canSellQty))
      : 0;

  const limitingComponent =
    bundleComponents.length > 0
      ? bundleComponents.reduce((lowest, component) =>
          component.canSellQty < lowest.canSellQty ? component : lowest
        )
      : null;

  return {
    availableQty,
    soldQty: 0,
    isSoldOut: availableQty <= 0,
    limitingComponentName: limitingComponent?.name ?? null,
    bundleComponents,
  };
}

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
      availabilityStocks: {
        where: {
          hotelId: tag.hotelId,
        },
        select: {
          availableQty: true,
          soldQty: true,
          isSoldOut: true,
        },
        take: 1,
      },
      bundleComponents: {
        include: {
          componentProduct: {
            select: {
              id: true,
              name: true,
              priceCents: true,
              isAvailable: true,
              productType: true,
              availabilityStocks: {
                where: {
                  hotelId: tag.hotelId,
                },
                select: {
                  availableQty: true,
                  soldQty: true,
                  isSoldOut: true,
                },
                take: 1,
              },
            },
          },
        },
        orderBy: {
          sortOrder: 'asc',
        },
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

  const menuProducts = products.map((product) => {
    const isBundle = product.productType === MenuProductType.BUNDLE;

    const singleStock = getSingleProductStock(product);

    const bundleStock = isBundle
      ? getBundleDerivedStock(product)
      : {
          availableQty: singleStock.availableQty,
          soldQty: singleStock.soldQty,
          isSoldOut: singleStock.isSoldOut,
          limitingComponentName: null,
          bundleComponents: [],
        };

    const normalBundlePriceCents = isBundle
      ? product.bundleComponents.reduce(
          (sum, component) =>
            sum +
            safeRequiredQuantity(component.quantity) *
              component.componentProduct.priceCents,
          0
        )
      : 0;

    const bundleSavingsCents =
      isBundle && normalBundlePriceCents > product.priceCents
        ? normalBundlePriceCents - product.priceCents
        : 0;

    const availableQty = isBundle
      ? bundleStock.availableQty
      : singleStock.availableQty;

    const soldQty = isBundle ? bundleStock.soldQty : singleStock.soldQty;

    const isSoldOut = isBundle
      ? bundleStock.isSoldOut
      : singleStock.isSoldOut;

    return {
      id: product.id,
      name: product.name,
      description: product.description,
      priceCents: product.priceCents,
      imageUrl: product.images[0]?.url ?? null,
      categoryName: product.category?.name ?? 'Uncategorized',

      productType: product.productType,
      isBundle,
      availableQty,
      soldQty,
      isSoldOut,
      limitingComponentName: bundleStock.limitingComponentName,
      normalBundlePriceCents,
      bundleSavingsCents,
      bundleComponents: bundleStock.bundleComponents,
    };
  });

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