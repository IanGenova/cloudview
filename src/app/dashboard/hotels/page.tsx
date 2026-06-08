import { Role } from '@prisma/client';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { HotelsClient, type HotelRow } from './HotelsClient';

type SortKey =
  | 'newest'
  | 'oldest'
  | 'name-asc'
  | 'name-desc'
  | 'rooms-desc'
  | 'orders-desc'
  | 'tags-desc';

type SearchParams = {
  q?: string;
  sort?: string;
  success?: string;
  error?: string;
};

type HotelAdminInfo = {
  name: string;
  email: string;
};

function normalizeSort(value?: string): SortKey {
  if (
    value === 'newest' ||
    value === 'oldest' ||
    value === 'name-asc' ||
    value === 'name-desc' ||
    value === 'rooms-desc' ||
    value === 'orders-desc' ||
    value === 'tags-desc'
  ) {
    return value;
  }

  return 'newest';
}

function getMessage(success?: string, error?: string) {
  if (success) {
    const messages: Record<string, string> = {
      'hotel-created': 'Hotel created successfully.',
      'hotel-updated': 'Hotel updated successfully.',
      'hotel-deleted': 'Hotel deleted successfully.',
    };

    return {
      type: 'success' as const,
      text: messages[success] ?? 'Action completed successfully.',
    };
  }

  if (error) {
    const messages: Record<string, string> = {
      'hotel-required': 'Hotel name and slug are required.',
      'hotel-not-found': 'Hotel was not found.',
      'slug-exists': 'A hotel with this slug already exists.',
      'hotel-has-records':
        'This hotel cannot be deleted because it already has connected records.',
      'action-failed': 'Action failed. Please try again.',
    };

    return {
      type: 'error' as const,
      text: messages[error] ?? 'Something went wrong.',
    };
  }

  return null;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export default async function HotelsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const user = await requireUser();

  if (user.role !== Role.SUPER_ADMIN) {
    return <p>Forbidden</p>;
  }

  const params = await searchParams;
  const query = params?.q?.trim() ?? '';
  const sort = normalizeSort(params?.sort);
  const message = getMessage(params?.success, params?.error);

  const [hotels, hotelAdmins, nfcTagCounts] = await Promise.all([
    db.hotel.findMany({
      include: {
        _count: {
          select: {
            rooms: true,
            orders: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    }),

    db.user.findMany({
      where: {
        role: Role.HOTEL_ADMIN,
        hotelId: {
          not: null,
        },
      },
      select: {
        hotelId: true,
        name: true,
        email: true,
      },
      orderBy: {
        name: 'asc',
      },
    }),

    db.nfcTag.groupBy({
      by: ['hotelId'],
      _count: {
        _all: true,
      },
    }),
  ]);

  const hotelAdminByHotelId = new Map<string, HotelAdminInfo>();

  for (const admin of hotelAdmins) {
    if (!admin.hotelId) continue;

    if (!hotelAdminByHotelId.has(admin.hotelId)) {
      hotelAdminByHotelId.set(admin.hotelId, {
        name: admin.name,
        email: admin.email,
      });
    }
  }

  const nfcCountByHotelId = new Map<string, number>();

  for (const count of nfcTagCounts) {
    if (!count.hotelId) continue;

    nfcCountByHotelId.set(count.hotelId, count._count._all);
  }

  const hotelRows = hotels.map((hotel) => {
    const admin = hotelAdminByHotelId.get(hotel.id) ?? null;
    const nfcTags = nfcCountByHotelId.get(hotel.id) ?? 0;

    return {
      id: hotel.id,
      name: hotel.name,
      slug: hotel.slug,
      brandColor: hotel.brandColor,
      accentColor: hotel.accentColor,
      createdAt: hotel.createdAt,
      updatedAt: hotel.updatedAt,
      createdAtLabel: formatDate(hotel.createdAt),
      updatedAtLabel: formatDate(hotel.updatedAt),
      rooms: hotel._count.rooms,
      orders: hotel._count.orders,
      nfcTags,
      admin,
    };
  });

  const filteredRows = query
    ? hotelRows.filter((hotel) => {
        const text = [
          hotel.name,
          hotel.slug,
          hotel.admin?.name ?? '',
          hotel.admin?.email ?? '',
        ]
          .join(' ')
          .toLowerCase();

        return text.includes(query.toLowerCase());
      })
    : hotelRows;

  const sortedRows = [...filteredRows].sort((first, second) => {
    if (sort === 'oldest') {
      return first.createdAt.getTime() - second.createdAt.getTime();
    }

    if (sort === 'name-asc') {
      return first.name.localeCompare(second.name);
    }

    if (sort === 'name-desc') {
      return second.name.localeCompare(first.name);
    }

    if (sort === 'rooms-desc') {
      return second.rooms - first.rooms;
    }

    if (sort === 'orders-desc') {
      return second.orders - first.orders;
    }

    if (sort === 'tags-desc') {
      return second.nfcTags - first.nfcTags;
    }

    return second.createdAt.getTime() - first.createdAt.getTime();
  });

  const totalHotels = hotels.length;
  const totalRooms = hotels.reduce((sum, hotel) => sum + hotel._count.rooms, 0);
  const totalOrders = hotels.reduce(
    (sum, hotel) => sum + hotel._count.orders,
    0
  );
  const totalNfcTags = Array.from(nfcCountByHotelId.values()).reduce(
    (sum, count) => sum + count,
    0
  );

  const clientRows: HotelRow[] = sortedRows.map((hotel) => ({
    id: hotel.id,
    name: hotel.name,
    slug: hotel.slug,
    brandColor: hotel.brandColor,
    accentColor: hotel.accentColor,
    createdAtLabel: hotel.createdAtLabel,
    updatedAtLabel: hotel.updatedAtLabel,
    rooms: hotel.rooms,
    orders: hotel.orders,
    nfcTags: hotel.nfcTags,
    admin: hotel.admin,
  }));

  return (
    <HotelsClient
      hotels={clientRows}
      query={query}
      sort={sort}
      message={message}
      totalHotels={totalHotels}
      totalRooms={totalRooms}
      totalOrders={totalOrders}
      totalNfcTags={totalNfcTags}
    />
  );
}