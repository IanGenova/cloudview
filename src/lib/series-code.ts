import { Prisma, SeriesCodeType } from '@prisma/client';

const TYPE_PREFIX: Record<SeriesCodeType, string> = {
  FOOD: 'FO',
  SERVICE: 'SE',
};

function getHotelAbbreviation(hotelName: string) {
  const cleanedWords = hotelName
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (!cleanedWords.length) {
    return 'HOTL';
  }

  if (cleanedWords.length >= 2) {
    return cleanedWords
      .slice(0, 4)
      .map((word) => word[0])
      .join('')
      .padEnd(4, 'X')
      .slice(0, 4);
  }

  return cleanedWords[0].slice(0, 4).padEnd(4, 'X');
}

export async function generateSeriesCode(
  tx: Prisma.TransactionClient,
  {
    hotelName,
    type,
  }: {
    hotelName: string;
    type: SeriesCodeType;
  }
) {
  const prefix = getHotelAbbreviation(hotelName);
  const typePrefix = TYPE_PREFIX[type];

  const counter = await tx.seriesCodeCounter.upsert({
    where: {
      prefix_type: {
        prefix,
        type,
      },
    },
    create: {
      prefix,
      type,
      nextNumber: 2,
    },
    update: {
      nextNumber: {
        increment: 1,
      },
    },
    select: {
      nextNumber: true,
    },
  });

  const issuedNumber = counter.nextNumber - 1;
  const paddedNumber = String(issuedNumber).padStart(6, '0');

  return `${prefix}${typePrefix}${paddedNumber}`;
}