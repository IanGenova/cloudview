import { Role } from '@prisma/client';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { db } from '@/lib/db';
import { requireRole, requireUser } from '@/lib/auth';
import { HotelGuideClient } from './HotelGuideClient';

function getMessage(error?: string, success?: string) {
  if (success) {
    const messages: Record<string, string> = {
      'section-created': 'Guide section created successfully.',
      'section-updated': 'Guide section updated successfully.',
      'section-deleted': 'Guide section deleted successfully.',
      'item-created': 'Guide item created successfully.',
      'item-updated': 'Guide item updated successfully.',
      'item-deleted': 'Guide item deleted successfully.',
      seeded: 'Default hotel guide content added successfully.',
    };

    return {
      type: 'success' as const,
      text: messages[success] ?? 'Action completed successfully.',
    };
  }

  if (error) {
    const messages: Record<string, string> = {
      'hotel-required': 'Hotel is required.',
      'title-required': 'Title is required.',
      'section-required': 'Section is required.',
      'section-not-found': 'Guide section was not found.',
      'item-required': 'Guide item is required.',
      'item-not-found': 'Guide item was not found.',
      'item-type-required': 'Guide item type is required.',
    };

    return {
      type: 'error' as const,
      text: messages[error] ?? 'Something went wrong.',
    };
  }

  return null;
}

export default async function HotelGuideModulePage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    success?: string;
  }>;
}) {
  const { error, success } = await searchParams;

  const user = await requireUser();
  requireRole(user.role, [Role.SUPER_ADMIN, Role.HOTEL_ADMIN]);

  const [hotels, sections] = await Promise.all([
    user.role === Role.SUPER_ADMIN
      ? db.hotel.findMany({
          select: {
            id: true,
            name: true,
          },
          orderBy: {
            name: 'asc',
          },
        })
      : db.hotel.findMany({
          where: {
            id: user.hotelId!,
          },
          select: {
            id: true,
            name: true,
          },
        }),

    db.hotelGuideSection.findMany({
      where:
        user.role === Role.SUPER_ADMIN
          ? {}
          : {
              hotelId: user.hotelId!,
            },
      include: {
        hotel: {
          select: {
            name: true,
          },
        },
        items: {
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
          hotel: {
            name: 'asc',
          },
        },
        {
          sortOrder: 'asc',
        },
        {
          title: 'asc',
        },
      ],
    }),
  ]);

  const defaultHotelId =
    user.role === Role.SUPER_ADMIN ? hotels[0]?.id ?? '' : user.hotelId!;

  return (
    <div>
      <PageHeader
        title="Hotel Guide Module"
        description="Control the guide sections and information shown in the Guest Portal."
      />

      <HotelGuideClient
        hotels={hotels}
        sections={sections.map((section) => ({
          id: section.id,
          hotelId: section.hotelId,
          hotelName: section.hotel.name,
          title: section.title,
          subtitle: section.subtitle ?? '',
          description: section.description ?? '',
          imageUrl: section.imageUrl ?? '',
          iconKey: section.iconKey,
          sortOrder: section.sortOrder,
          isActive: section.isActive,
          items: section.items.map((item) => ({
            id: item.id,
            sectionId: item.sectionId,
            hotelId: item.hotelId,
            title: item.title,
            subtitle: item.subtitle ?? '',
            content: item.content ?? '',
            itemType: item.itemType,
            imageUrl: item.imageUrl ?? '',
            iconKey: item.iconKey,
            hours: item.hours ?? '',
            location: item.location ?? '',
            contact: item.contact ?? '',
            mapUrl: item.mapUrl ?? '',
            buttonLabel: item.buttonLabel ?? '',
            buttonHref: item.buttonHref ?? '',
            sortOrder: item.sortOrder,
            isActive: item.isActive,
          })),
        }))}
        message={getMessage(error, success)}
        defaultHotelId={defaultHotelId}
        canChangeHotel={user.role === Role.SUPER_ADMIN}
      />
    </div>
  );
}