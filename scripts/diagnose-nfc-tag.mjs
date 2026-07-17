import { loadEnvConfig } from '@next/env';

const isDevelopment = process.env.NODE_ENV !== 'production';
loadEnvConfig(process.cwd(), isDevelopment);

const [{ PrismaClient }] = await Promise.all([
  import('@prisma/client'),
]);

const tagCode = String(process.argv[2] || '').trim().toUpperCase();
const requestedHotelSlug = String(process.argv[3] || '').trim().toLowerCase();

if (!tagCode) {
  console.error(
    'Usage: node scripts/diagnose-nfc-tag.mjs TAGCODE [hotel-slug]'
  );
  process.exit(1);
}

function databaseIdentity() {
  const raw = String(process.env.DATABASE_URL || '').trim();

  try {
    const url = new URL(raw);
    return {
      host: url.host,
      database: url.pathname.replace(/^\//, ''),
    };
  } catch {
    return {
      host: raw ? 'unparseable' : 'missing',
      database: null,
    };
  }
}

const db = new PrismaClient();

try {
  const tag = await db.nfcTag.findFirst({
    where: {
      code: tagCode,
    },
    select: {
      id: true,
      code: true,
      status: true,
      deletedAt: true,
      roomId: true,
      locationId: true,
      scanSecret: true,
      hotel: {
        select: {
          name: true,
          slug: true,
          isActive: true,
          settings: {
            select: {
              nfcRoomPasscodeEnabled: true,
            },
          },
        },
      },
    },
  });

  console.log({
    nodeEnv: process.env.NODE_ENV || null,
    cwd: process.cwd(),
    database: databaseIdentity(),
    requestedTagCode: tagCode,
    requestedHotelSlug: requestedHotelSlug || null,
    tagExists: Boolean(tag),
    tag: tag
      ? {
          id: tag.id,
          code: tag.code,
          status: tag.status,
          deletedAt: tag.deletedAt,
          hasScanSecret: Boolean(tag.scanSecret),
          roomId: tag.roomId,
          locationId: tag.locationId,
          hotel: tag.hotel,
          slugMatches:
            !requestedHotelSlug ||
            tag.hotel.slug.trim().toLowerCase() === requestedHotelSlug,
        }
      : null,
  });
} finally {
  await db.$disconnect();
}
