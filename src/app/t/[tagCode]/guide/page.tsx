import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { GuestBottomNav, GuestShell } from '@/components/guest/GuestShell';
import { requireNfcGuestAccess } from '@/lib/nfc-security';
import { HotelGuideContent } from './HotelGuideContent';

export const dynamic = 'force-dynamic';

export default async function GuidePage({
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

  const sections = await db.hotelGuideSection.findMany({
    where: {
      hotelId: tag.hotelId,
      isActive: true,
    },
    include: {
      galleryImages: {
        where: {
          isActive: true,
        },
        orderBy: [
          {
            sortOrder: 'asc',
          },
          {
            createdAt: 'desc',
          },
        ],
      },
      items: {
        where: {
          isActive: true,
        },
        include: {
          galleryImages: {
            where: {
              isActive: true,
            },
            orderBy: [
              {
                sortOrder: 'asc',
              },
              {
                createdAt: 'desc',
              },
            ],
          },
        },
        orderBy: [
          {
            sortOrder: 'asc',
          },
          {
            title: 'asc',
          },
        ],
      },
    },
    orderBy: [
      {
        sortOrder: 'asc',
      },
      {
        title: 'asc',
      },
    ],
  });

  const settings = tag.hotel.settings;

  return (
    <>
      <GuestShell
        hotel={tag.hotel}
        title="Hotel Guide"
        subtitle="Everything you need during your stay"
        backHref={`/t/${tagCode}`}
        variant="dark"
      >
        <HotelGuideContent
          tagCode={tagCode}
          sections={sections.map((section) => ({
            id: section.id,
            title: section.title,
            subtitle: section.subtitle ?? '',
            description: section.description ?? '',
            imageUrl: section.imageUrl ?? '',
            iconKey: section.iconKey,

            galleryImages: section.galleryImages.map((image) => ({
              id: image.id,
              title: image.title ?? '',
              caption: image.caption ?? '',
              imageUrl: image.imageUrl,
              sortOrder: image.sortOrder,
              isActive: image.isActive,
            })),

            items: section.items.map((item) => ({
              id: item.id,
              title: item.title,
              subtitle: item.subtitle ?? '',
              content: item.content ?? '',
              iconKey: item.iconKey,
              hours: item.hours ?? '',
              location: item.location ?? '',
              contact: item.contact ?? '',
              mapUrl: item.mapUrl ?? '',
              buttonLabel: item.buttonLabel ?? '',
              buttonHref: item.buttonHref ?? '',

              galleryImages: item.galleryImages.map((image) => ({
                id: image.id,
                title: image.title ?? '',
                caption: image.caption ?? '',
                imageUrl: image.imageUrl,
                sortOrder: image.sortOrder,
                isActive: image.isActive,
              })),
            })),
          }))}
          wifiName={settings?.wifiName ?? 'Ask front desk'}
          wifiPassword={settings?.wifiPassword ?? 'Ask front desk'}
          checkInTime={settings?.checkInTime ?? '2:00 PM'}
          checkOutTime={settings?.checkOutTime ?? '12:00 PM'}
        />
      </GuestShell>

      <GuestBottomNav tagCode={tagCode} active="profile" dark />
    </>
  );
}