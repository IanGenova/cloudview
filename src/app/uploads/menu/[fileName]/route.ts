import { readFile, stat } from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type MenuImageRouteContext = {
  params: Promise<{
    fileName: string;
  }>;
};

const contentTypes: Record<string, string> = {
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

function getMenuUploadDirectory() {
  const configuredDirectory = process.env.MENU_UPLOAD_DIR?.trim();

  if (configuredDirectory) {
    return path.resolve(configuredDirectory);
  }

  return path.join(process.cwd(), 'storage', 'menu-images');
}

function normalizeFileName(value: string) {
  let decodedValue = value;

  try {
    decodedValue = decodeURIComponent(value);
  } catch {
    return null;
  }

  if (
    !decodedValue ||
    decodedValue !== path.basename(decodedValue) ||
    decodedValue.includes('\0') ||
    !/^[a-zA-Z0-9._-]+$/.test(decodedValue)
  ) {
    return null;
  }

  const extension = path.extname(decodedValue).toLowerCase();

  if (!contentTypes[extension]) {
    return null;
  }

  return decodedValue;
}

async function resolveImage(fileName: string) {
  const safeFileName = normalizeFileName(fileName);

  if (!safeFileName) {
    return null;
  }

  const uploadDirectory = getMenuUploadDirectory();
  const filePath = path.join(uploadDirectory, safeFileName);
  const resolvedFilePath = path.resolve(filePath);
  const resolvedUploadDirectory = `${path.resolve(uploadDirectory)}${path.sep}`;

  if (!resolvedFilePath.startsWith(resolvedUploadDirectory)) {
    return null;
  }

  try {
    const [file, fileStat] = await Promise.all([
      readFile(resolvedFilePath),
      stat(resolvedFilePath),
    ]);

    if (!fileStat.isFile()) {
      return null;
    }

    const extension = path.extname(safeFileName).toLowerCase();
    const etag = `"${fileStat.size.toString(16)}-${Math.trunc(
      fileStat.mtimeMs
    ).toString(16)}"`;

    return {
      body: new Uint8Array(file),
      contentType: contentTypes[extension],
      etag,
      lastModified: fileStat.mtime.toUTCString(),
      size: fileStat.size,
    };
  } catch (error) {
    const errorCode =
      error instanceof Error && 'code' in error
        ? String((error as NodeJS.ErrnoException).code)
        : '';

    if (errorCode === 'ENOENT' || errorCode === 'ENOTDIR') {
      return null;
    }

    console.error('Unable to read menu image:', error);
    throw error;
  }
}

function createHeaders(image: NonNullable<Awaited<ReturnType<typeof resolveImage>>>) {
  return new Headers({
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Content-Length': String(image.size),
    'Content-Type': image.contentType,
    ETag: image.etag,
    'Last-Modified': image.lastModified,
    'X-CloudView-Image-Source': 'runtime-storage',
  });
}

export async function GET(
  request: Request,
  { params }: MenuImageRouteContext
) {
  const { fileName } = await params;
  const image = await resolveImage(fileName);

  if (!image) {
    return new Response('Menu image not found.', {
      status: 404,
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  }

  const headers = createHeaders(image);

  if (request.headers.get('if-none-match') === image.etag) {
    return new Response(null, {
      status: 304,
      headers,
    });
  }

  return new Response(image.body, {
    status: 200,
    headers,
  });
}

export async function HEAD(
  _request: Request,
  { params }: MenuImageRouteContext
) {
  const { fileName } = await params;
  const image = await resolveImage(fileName);

  if (!image) {
    return new Response(null, {
      status: 404,
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  }

  return new Response(null, {
    status: 200,
    headers: createHeaders(image),
  });
}
