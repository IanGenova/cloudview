'use server';

import { HotelGuideItemType, Role } from '@prisma/client';
import { randomUUID } from 'crypto';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import path from 'path';
import { assertHotelScope, scopedHotelId } from '@/lib/access';
import { requireRole, requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { cleanText } from '@/lib/sanitize';

const MAX_GUIDE_IMAGE_SIZE = 4 * 1024 * 1024;

type DefaultGuideItem = {
  title: string;
  subtitle: string;
  content: string;
  itemType: HotelGuideItemType;
  iconKey: string;
  imageUrl?: string;
  hours?: string;
  location?: string;
  contact?: string;
  mapUrl?: string;
  buttonLabel?: string;
  buttonHref?: string;
  sortOrder: number;
};

type DefaultGuideSection = {
  title: string;
  subtitle: string;
  description: string;
  imageUrl: string;
  iconKey: string;
  sortOrder: number;
  items: DefaultGuideItem[];
};

const DEFAULT_SECTIONS: DefaultGuideSection[] = [
  {
    title: 'Dining',
    subtitle: 'Explore our restaurants and bars',
    description: 'Restaurant, café, breakfast, and room service information.',
    imageUrl:
      'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80',
    iconKey: 'Utensils',
    sortOrder: 1,
    items: [
      {
        title: 'Restaurant Hours',
        subtitle: 'Dining schedule',
        content:
          'Breakfast: 6:00 AM - 10:00 AM\nRestaurant: 6:00 AM - 10:00 PM',
        itemType: HotelGuideItemType.DINING,
        iconKey: 'Utensils',
        hours: '6:00 AM - 10:00 PM',
        buttonLabel: 'View Menu',
        buttonHref: 'menu',
        sortOrder: 1,
      },
    ],
  },
  {
    title: 'Facilities',
    subtitle: 'Explore facilities and amenities',
    description: 'Pool, parking, lounge, gym, and hotel facilities.',
    imageUrl:
      'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=800&q=80',
    iconKey: 'Hotel',
    sortOrder: 2,
    items: [
      {
        title: 'Pool Hours',
        subtitle: 'Swimming pool information',
        content: 'Pool is open daily. Please follow posted safety rules.',
        itemType: HotelGuideItemType.FACILITY,
        iconKey: 'Waves',
        hours: '7:00 AM - 9:00 PM',
        buttonLabel: 'View Pool',
        buttonHref: 'pool',
        sortOrder: 1,
      },
    ],
  },
  {
    title: 'Nearby Attractions',
    subtitle: 'Discover things to do around the area',
    description: 'Tourist spots, nearby restaurants, and local attractions.',
    imageUrl:
      'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=800&q=80',
    iconKey: 'MapPin',
    sortOrder: 3,
    items: [
      {
        title: 'Tourist Information',
        subtitle: 'Ask the front desk for recommendations',
        content:
          'Our staff can help with nearby attractions, transportation, tours, and local recommendations.',
        itemType: HotelGuideItemType.LOCATION,
        iconKey: 'MapPin',
        sortOrder: 1,
      },
    ],
  },
  {
    title: 'Hotel Information',
    subtitle: 'Policies, Wi-Fi, check-out time and more',
    description: 'Important guest information during your stay.',
    imageUrl:
      'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=800&q=80',
    iconKey: 'BedDouble',
    sortOrder: 4,
    items: [
      {
        title: 'Wi-Fi',
        subtitle: 'Guest internet access',
        content: 'Network and password are shown in the information cards.',
        itemType: HotelGuideItemType.INFORMATION,
        iconKey: 'Wifi',
        sortOrder: 1,
      },
      {
        title: 'Check-in / Check-out',
        subtitle: 'Standard hotel schedule',
        content: 'Check-in: 2:00 PM\nCheck-out: 12:00 PM',
        itemType: HotelGuideItemType.INFORMATION,
        iconKey: 'BedDouble',
        sortOrder: 2,
      },
      {
        title: 'Policies',
        subtitle: 'House rules',
        content:
          'Please keep noise low, respect hotel property, and contact staff for assistance.',
        itemType: HotelGuideItemType.POLICY,
        iconKey: 'Hotel',
        sortOrder: 3,
      },
    ],
  },
];

function redirectToGuide(params: { error?: string; success?: string }): never {
  const query = new URLSearchParams();

  if (params.error) {
    query.set('error', params.error);
  }

  if (params.success) {
    query.set('success', params.success);
  }

  redirect(
    query.toString()
      ? `/dashboard/hotel-guide?${query.toString()}`
      : '/dashboard/hotel-guide'
  );
}

function parseSortOrder(value: FormDataEntryValue | null) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed)) {
    return 0;
  }

  return parsed;
}

function validateItemType(value: FormDataEntryValue | null) {
  const itemType = value as HotelGuideItemType;

  if (!Object.values(HotelGuideItemType).includes(itemType)) {
    return null;
  }

  return itemType;
}

function getFileExtension(file: File) {
  const name = file.name || '';
  const ext = name.split('.').pop()?.toLowerCase();

  if (ext && ['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
    return ext;
  }

  if (file.type === 'image/jpeg') return 'jpg';
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';

  return null;
}

async function saveHotelGuideImageFile(file: File) {
  if (!file || file.size <= 0) {
    throw new Error('Image file is required.');
  }

  if (file.size > MAX_GUIDE_IMAGE_SIZE) {
    throw new Error('Image must be 4MB or smaller.');
  }

  if (!file.type.startsWith('image/')) {
    throw new Error('Uploaded file must be an image.');
  }

  const extension = getFileExtension(file);

  if (!extension) {
    throw new Error('Only JPG, PNG, and WEBP images are allowed.');
  }

  const fileName = `${randomUUID()}.${extension}`;
  const uploadDir = path.join(
    process.cwd(),
    'public',
    'uploads',
    'hotel-guide'
  );

  await mkdir(uploadDir, {
    recursive: true,
  });

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  await writeFile(path.join(uploadDir, fileName), buffer);

  return `/uploads/hotel-guide/${fileName}`;
}

async function deletePublicImageFile(imageUrl: string) {
  if (!imageUrl.startsWith('/uploads/hotel-guide/')) {
    return;
  }

  const fullPath = path.join(process.cwd(), 'public', imageUrl);

  try {
    await unlink(fullPath);
  } catch {
    // Local file may already be missing. Ignore safely.
  }
}

export async function createGuideSectionAction(formData: FormData) {
  const user = await requireUser();
  requireRole(user.role, [Role.SUPER_ADMIN, Role.HOTEL_ADMIN]);

  const hotelId = scopedHotelId(user, cleanText(formData.get('hotelId')));
  const title = cleanText(formData.get('title'), 120);
  const subtitle = cleanText(formData.get('subtitle'), 180);
  const description = cleanText(formData.get('description'), 500);
  const imageUrl = cleanText(formData.get('imageUrl'), 700);
  const iconKey = cleanText(formData.get('iconKey'), 80) || 'Info';
  const sortOrder = parseSortOrder(formData.get('sortOrder'));
  const isActive = formData.get('isActive') === 'true';

  if (!hotelId) redirectToGuide({ error: 'hotel-required' });
  if (!title) redirectToGuide({ error: 'title-required' });

  await db.hotelGuideSection.create({
    data: {
      hotelId,
      title,
      subtitle: subtitle || null,
      description: description || null,
      imageUrl: imageUrl || null,
      iconKey,
      sortOrder,
      isActive,
    },
  });

  revalidatePath('/dashboard/hotel-guide');
  redirectToGuide({ success: 'section-created' });
}

export async function updateGuideSectionAction(formData: FormData) {
  const user = await requireUser();
  requireRole(user.role, [Role.SUPER_ADMIN, Role.HOTEL_ADMIN]);

  const sectionId = cleanText(formData.get('sectionId'));
  const title = cleanText(formData.get('title'), 120);
  const subtitle = cleanText(formData.get('subtitle'), 180);
  const description = cleanText(formData.get('description'), 500);
  const imageUrl = cleanText(formData.get('imageUrl'), 700);
  const iconKey = cleanText(formData.get('iconKey'), 80) || 'Info';
  const sortOrder = parseSortOrder(formData.get('sortOrder'));
  const isActive = formData.get('isActive') === 'true';

  if (!sectionId) redirectToGuide({ error: 'section-required' });
  if (!title) redirectToGuide({ error: 'title-required' });

  const section = await db.hotelGuideSection.findUnique({
    where: {
      id: sectionId,
    },
  });

  if (!section) {
    redirectToGuide({ error: 'section-not-found' });
  }

  assertHotelScope(user, section.hotelId);

  await db.hotelGuideSection.update({
    where: {
      id: section.id,
    },
    data: {
      title,
      subtitle: subtitle || null,
      description: description || null,
      imageUrl: imageUrl || null,
      iconKey,
      sortOrder,
      isActive,
    },
  });

  revalidatePath('/dashboard/hotel-guide');
  redirectToGuide({ success: 'section-updated' });
}

export async function deleteGuideSectionAction(formData: FormData) {
  const user = await requireUser();
  requireRole(user.role, [Role.SUPER_ADMIN, Role.HOTEL_ADMIN]);

  const sectionId = cleanText(formData.get('sectionId'));

  if (!sectionId) {
    redirectToGuide({ error: 'section-required' });
  }

  const section = await db.hotelGuideSection.findUnique({
    where: {
      id: sectionId,
    },
    include: {
      galleryImages: true,
      items: {
        include: {
          galleryImages: true,
        },
      },
    },
  });

  if (!section) {
    redirectToGuide({ error: 'section-not-found' });
  }

  assertHotelScope(user, section.hotelId);

  const imageUrls = [
    ...section.galleryImages.map((image) => image.imageUrl),
    ...section.items.flatMap((item) =>
      item.galleryImages.map((image) => image.imageUrl)
    ),
  ];

  await db.hotelGuideSection.delete({
    where: {
      id: section.id,
    },
  });

  await Promise.allSettled(
    imageUrls.map((imageUrl) => deletePublicImageFile(imageUrl))
  );

  revalidatePath('/dashboard/hotel-guide');
  redirectToGuide({ success: 'section-deleted' });
}

export async function createGuideItemAction(formData: FormData) {
  const user = await requireUser();
  requireRole(user.role, [Role.SUPER_ADMIN, Role.HOTEL_ADMIN]);

  const sectionId = cleanText(formData.get('sectionId'));
  const title = cleanText(formData.get('title'), 120);
  const subtitle = cleanText(formData.get('subtitle'), 180);
  const content = cleanText(formData.get('content'), 4000);
  const itemType = validateItemType(formData.get('itemType'));
  const imageUrl = cleanText(formData.get('imageUrl'), 700);
  const iconKey = cleanText(formData.get('iconKey'), 80) || 'Info';
  const hours = cleanText(formData.get('hours'), 180);
  const location = cleanText(formData.get('location'), 180);
  const contact = cleanText(formData.get('contact'), 180);
  const mapUrl = cleanText(formData.get('mapUrl'), 700);
  const buttonLabel = cleanText(formData.get('buttonLabel'), 80);
  const buttonHref = cleanText(formData.get('buttonHref'), 300);
  const sortOrder = parseSortOrder(formData.get('sortOrder'));
  const isActive = formData.get('isActive') === 'true';

  if (!sectionId) redirectToGuide({ error: 'section-required' });
  if (!title) redirectToGuide({ error: 'title-required' });
  if (!itemType) redirectToGuide({ error: 'item-type-required' });

  const section = await db.hotelGuideSection.findUnique({
    where: {
      id: sectionId,
    },
  });

  if (!section) {
    redirectToGuide({ error: 'section-not-found' });
  }

  assertHotelScope(user, section.hotelId);

  await db.hotelGuideItem.create({
    data: {
      hotelId: section.hotelId,
      sectionId: section.id,
      title,
      subtitle: subtitle || null,
      content: content || null,
      itemType,
      imageUrl: imageUrl || null,
      iconKey,
      hours: hours || null,
      location: location || null,
      contact: contact || null,
      mapUrl: mapUrl || null,
      buttonLabel: buttonLabel || null,
      buttonHref: buttonHref || null,
      sortOrder,
      isActive,
    },
  });

  revalidatePath('/dashboard/hotel-guide');
  redirectToGuide({ success: 'item-created' });
}

export async function updateGuideItemAction(formData: FormData) {
  const user = await requireUser();
  requireRole(user.role, [Role.SUPER_ADMIN, Role.HOTEL_ADMIN]);

  const itemId = cleanText(formData.get('itemId'));
  const title = cleanText(formData.get('title'), 120);
  const subtitle = cleanText(formData.get('subtitle'), 180);
  const content = cleanText(formData.get('content'), 4000);
  const itemType = validateItemType(formData.get('itemType'));
  const imageUrl = cleanText(formData.get('imageUrl'), 700);
  const iconKey = cleanText(formData.get('iconKey'), 80) || 'Info';
  const hours = cleanText(formData.get('hours'), 180);
  const location = cleanText(formData.get('location'), 180);
  const contact = cleanText(formData.get('contact'), 180);
  const mapUrl = cleanText(formData.get('mapUrl'), 700);
  const buttonLabel = cleanText(formData.get('buttonLabel'), 80);
  const buttonHref = cleanText(formData.get('buttonHref'), 300);
  const sortOrder = parseSortOrder(formData.get('sortOrder'));
  const isActive = formData.get('isActive') === 'true';

  if (!itemId) redirectToGuide({ error: 'item-required' });
  if (!title) redirectToGuide({ error: 'title-required' });
  if (!itemType) redirectToGuide({ error: 'item-type-required' });

  const item = await db.hotelGuideItem.findUnique({
    where: {
      id: itemId,
    },
  });

  if (!item) {
    redirectToGuide({ error: 'item-not-found' });
  }

  assertHotelScope(user, item.hotelId);

  await db.hotelGuideItem.update({
    where: {
      id: item.id,
    },
    data: {
      title,
      subtitle: subtitle || null,
      content: content || null,
      itemType,
      imageUrl: imageUrl || null,
      iconKey,
      hours: hours || null,
      location: location || null,
      contact: contact || null,
      mapUrl: mapUrl || null,
      buttonLabel: buttonLabel || null,
      buttonHref: buttonHref || null,
      sortOrder,
      isActive,
    },
  });

  revalidatePath('/dashboard/hotel-guide');
  redirectToGuide({ success: 'item-updated' });
}

export async function deleteGuideItemAction(formData: FormData) {
  const user = await requireUser();
  requireRole(user.role, [Role.SUPER_ADMIN, Role.HOTEL_ADMIN]);

  const itemId = cleanText(formData.get('itemId'));

  if (!itemId) {
    redirectToGuide({ error: 'item-required' });
  }

  const item = await db.hotelGuideItem.findUnique({
    where: {
      id: itemId,
    },
    include: {
      galleryImages: true,
    },
  });

  if (!item) {
    redirectToGuide({ error: 'item-not-found' });
  }

  assertHotelScope(user, item.hotelId);

  const imageUrls = item.galleryImages.map((image) => image.imageUrl);

  await db.hotelGuideItem.delete({
    where: {
      id: item.id,
    },
  });

  await Promise.allSettled(
    imageUrls.map((imageUrl) => deletePublicImageFile(imageUrl))
  );

  revalidatePath('/dashboard/hotel-guide');
  redirectToGuide({ success: 'item-deleted' });
}

export async function uploadGuideImageAction(formData: FormData) {
  const user = await requireUser();
  requireRole(user.role, [Role.SUPER_ADMIN, Role.HOTEL_ADMIN]);

  const sectionId = cleanText(formData.get('sectionId'));
  const itemId = cleanText(formData.get('itemId'));
  const title = cleanText(formData.get('title'), 120);
  const caption = cleanText(formData.get('caption'), 300);
  const sortOrder = parseSortOrder(formData.get('sortOrder'));
  const isActive = formData.get('isActive') === 'true';
  const file = formData.get('image') as File | null;

  if (!sectionId && !itemId) {
    redirectToGuide({ error: 'section-required' });
  }

  let hotelId = '';
  let finalSectionId: string | null = sectionId || null;
  let finalItemId: string | null = itemId || null;

  if (itemId) {
    const item = await db.hotelGuideItem.findUnique({
      where: {
        id: itemId,
      },
      select: {
        id: true,
        hotelId: true,
        sectionId: true,
      },
    });

    if (!item) {
      redirectToGuide({ error: 'item-not-found' });
    }

    assertHotelScope(user, item.hotelId);

    hotelId = item.hotelId;
    finalSectionId = item.sectionId;
    finalItemId = item.id;
  } else if (sectionId) {
    const section = await db.hotelGuideSection.findUnique({
      where: {
        id: sectionId,
      },
      select: {
        id: true,
        hotelId: true,
      },
    });

    if (!section) {
      redirectToGuide({ error: 'section-not-found' });
    }

    assertHotelScope(user, section.hotelId);

    hotelId = section.hotelId;
    finalSectionId = section.id;
    finalItemId = null;
  }

  try {
    const imageUrl = await saveHotelGuideImageFile(file!);

    await db.hotelGuideImage.create({
      data: {
        hotelId,
        sectionId: finalSectionId,
        itemId: finalItemId,
        title: title || null,
        caption: caption || null,
        imageUrl,
        sortOrder,
        isActive,
      },
    });
  } catch (error) {
    console.error(error);
    redirectToGuide({ error: 'image-upload-failed' });
  }

  revalidatePath('/dashboard/hotel-guide');
  redirectToGuide({ success: 'image-uploaded' });
}

export async function deleteGuideImageAction(formData: FormData) {
  const user = await requireUser();
  requireRole(user.role, [Role.SUPER_ADMIN, Role.HOTEL_ADMIN]);

  const imageId = cleanText(formData.get('imageId'));

  if (!imageId) {
    redirectToGuide({ error: 'image-required' });
  }

  const image = await db.hotelGuideImage.findUnique({
    where: {
      id: imageId,
    },
  });

  if (!image) {
    redirectToGuide({ error: 'image-not-found' });
  }

  assertHotelScope(user, image.hotelId);

  await db.hotelGuideImage.delete({
    where: {
      id: image.id,
    },
  });

  await deletePublicImageFile(image.imageUrl);

  revalidatePath('/dashboard/hotel-guide');
  redirectToGuide({ success: 'image-deleted' });
}

export async function seedDefaultHotelGuideAction(formData: FormData) {
  const user = await requireUser();
  requireRole(user.role, [Role.SUPER_ADMIN, Role.HOTEL_ADMIN]);

  const hotelId = scopedHotelId(user, cleanText(formData.get('hotelId')));

  if (!hotelId) {
    redirectToGuide({ error: 'hotel-required' });
  }

  assertHotelScope(user, hotelId);

  for (const section of DEFAULT_SECTIONS) {
    const createdSection = await db.hotelGuideSection.create({
      data: {
        hotelId,
        title: section.title,
        subtitle: section.subtitle,
        description: section.description,
        imageUrl: section.imageUrl,
        iconKey: section.iconKey,
        sortOrder: section.sortOrder,
        isActive: true,
      },
    });

    await db.hotelGuideItem.createMany({
      data: section.items.map((item) => ({
        hotelId,
        sectionId: createdSection.id,
        title: item.title,
        subtitle: item.subtitle,
        content: item.content,
        itemType: item.itemType,
        iconKey: item.iconKey,
        hours: item.hours ?? null,
        buttonLabel: item.buttonLabel ?? null,
        buttonHref: item.buttonHref ?? null,
        sortOrder: item.sortOrder,
        isActive: true,
      })),
    });
  }

  revalidatePath('/dashboard/hotel-guide');
  redirectToGuide({ success: 'seeded' });
}