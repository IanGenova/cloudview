import { DashboardModule, TagStatus, TagType } from '@prisma/client';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { db } from '@/lib/db';
import { requireDashboardPermission } from '@/lib/dashboard-permissions';
import {
  buildProtectedGuestUrl,
  buildSecureNfcLaunchUrl,
  resolveNfcPublicOrigin,
} from '@/lib/nfc-public-url';
import { NfcTagsClient } from './NfcTagsClient';

export const dynamic = 'force-dynamic';

export default async function TagsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    success?: string;
  }>;
}) {
  const params = await searchParams;
  const user = await requireDashboardPermission(
    DashboardModule.NFC_TAGS,
    'canView'
  );
  const nfcPublicOrigin = await resolveNfcPublicOrigin();

  console.info('[NFC Tags] Public origin resolved.', {
    origin: nfcPublicOrigin,
    nodeEnv: process.env.NODE_ENV,
  });

  const where = user.role === 'SUPER_ADMIN' ? {} : { hotelId: user.hotelId! };

  const [hotels, rooms, locations, tags] = await Promise.all([
    db.hotel.findMany({
      where: user.role === 'SUPER_ADMIN' ? {} : { id: user.hotelId! },
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        name: 'asc',
      },
    }),

    db.room.findMany({
      where: {
        ...where,
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true,
        hotelId: true,
        number: true,
        name: true,
        hotel: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        number: 'asc',
      },
    }),

    db.location.findMany({
      where: {
        ...where,
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true,
        hotelId: true,
        name: true,
        hotel: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    }),

    db.nfcTag.findMany({
      where: {
        ...where,
        deletedAt: null,
      },
      select: {
        id: true,
        hotelId: true,
        roomId: true,
        locationId: true,
        label: true,
        code: true,
        tagType: true,
        status: true,
        scanSecret: true,
        lastScannedAt: true,
        createdAt: true,
        hotel: {
          select: {
            name: true,
            slug: true,
          },
        },
        room: {
          select: {
            id: true,
            number: true,
            name: true,
          },
        },
        location: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="NFC Tag Management"
        description="Secure NFC launch sessions, tag assignment, scan tracking, edit/delete, and anti-sharing protection."
      />

      <NfcTagsClient
        success={params?.success}
        canChangeHotel={user.role === 'SUPER_ADMIN'}
        currentHotelId={user.hotelId ?? hotels[0]?.id ?? ''}
        hotels={hotels}
        rooms={rooms.map((room) => ({
          id: room.id,
          hotelId: room.hotelId,
          hotelName: room.hotel.name,
          number: room.number,
          name: room.name ?? '',
        }))}
        locations={locations.map((location) => ({
          id: location.id,
          hotelId: location.hotelId,
          hotelName: location.hotel.name,
          name: location.name,
        }))}
        tags={tags.map((tag) => {
          const linkedDestination = tag.room
            ? `Room ${tag.room.number}`
            : tag.location?.name || 'Unassigned';

          return {
            id: tag.id,
            hotelId: tag.hotelId,
            roomId: tag.roomId,
            locationId: tag.locationId,
            hotelName: tag.hotel.name,
            label: tag.label,
            code: tag.code,
            tagType: tag.tagType,
            status: tag.status,
            linkedDestination,
            roomNumber: tag.room?.number ?? '',
            locationName: tag.location?.name ?? '',
            lastScannedAt: tag.lastScannedAt?.toISOString() ?? null,
            createdAt: tag.createdAt.toISOString(),
            secureLaunchUrl: buildSecureNfcLaunchUrl({
              origin: nfcPublicOrigin,
              hotelSlug: tag.hotel.slug,
              tagCode: tag.code,
              tagId: tag.id,
              scanSecret: tag.scanSecret,
            }),
            lockedDestinationUrl: buildProtectedGuestUrl({
              origin: nfcPublicOrigin,
              tagCode: tag.code,
            }),
          };
        })}
        tagTypes={Object.values(TagType)}
        tagStatuses={Object.values(TagStatus)}
      />
    </div>
  );
}
