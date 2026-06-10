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


const MAX_GUIDE_IMAGES_PER_UPLOAD = 10;

const MAX_GUIDE_PANORAMA_SIZE = 12 * 1024 * 1024;


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

const DEFAULT_POOL_SECTION: DefaultGuideSection = {
  title: 'Pool & Amenities',
  subtitle: 'Luxury pool, towels, wellness, and safety guide',
  description:
    'Infinity pool hours, poolside services, wellness options, and guest safety reminders.',
  imageUrl:
    'https://images.unsplash.com/photo-1572331165267-854da2b10ccc?auto=format&fit=crop&w=1200&q=80',
  iconKey: 'Waves',
  sortOrder: 2,
  items: [
    {
      title: 'Infinity Pool',
      subtitle:
        'Take a dip and unwind in a refined resort atmosphere with a breathtaking view.',
      content:
        'No running. Children must be supervised. Shower before entering. No glassware in the pool area. Follow lifeguard and staff instructions.',
      itemType: HotelGuideItemType.FACILITY,
      iconKey: 'Waves',
      imageUrl:
        'https://images.unsplash.com/photo-1572331165267-854da2b10ccc?auto=format&fit=crop&w=1200&q=80',
      hours: '7:00 AM - 9:00 PM',
      location: 'Pool Deck',
      buttonLabel: 'Open Pool Page',
      buttonHref: 'pool',
      sortOrder: 1,
    },
    {
      title: 'Poolside Menu',
      subtitle: 'Order food and drinks',
      content:
        'Enjoy selected food and beverages served near the pool area.',
      itemType: HotelGuideItemType.DINING,
      iconKey: 'Utensils',
      buttonLabel: 'View Menu',
      buttonHref: 'menu',
      sortOrder: 2,
    },
    {
      title: 'Request Towels',
      subtitle: 'Ask staff for extra towels',
      content:
        'Request extra towels or pool assistance from the service team.',
      itemType: HotelGuideItemType.FACILITY,
      iconKey: 'Waves',
      buttonLabel: 'Request Service',
      buttonHref: 'service',
      sortOrder: 3,
    },
    {
      title: 'Pool Rules',
      subtitle: 'Guidelines for your safety',
      content:
        'No running. Children must be supervised. Shower before entering. No glassware in the pool area.',
      itemType: HotelGuideItemType.POLICY,
      iconKey: 'ShieldCheck',
      buttonLabel: 'View Rules',
      buttonHref: 'pool#pool-rules',
      sortOrder: 4,
    },
    {
      title: 'Spa & Wellness',
      subtitle: 'Relax and rejuvenate',
      content:
        'Explore wellness options and relaxing amenities available during your stay.',
      itemType: HotelGuideItemType.FACILITY,
      iconKey: 'Sparkles',
      buttonLabel: 'Open Hotel Guide',
      buttonHref: 'guide',
      sortOrder: 5,
    },
  ],
};

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
function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File && value.size > 0;
}

function cleanImageTitleFromFileName(fileName: string) {
  const withoutExtension = fileName.replace(/\.[^/.]+$/, '');

  const cleaned = withoutExtension
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned.slice(0, 120);
}

function getImageTitle({
  baseTitle,
  fileName,
  index,
  total,
}: {
  baseTitle: string | null | undefined;
  fileName: string;
  index: number;
  total: number;
}) {
  if (baseTitle) {
    return total > 1 ? `${baseTitle} ${index + 1}`.slice(0, 120) : baseTitle;
  }

  return cleanImageTitleFromFileName(fileName) || `Gallery Image ${index + 1}`;
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

async function saveHotelGuidePanoramaFile(file: File) {
  if (!file || file.size <= 0) {
    throw new Error('Panorama image file is required.');
  }

  if (file.size > MAX_GUIDE_PANORAMA_SIZE) {
    throw new Error('360° panorama must be 12MB or smaller.');
  }

  if (!file.type.startsWith('image/')) {
    throw new Error('Uploaded panorama must be an image.');
  }

  const extension = getFileExtension(file);

  if (!extension) {
    throw new Error('Only JPG, PNG, and WEBP panorama images are allowed.');
  }

  const fileName = `${randomUUID()}-360.${extension}`;
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

async function resolvePanoramaImageUrl(formData: FormData) {
  const typedPanoramaImageUrl = cleanText(
    formData.get('panoramaImageUrl'),
    700
  );

  const panoramaFile = formData.get('panoramaImage');

  if (!isUploadedFile(panoramaFile)) {
    return {
      panoramaImageUrl: typedPanoramaImageUrl || null,
      uploadedPanoramaImageUrl: null,
    };
  }

  const uploadedPanoramaImageUrl =
    await saveHotelGuidePanoramaFile(panoramaFile);

  return {
    panoramaImageUrl: uploadedPanoramaImageUrl,
    uploadedPanoramaImageUrl,
  };
}

async function deleteReplacedPanoramaImage(
  previousPanoramaImageUrl: string | null | undefined,
  nextPanoramaImageUrl: string | null
) {
  if (
    previousPanoramaImageUrl &&
    previousPanoramaImageUrl !== nextPanoramaImageUrl
  ) {
    await deletePublicImageFile(previousPanoramaImageUrl);
  }
}


async function resolveCoverImageUrl(formData: FormData) {
  const typedImageUrl = cleanText(formData.get('imageUrl'), 700);
  const coverImageFile = formData.get('coverImage');

  if (!isUploadedFile(coverImageFile)) {
    return {
      imageUrl: typedImageUrl || null,
      uploadedImageUrl: null,
    };
  }

  const uploadedImageUrl = await saveHotelGuideImageFile(coverImageFile);

  return {
    imageUrl: uploadedImageUrl,
    uploadedImageUrl,
  };
}

async function deleteReplacedCoverImage(
  previousImageUrl: string | null | undefined,
  nextImageUrl: string | null
) {
  if (previousImageUrl && previousImageUrl !== nextImageUrl) {
    await deletePublicImageFile(previousImageUrl);
  }
}

export async function createGuideSectionAction(formData: FormData) {
  const user = await requireUser();
  requireRole(user.role, [Role.SUPER_ADMIN, Role.HOTEL_ADMIN]);

  const hotelId = scopedHotelId(user, cleanText(formData.get('hotelId')));
  const title = cleanText(formData.get('title'), 120);
  const subtitle = cleanText(formData.get('subtitle'), 180);
  const description = cleanText(formData.get('description'), 500);
  const iconKey = cleanText(formData.get('iconKey'), 80) || 'Info';
  const sortOrder = parseSortOrder(formData.get('sortOrder'));
  const isActive = formData.get('isActive') === 'true';
  const panoramaEnabled = formData.get('panoramaEnabled') === 'true';

if (!hotelId) redirectToGuide({ error: 'hotel-required' });
if (!title) redirectToGuide({ error: 'title-required' });

let uploadedPanoramaImageUrl: string | null = null;

try {
  const cover = await resolveCoverImageUrl(formData);
  const panorama = await resolvePanoramaImageUrl(formData);
  uploadedPanoramaImageUrl = panorama.uploadedPanoramaImageUrl;

  await db.hotelGuideSection.create({
    data: {
      hotelId,
      title,
      subtitle: subtitle || null,
      description: description || null,
      imageUrl: cover.imageUrl,
      iconKey,
      panoramaEnabled: panoramaEnabled && Boolean(panorama.panoramaImageUrl),
      panoramaImageUrl: panorama.panoramaImageUrl,
      sortOrder,
      isActive,
    },
  });
} catch (error) {
  console.error(error);

  if (uploadedPanoramaImageUrl) {
    await deletePublicImageFile(uploadedPanoramaImageUrl);
  }

  redirectToGuide({ error: 'image-upload-failed' });
}

  revalidatePath('/dashboard/hotel-guide');
  revalidatePath('/t/[tagCode]/guide', 'page');
  revalidatePath('/t/[tagCode]/pool', 'page');

  redirectToGuide({ success: 'section-created' });
}

export async function updateGuideSectionAction(formData: FormData) {
  const user = await requireUser();
  requireRole(user.role, [Role.SUPER_ADMIN, Role.HOTEL_ADMIN]);

  const sectionId = cleanText(formData.get('sectionId'));
  const title = cleanText(formData.get('title'), 120);
  const subtitle = cleanText(formData.get('subtitle'), 180);
  const description = cleanText(formData.get('description'), 500);
  const iconKey = cleanText(formData.get('iconKey'), 80) || 'Info';
  const sortOrder = parseSortOrder(formData.get('sortOrder'));
  const isActive = formData.get('isActive') === 'true';
  const panoramaEnabled = formData.get('panoramaEnabled') === 'true';

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

  let uploadedCoverImageUrl: string | null = null;
  let uploadedPanoramaImageUrl: string | null = null;

try {
  const cover = await resolveCoverImageUrl(formData);
  uploadedCoverImageUrl = cover.uploadedImageUrl;

  const panorama = await resolvePanoramaImageUrl(formData);
  uploadedPanoramaImageUrl = panorama.uploadedPanoramaImageUrl;

  await db.hotelGuideSection.update({
    where: {
      id: section.id,
    },
    data: {
      title,
      subtitle: subtitle || null,
      description: description || null,
      imageUrl: cover.imageUrl,
      iconKey,
      panoramaEnabled: panoramaEnabled && Boolean(panorama.panoramaImageUrl),
      panoramaImageUrl: panorama.panoramaImageUrl,
      sortOrder,
      isActive,
    },
  });

  await deleteReplacedCoverImage(section.imageUrl, cover.imageUrl);

  await deleteReplacedPanoramaImage(
    section.panoramaImageUrl,
    panorama.panoramaImageUrl
  );
} catch (error) {
  console.error(error);

  if (uploadedCoverImageUrl) {
    await deletePublicImageFile(uploadedCoverImageUrl);
  }

  if (uploadedPanoramaImageUrl) {
    await deletePublicImageFile(uploadedPanoramaImageUrl);
  }

  redirectToGuide({ error: 'image-upload-failed' });
}

  revalidatePath('/dashboard/hotel-guide');
  revalidatePath('/t/[tagCode]/guide', 'page');
  revalidatePath('/t/[tagCode]/pool', 'page');

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
  section.imageUrl,
  section.panoramaImageUrl,
  ...section.galleryImages.map((image) => image.imageUrl),
  ...section.items.flatMap((item) => [
    item.imageUrl,
    item.panoramaImageUrl,
    ...item.galleryImages.map((image) => image.imageUrl),
  ]),
].filter((imageUrl): imageUrl is string => Boolean(imageUrl));

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
  const iconKey = cleanText(formData.get('iconKey'), 80) || 'Info';
  const hours = cleanText(formData.get('hours'), 180);
  const location = cleanText(formData.get('location'), 180);
  const contact = cleanText(formData.get('contact'), 180);
  const mapUrl = cleanText(formData.get('mapUrl'), 700);
  const buttonLabel = cleanText(formData.get('buttonLabel'), 80);
  const buttonHref = cleanText(formData.get('buttonHref'), 300);
  const sortOrder = parseSortOrder(formData.get('sortOrder'));
  const isActive = formData.get('isActive') === 'true';
  const panoramaEnabled = formData.get('panoramaEnabled') === 'true';

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

 let uploadedPanoramaImageUrl: string | null = null;

try {
  const panorama = await resolvePanoramaImageUrl(formData);
  uploadedPanoramaImageUrl = panorama.uploadedPanoramaImageUrl;
  const cover = await resolveCoverImageUrl(formData);

  await db.hotelGuideItem.create({
    data: {
      hotelId: section.hotelId,
      sectionId: section.id,
      title,
      subtitle: subtitle || null,
      content: content || null,
      itemType,
      imageUrl: cover.imageUrl,
      iconKey,
      panoramaEnabled: panoramaEnabled && Boolean(panorama.panoramaImageUrl),
      panoramaImageUrl: panorama.panoramaImageUrl,
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
} catch (error) {
  console.error(error);

  if (uploadedPanoramaImageUrl) {
    await deletePublicImageFile(uploadedPanoramaImageUrl);
  }

  redirectToGuide({ error: 'image-upload-failed' });
}

  revalidatePath('/dashboard/hotel-guide');
  revalidatePath('/t/[tagCode]/guide', 'page');
  revalidatePath('/t/[tagCode]/pool', 'page');

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
  const iconKey = cleanText(formData.get('iconKey'), 80) || 'Info';
  const hours = cleanText(formData.get('hours'), 180);
  const location = cleanText(formData.get('location'), 180);
  const contact = cleanText(formData.get('contact'), 180);
  const mapUrl = cleanText(formData.get('mapUrl'), 700);
  const buttonLabel = cleanText(formData.get('buttonLabel'), 80);
  const buttonHref = cleanText(formData.get('buttonHref'), 300);
  const sortOrder = parseSortOrder(formData.get('sortOrder'));
  const isActive = formData.get('isActive') === 'true';
  const panoramaEnabled = formData.get('panoramaEnabled') === 'true';

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

  let uploadedPanoramaImageUrl: string | null = null;

try {
  const panorama = await resolvePanoramaImageUrl(formData);
  uploadedPanoramaImageUrl = panorama.uploadedPanoramaImageUrl;
  const cover = await resolveCoverImageUrl(formData);

  await db.hotelGuideItem.update({
    where: {
      id: item.id,
    },
    data: {
      title,
      subtitle: subtitle || null,
      content: content || null,
      itemType,
      imageUrl: cover.imageUrl,
      iconKey,
      panoramaEnabled: panoramaEnabled && Boolean(panorama.panoramaImageUrl),
      panoramaImageUrl: panorama.panoramaImageUrl,
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

  await deleteReplacedPanoramaImage(
    item.panoramaImageUrl,
    panorama.panoramaImageUrl
  );
} catch (error) {
  console.error(error);

  if (uploadedPanoramaImageUrl) {
    await deletePublicImageFile(uploadedPanoramaImageUrl);
  }

  redirectToGuide({ error: 'image-upload-failed' });
}

  revalidatePath('/dashboard/hotel-guide');
  revalidatePath('/t/[tagCode]/guide', 'page');
  revalidatePath('/t/[tagCode]/pool', 'page');

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

  const imageUrls = [
  item.imageUrl,
  item.panoramaImageUrl,
  ...item.galleryImages.map((image) => image.imageUrl),
].filter((imageUrl): imageUrl is string => Boolean(imageUrl));

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

  const imageFiles = formData
    .getAll('images')
    .filter((value): value is File => isUploadedFile(value));

  const legacyFile = formData.get('image');

  const files = imageFiles.length
    ? imageFiles
    : isUploadedFile(legacyFile)
      ? [legacyFile]
      : [];

  if (!sectionId && !itemId) {
    redirectToGuide({ error: 'section-required' });
  }

  if (!files.length) {
    redirectToGuide({ error: 'image-required' });
  }

  if (files.length > MAX_GUIDE_IMAGES_PER_UPLOAD) {
    redirectToGuide({ error: 'image-upload-failed' });
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

  const savedImageUrls: string[] = [];

  try {
    const imageRows = [];

    for (const [index, file] of files.entries()) {
      const imageUrl = await saveHotelGuideImageFile(file);

      savedImageUrls.push(imageUrl);

      imageRows.push({
        hotelId,
        sectionId: finalSectionId,
        itemId: finalItemId,
        title: getImageTitle({
          baseTitle: title,
          fileName: file.name,
          index,
          total: files.length,
        }),
        caption: caption || null,
        imageUrl,
        sortOrder: sortOrder + index,
        isActive,
      });
    }

    await db.hotelGuideImage.createMany({
      data: imageRows,
    });
  } catch (error) {
    console.error(error);

    await Promise.allSettled(
      savedImageUrls.map((imageUrl) => deletePublicImageFile(imageUrl))
    );

    redirectToGuide({ error: 'image-upload-failed' });
  }

  revalidatePath('/dashboard/hotel-guide');
  revalidatePath('/t/[tagCode]/guide', 'page');
  revalidatePath('/t/[tagCode]/pool', 'page');

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
  revalidatePath('/t/[tagCode]/guide', 'page');
  revalidatePath('/t/[tagCode]/pool', 'page');

  redirectToGuide({ success: 'image-deleted' });

}

export async function seedPoolGuideContentAction(formData: FormData) {
  const user = await requireUser();
  requireRole(user.role, [Role.SUPER_ADMIN, Role.HOTEL_ADMIN]);

  const hotelId = scopedHotelId(user, cleanText(formData.get('hotelId')));

  if (!hotelId) {
    redirectToGuide({ error: 'hotel-required' });
  }

  assertHotelScope(user, hotelId);

  const existingSection = await db.hotelGuideSection.findFirst({
    where: {
      hotelId,
      title: DEFAULT_POOL_SECTION.title,
    },
  });

  const sectionData = {
    hotelId,
    title: DEFAULT_POOL_SECTION.title,
    subtitle: DEFAULT_POOL_SECTION.subtitle,
    description: DEFAULT_POOL_SECTION.description,
    imageUrl: DEFAULT_POOL_SECTION.imageUrl,
    iconKey: DEFAULT_POOL_SECTION.iconKey,
    sortOrder: DEFAULT_POOL_SECTION.sortOrder,
    isActive: true,
  };

  const poolSection = existingSection
    ? await db.hotelGuideSection.update({
        where: {
          id: existingSection.id,
        },
        data: sectionData,
      })
    : await db.hotelGuideSection.create({
        data: sectionData,
      });

  for (const item of DEFAULT_POOL_SECTION.items) {
    const existingItem = await db.hotelGuideItem.findFirst({
      where: {
        hotelId,
        sectionId: poolSection.id,
        title: item.title,
      },
    });

    const itemData = {
      hotelId,
      sectionId: poolSection.id,
      title: item.title,
      subtitle: item.subtitle || null,
      content: item.content || null,
      itemType: item.itemType,
      imageUrl: item.imageUrl ?? null,
      iconKey: item.iconKey,
      hours: item.hours ?? null,
      location: item.location ?? null,
      contact: item.contact ?? null,
      mapUrl: item.mapUrl ?? null,
      buttonLabel: item.buttonLabel ?? null,
      buttonHref: item.buttonHref ?? null,
      sortOrder: item.sortOrder,
      isActive: true,
    };

    if (existingItem) {
      await db.hotelGuideItem.update({
        where: {
          id: existingItem.id,
        },
        data: itemData,
      });
    } else {
      await db.hotelGuideItem.create({
        data: itemData,
      });
    }
  }

  revalidatePath('/dashboard/hotel-guide');
  revalidatePath('/t/[tagCode]/pool', 'page');
  revalidatePath('/t/[tagCode]/guide', 'page');

  redirectToGuide({ success: 'pool-seeded' });
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