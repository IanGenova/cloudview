import { readFile, stat } from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type MenuMediaRouteContext = {
  params: Promise<{
    fileName: string;
  }>;
};

const contentTypes: Record<string, string> = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

function getMenuMediaDirectory() {
  return path.resolve(
    process.env.MENU_UPLOAD_DIR?.trim() ||
      '/var/www/cloudview-media/menu'
  );
}

function resolveSafeFile(rawFileName: string) {
  let fileName = '';

  try {
    fileName = decodeURIComponent(rawFileName);
  } catch {
    return null;
  }

  if (
    !fileName ||
    fileName !== path.basename(fileName) ||
    fileName.includes('\0') ||
    fileName.includes('/') ||
    fileName.includes('\\') ||
    !/^[a-zA-Z0-9._-]+$/.test(fileName)
  ) {
    return null;
  }

  const extension = path.extname(fileName).toLowerCase();
  const contentType = contentTypes[extension];

  if (!contentType) {
    return null;
  }

  const mediaDirectory = getMenuMediaDirectory();
  const filePath = path.resolve(mediaDirectory, fileName);
  const requiredPrefix = `${mediaDirectory}${path.sep}`;

  if (!filePath.startsWith(requiredPrefix)) {
    return null;
  }

  return {
    fileName,
    filePath,
    contentType,
  };
}

async function loadMenuImage(rawFileName: string) {
  const resolved = resolveSafeFile(rawFileName);

  if (!resolved) {
    return null;
  }

  try {
    const [file, information] = await Promise.all([
      readFile(resolved.filePath),
      stat(resolved.filePath),
    ]);

    if (!information.isFile()) {
      return null;
    }

    return {
      body: new Uint8Array(file),
      contentType: resolved.contentType,
      size: information.size,
      etag: `"${information.size.toString(16)}-${Math.trunc(
        information.mtimeMs
      ).toString(16)}"`,
      lastModified: information.mtime.toUTCString(),
    };
  } catch (error) {
    const code =
      error instanceof Error && 'code' in error
        ? String((error as NodeJS.ErrnoException).code)
        : '';

    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return null;
    }

    console.error('Unable to load menu image:', error);
    throw error;
  }
}

function createHeaders(
  image: NonNullable<
    Awaited<ReturnType<typeof loadMenuImage>>
  >
) {
  return new Headers({
    'Cache-Control':
      'public, max-age=31536000, immutable',
    'Content-Length': String(image.size),
    'Content-Type': image.contentType,
    ETag: image.etag,
    'Last-Modified': image.lastModified,
    'X-CloudView-Menu-Media':
      'root-runtime-route',
    'X-Content-Type-Options': 'nosniff',
  });
}

export async function GET(
  request: Request,
  { params }: MenuMediaRouteContext
) {
  const { fileName } = await params;
  const image = await loadMenuImage(fileName);

  if (!image) {
    return new Response('Menu image not found.', {
      status: 404,
      headers: {
        'Cache-Control': 'no-store',
        'X-CloudView-Menu-Media':
          'root-runtime-route',
      },
    });
  }

  const headers = createHeaders(image);

  if (
    request.headers.get('if-none-match') === image.etag
  ) {
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
  { params }: MenuMediaRouteContext
) {
  const { fileName } = await params;
  const image = await loadMenuImage(fileName);

  if (!image) {
    return new Response(null, {
      status: 404,
      headers: {
        'Cache-Control': 'no-store',
        'X-CloudView-Menu-Media':
          'root-runtime-route',
      },
    });
  }

  return new Response(null, {
    status: 200,
    headers: createHeaders(image),
  });
}
