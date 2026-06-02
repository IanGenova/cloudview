'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { TagStatus, TagType } from '@prisma/client';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { randomSecret } from '@/lib/nfc-security';
import { cleanText } from '@/lib/sanitize';

const TAG_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TAG_CODE_LENGTH = 8;

const tagSchema = z.object({
  hotelId: z.string().min(1),
  label: z.string().min(1).max(160),
  code: z.string().min(1).max(160),
  tagType: z.nativeEnum(TagType),
  roomId: z.string().optional().nullable(),
  locationId: z.string().optional().nullable(),
  status: z.nativeEnum(TagStatus).default(TagStatus.ACTIVE),
});

const updateTagSchema = tagSchema.extend({
  tagId: z.string().min(1),
});

function generateShortTagCode() {
  let code = '';

  for (let index = 0; index < TAG_CODE_LENGTH; index += 1) {
    code += TAG_CODE_ALPHABET[
      Math.floor(Math.random() * TAG_CODE_ALPHABET.length)
    ];
  }

  return code;
}

function cleanCode(value: FormDataEntryValue | null) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, '')
    .slice(0, 160);
}

async function getAvailableTagCode(preferredCode?: string, excludeTagId?: string) {
  const preferred = cleanCode(preferredCode ?? '');

  if (preferred) {
    const existing = await db.nfcTag.findUnique({
      where: {
        code: preferred,
      },
      select: {
        id: true,
        deletedAt: true,
      },
    });

    if (!existing || existing.id === excludeTagId || existing.deletedAt) {
      return preferred;
    }
  }

  let nextCode = generateShortTagCode();
  let attempts = 0;

  while (attempts < 50) {
    const existing = await db.nfcTag.findUnique({
      where: {
        code: nextCode,
      },
      select: {
        id: true,
        deletedAt: true,
      },
    });

    if (!existing || existing.deletedAt) {
      return nextCode;
    }

    nextCode = generateShortTagCode();
    attempts += 1;
  }

  return `${generateShortTagCode()}${Date.now().toString(36).toUpperCase()}`
    .slice(0, 160);
}

function redirectTags(success: string) {
  revalidatePath('/dashboard/tags');
  redirect(`/dashboard/tags?success=${success}`);
}

async function assertHotelAccess(hotelId: string) {
  const user = await requireUser();

  if (user.role !== 'SUPER_ADMIN' && user.hotelId !== hotelId) {
    throw new Error('You are not allowed to manage this hotel.');
  }

  return user;
}

export async function toggleTagStatusAction(formData: FormData) {
  const user = await requireUser();

  const tagId = cleanText(formData.get('tagId'));

  if (!tagId) {
    throw new Error('NFC tag is required.');
  }

  const tag = await db.nfcTag.findUnique({
    where: {
      id: tagId,
    },
    select: {
      id: true,
      hotelId: true,
      status: true,
    },
  });

  if (!tag) {
    throw new Error('NFC tag not found.');
  }

  if (user.role !== 'SUPER_ADMIN' && tag.hotelId !== user.hotelId) {
    throw new Error('You are not allowed to update this NFC tag.');
  }

  const nextStatus = tag.status === TagStatus.ACTIVE
    ? TagStatus.INACTIVE
    : TagStatus.ACTIVE;

  await db.nfcTag.update({
    where: {
      id: tag.id,
    },
    data: {
      status: nextStatus,
    },
  });

  redirectTags('tag-updated');
}

export async function createTagAction(formData: FormData) {
  const user = await requireUser();

  const availableCode = await getAvailableTagCode(
    cleanCode(formData.get('code'))
  );

  const parsed = tagSchema.parse({
    hotelId: formData.get('hotelId') || user.hotelId,
    label: cleanText(formData.get('label')),
    code: availableCode,
    tagType: formData.get('tagType'),
    roomId: formData.get('roomId') || null,
    locationId: formData.get('locationId') || null,
    status: TagStatus.ACTIVE,
  });

  await assertHotelAccess(parsed.hotelId);

  const existingDeletedTag = await db.nfcTag.findUnique({
    where: {
      code: parsed.code,
    },
  });

  if (existingDeletedTag?.deletedAt) {
    await db.nfcTag.update({
      where: {
        id: existingDeletedTag.id,
      },
      data: {
        hotelId: parsed.hotelId,
        label: parsed.label,
        code: parsed.code,
        tagType: parsed.tagType,
        roomId: parsed.roomId || null,
        locationId: parsed.locationId || null,
        status: TagStatus.ACTIVE,
        deletedAt: null,
        scanSecret: randomSecret(),
        lastScannedAt: null,
      },
    });

    redirectTags('tag-created');
  }

  await db.nfcTag.create({
    data: {
      hotelId: parsed.hotelId,
      label: parsed.label,
      code: parsed.code,
      tagType: parsed.tagType,
      roomId: parsed.roomId || null,
      locationId: parsed.locationId || null,
      status: parsed.status,
      scanSecret: randomSecret(),
    },
  });

  redirectTags('tag-created');
}

export async function updateTagAction(formData: FormData) {
  const existing = await db.nfcTag.findUnique({
    where: {
      id: String(formData.get('tagId') || ''),
    },
  });

  if (!existing) {
    throw new Error('NFC tag not found.');
  }

  const nextCode = await getAvailableTagCode(
    cleanCode(formData.get('code')),
    existing.id
  );

  const parsed = updateTagSchema.parse({
    tagId: formData.get('tagId'),
    hotelId: formData.get('hotelId') || existing.hotelId,
    label: cleanText(formData.get('label')),
    code: nextCode,
    tagType: formData.get('tagType'),
    roomId: formData.get('roomId') || null,
    locationId: formData.get('locationId') || null,
    status: formData.get('status'),
  });

  await assertHotelAccess(existing.hotelId);
  await assertHotelAccess(parsed.hotelId);

  const duplicateCode = await db.nfcTag.findUnique({
    where: {
      code: parsed.code,
    },
  });

  if (duplicateCode && duplicateCode.id !== parsed.tagId) {
    if (duplicateCode.deletedAt) {
      const archivedCode = `${duplicateCode.code}-ARCHIVED-${Date.now()}`
        .slice(0, 190);

      await db.nfcTag.update({
        where: {
          id: duplicateCode.id,
        },
        data: {
          code: archivedCode,
          scanSecret: randomSecret(),
        },
      });
    } else {
      throw new Error(
        `The Unique Tag ID "${parsed.code}" is already used by an active NFC tag. Please use a different code.`
      );
    }
  }

  await db.nfcTag.update({
    where: {
      id: parsed.tagId,
    },
    data: {
      hotelId: parsed.hotelId,
      label: parsed.label,
      code: parsed.code,
      tagType: parsed.tagType,
      roomId: parsed.roomId || null,
      locationId: parsed.locationId || null,
      status: parsed.status,
    },
  });

  redirectTags('tag-updated');
}

export async function deleteTagAction(formData: FormData) {
  const tagId = String(formData.get('tagId') || '');

  const tag = await db.nfcTag.findUnique({
    where: {
      id: tagId,
    },
  });

  if (!tag) {
    throw new Error('NFC tag not found.');
  }

  await assertHotelAccess(tag.hotelId);

  const archivedCode = `${tag.code}-DELETED-${Date.now()}`.slice(0, 190);

  await db.$transaction([
    db.nfcAccessSession.updateMany({
      where: {
        tagId,
      },
      data: {
        revokedAt: new Date(),
      },
    }),

    db.nfcTag.update({
      where: {
        id: tagId,
      },
      data: {
        code: archivedCode,
        status: TagStatus.INACTIVE,
        deletedAt: new Date(),
        scanSecret: randomSecret(),
      },
    }),
  ]);

  redirectTags('tag-deleted');
}

export async function rotateTagSecretAction(formData: FormData) {
  const tagId = String(formData.get('tagId') || '');

  const tag = await db.nfcTag.findUnique({
    where: {
      id: tagId,
    },
  });

  if (!tag) {
    throw new Error('NFC tag not found.');
  }

  await assertHotelAccess(tag.hotelId);

  await db.$transaction([
    db.nfcAccessSession.updateMany({
      where: {
        tagId,
      },
      data: {
        revokedAt: new Date(),
      },
    }),

    db.nfcTag.update({
      where: {
        id: tagId,
      },
      data: {
        scanSecret: randomSecret(),
      },
    }),
  ]);

  redirectTags('tag-rotated');
}