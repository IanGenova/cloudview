import { readFile, stat } from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{
    filePath: string[];
  }>;
};

const allowedFolders = new Set([
  'menu',
  'hotel-guide',
  'hotel-settings',
  'images',
  'service-requests',
  'service-request-paymongo',
]);

const contentTypes: Record<string, string> = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

function getUploadRoot() {
  return path.resolve(
    process.env.UPLOADS_ROOT_DIR?.trim() ||
      '/var/www/cloudview-uploads'
  );
}

function resolveSafeFile(
  rawSegments: string[]
): {
  filePath: string;
  contentType: string;
} | null {
  if (!Array.isArray(rawSegments) || rawSegments.length < 2) {
    return null;
  }

  const segments: string[] = [];

  for (const rawSegment of rawSegments) {
    let segment = '';

    try {
      segment = decodeURIComponent(rawSegment);
    } catch {
      return null;
    }

    if (
      !segment ||
      segment === '.' ||
      segment === '..' ||
      segment.includes('\0') ||
      segment.includes('/') ||
      segment.includes('\\')
    ) {
      return null;
    }

    segments.push(segment);
  }

  if (!allowedFolders.has(segments[0])) {
    return null;
  }

  const extension = path
    .extname(segments.at(-1) || '')
    .toLowerCase();

  const contentType = contentTypes[extension];

  if (!contentType) {
    return null;
  }

  const uploadRoot = getUploadRoot();
  const filePath = path.resolve(uploadRoot, ...segments);
  const requiredPrefix = `${uploadRoot}${path.sep}`;

  if (!filePath.startsWith(requiredPrefix)) {
    return null;
  }

  return {
    filePath,
    contentType,
  };
}

async function loadUpload(rawSegments: string[]) {
  const resolved = resolveSafeFile(rawSegments);

  if (!resolved) {
    return null;
  }

  try {
    const [file, fileInformation] = await Promise.all([
      readFile(resolved.filePath),
      stat(resolved.filePath),
    ]);

    if (!fileInformation.isFile()) {
      return null;
    }

    return {
      body: new Uint8Array(file),
      contentType: resolved.contentType,
      size: fileInformation.size,
      etag: `"${fileInformation.size.toString(16)}-${Math.trunc(
        fileInformation.mtimeMs
      ).toString(16)}"`,
      lastModified: fileInformation.mtime.toUTCString(),
    };
  } catch (error) {
    const errorCode =
      error instanceof Error && 'code' in error
        ? String((error as NodeJS.ErrnoException).code)
        : '';

    if (
      errorCode === 'ENOENT' ||
      errorCode === 'ENOTDIR'
    ) {
      return null;
    }

    console.error('Unable to serve uploaded file:', error);

    throw error;
  }
}

function createResponseHeaders(
  file: NonNullable<Awaited<ReturnType<typeof loadUpload>>>
) {
  return new Headers({
    'Cache-Control':
      'public, max-age=300, stale-while-revalidate=60',
    'Content-Length': String(file.size),
    'Content-Type': file.contentType,
    ETag: file.etag,
    'Last-Modified': file.lastModified,
    'X-CloudView-Upload-Source':
      'root-runtime-storage',
    'X-Content-Type-Options': 'nosniff',
  });
}

export async function GET(
  request: Request,
  { params }: RouteContext
) {
  const { filePath } = await params;
  const file = await loadUpload(filePath);

  if (!file) {
    return new Response('Uploaded file not found.', {
      status: 404,
      headers: {
        'Cache-Control': 'no-store',
        'X-CloudView-Upload-Source':
          'root-runtime-storage',
      },
    });
  }

  const headers = createResponseHeaders(file);

  if (
    request.headers.get('if-none-match') === file.etag
  ) {
    return new Response(null, {
      status: 304,
      headers,
    });
  }

  return new Response(file.body, {
    status: 200,
    headers,
  });
}

export async function HEAD(
  _request: Request,
  { params }: RouteContext
) {
  const { filePath } = await params;
  const file = await loadUpload(filePath);

  if (!file) {
    return new Response(null, {
      status: 404,
      headers: {
        'Cache-Control': 'no-store',
        'X-CloudView-Upload-Source':
          'root-runtime-storage',
      },
    });
  }

  return new Response(null, {
    status: 200,
    headers: createResponseHeaders(file),
  });
}
