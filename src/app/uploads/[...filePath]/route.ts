import {
  readFile,
  stat,
} from 'fs/promises';

import path from 'path';

import {
  getRuntimeMediaRoot,
  RUNTIME_MEDIA_FOLDERS,
} from '@/lib/runtime-media-storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type UploadRouteContext = {
  params: Promise<{
    filePath: string[];
  }>;
};

const allowedFolders = new Set<string>(
  RUNTIME_MEDIA_FOLDERS
);

const contentTypes: Record<string, string> = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function resolveSafeUploadPath(
  rawSegments: string[]
) {
  if (
    !Array.isArray(rawSegments) ||
    rawSegments.length < 2
  ) {
    return null;
  }

  const segments: string[] = [];

  for (const rawSegment of rawSegments) {
    let segment = '';

    try {
      segment =
        decodeURIComponent(rawSegment);
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

  const folder = segments[0];

  if (!allowedFolders.has(folder)) {
    return null;
  }

  const extension = path
    .extname(segments.at(-1) || '')
    .toLowerCase();

  const contentType =
    contentTypes[extension];

  if (!contentType) {
    return null;
  }

  const mediaRoot =
    getRuntimeMediaRoot();

  const filePath = path.resolve(
    mediaRoot,
    ...segments
  );

  const folderRoot = path.resolve(
    mediaRoot,
    folder
  );

  const allowedPrefix =
    `${folderRoot}${path.sep}`;

  if (!filePath.startsWith(allowedPrefix)) {
    return null;
  }

  return {
    filePath,
    contentType,
  };
}

async function loadUpload(
  rawSegments: string[]
) {
  const resolved =
    resolveSafeUploadPath(rawSegments);

  if (!resolved) {
    return null;
  }

  try {
    const [file, information] =
      await Promise.all([
        readFile(resolved.filePath),
        stat(resolved.filePath),
      ]);

    if (!information.isFile()) {
      return null;
    }

    return {
      body: new Uint8Array(file),
      contentType:
        resolved.contentType,
      size: information.size,
      etag:
        `"${information.size.toString(16)}-` +
        `${Math.trunc(
          information.mtimeMs
        ).toString(16)}"`,
      lastModified:
        information.mtime.toUTCString(),
    };
  } catch (error) {
    const errorCode =
      error instanceof Error &&
      'code' in error
        ? String(
            (
              error as
                NodeJS.ErrnoException
            ).code
          )
        : '';

    if (
      errorCode === 'ENOENT' ||
      errorCode === 'ENOTDIR'
    ) {
      return null;
    }

    console.error(
      'Unable to serve runtime upload:',
      error
    );

    throw error;
  }
}

function createHeaders(
  upload: NonNullable<
    Awaited<
      ReturnType<typeof loadUpload>
    >
  >
) {
  return new Headers({
    'Cache-Control':
      'public, max-age=300, ' +
      'stale-while-revalidate=60',

    'Content-Length':
      String(upload.size),

    'Content-Type':
      upload.contentType,

    ETag: upload.etag,

    'Last-Modified':
      upload.lastModified,

    'X-CloudView-Media':
      'root-runtime-route',

    'X-Content-Type-Options':
      'nosniff',
  });
}

export async function GET(
  request: Request,
  { params }: UploadRouteContext
) {
  const { filePath } = await params;

  const upload =
    await loadUpload(filePath);

  if (!upload) {
    return new Response(
      'Uploaded file not found.',
      {
        status: 404,
        headers: {
          'Cache-Control': 'no-store',
          'X-CloudView-Media':
            'root-runtime-route',
        },
      }
    );
  }

  const headers =
    createHeaders(upload);

  if (
    request.headers.get(
      'if-none-match'
    ) === upload.etag
  ) {
    return new Response(null, {
      status: 304,
      headers,
    });
  }

  return new Response(
    upload.body,
    {
      status: 200,
      headers,
    }
  );
}

export async function HEAD(
  _request: Request,
  { params }: UploadRouteContext
) {
  const { filePath } = await params;

  const upload =
    await loadUpload(filePath);

  if (!upload) {
    return new Response(null, {
      status: 404,
      headers: {
        'Cache-Control': 'no-store',
        'X-CloudView-Media':
          'root-runtime-route',
      },
    });
  }

  return new Response(null, {
    status: 200,
    headers:
      createHeaders(upload),
  });
}
