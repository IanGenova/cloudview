import { getRuntimeMediaDirectory } from '@/lib/runtime-media-storage';
import { randomUUID } from 'crypto';
import path from 'path';
import { mkdir, writeFile, unlink } from 'fs/promises';
import { ServiceRequestAttachmentType } from '@prisma/client';
import { db } from '@/lib/db';

const MAX_SERVICE_REQUEST_IMAGES = 5;
const MAX_SERVICE_REQUEST_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

function isUploadFile(value: FormDataEntryValue): value is File {
  return (
    typeof value === 'object' &&
    value !== null &&
    'arrayBuffer' in value &&
    'name' in value &&
    'type' in value &&
    'size' in value
  );
}

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
}

function getImageExtension(mimeType: string) {
  if (mimeType === 'image/jpeg') {
    return 'jpg';
  }

  if (mimeType === 'image/png') {
    return 'png';
  }

  if (mimeType === 'image/webp') {
    return 'webp';
  }

  return null;
}

export function getServiceRequestImageFiles(
  formData: FormData,
  fieldName = 'attachments'
) {
  const files = formData
    .getAll(fieldName)
    .filter(isUploadFile)
    .filter((file) => file.size > 0);

  return files.slice(0, MAX_SERVICE_REQUEST_IMAGES);
}

export function validateServiceRequestImageFile(file: File) {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error(
      'Invalid image type. Please upload JPG, PNG, or WEBP images only.'
    );
  }

  if (file.size > MAX_SERVICE_REQUEST_IMAGE_SIZE_BYTES) {
    throw new Error('Image is too large. Maximum size is 5MB per image.');
  }

  const extension = getImageExtension(file.type);

  if (!extension) {
    throw new Error('Unsupported image format.');
  }

  return {
    extension,
  };
}

export async function saveServiceRequestImageFile(params: {
  hotelId: string;
  requestId?: string | null;
  requestCode?: string | null;
  file: File;
  attachmentType?: ServiceRequestAttachmentType;
  uploadedById?: string | null;
  uploadedByGuest?: boolean;
  caption?: string | null;
}) {
  const { extension } = validateServiceRequestImageFile(params.file);

  const safeHotelId = safeSegment(params.hotelId);
  const safeRequestFolder = safeSegment(
    params.requestCode || params.requestId || 'unassigned'
  );

  const uploadDir = path.join(getRuntimeMediaDirectory('service-requests'),
    safeHotelId,
    safeRequestFolder
  );

  await mkdir(uploadDir, {
    recursive: true,
  });

  const fileName = `${randomUUID()}.${extension}`;
  const filePath = path.join(uploadDir, fileName);

  const arrayBuffer = await params.file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  await writeFile(filePath, buffer);

  const imageUrl = `/uploads/service-requests/${safeHotelId}/${safeRequestFolder}/${fileName}`;

  try {
    return await db.serviceRequestAttachment.create({
      data: {
        hotelId: params.hotelId,
        requestId: params.requestId || null,
        requestCode: params.requestCode || null,
        imageUrl,
        originalName: params.file.name || null,
        mimeType: params.file.type,
        sizeBytes: params.file.size,
        caption: params.caption || null,
        attachmentType:
          params.attachmentType ?? ServiceRequestAttachmentType.GUEST_UPLOAD,
        uploadedById: params.uploadedById || null,
        uploadedByGuest: Boolean(params.uploadedByGuest),
      },
    });
  } catch (error) {
    await unlink(filePath).catch(() => {
      // Ignore cleanup failure.
    });

    throw error;
  }
}

export async function saveServiceRequestImageFiles(params: {
  hotelId: string;
  requestId?: string | null;
  requestCode?: string | null;
  files: File[];
  attachmentType?: ServiceRequestAttachmentType;
  uploadedById?: string | null;
  uploadedByGuest?: boolean;
  caption?: string | null;
}) {
  if (params.files.length > MAX_SERVICE_REQUEST_IMAGES) {
    throw new Error(`You can upload up to ${MAX_SERVICE_REQUEST_IMAGES} images only.`);
  }

  const saved = [];

  for (const file of params.files) {
    const attachment = await saveServiceRequestImageFile({
      hotelId: params.hotelId,
      requestId: params.requestId,
      requestCode: params.requestCode,
      file,
      attachmentType: params.attachmentType,
      uploadedById: params.uploadedById,
      uploadedByGuest: params.uploadedByGuest,
      caption: params.caption,
    });

    saved.push(attachment);
  }

  return saved;
}