import path from 'path';

export const RUNTIME_MEDIA_FOLDERS = [
  'menu',
  'hotel-guide',
  'hotel-settings',
  'images',
  'service-requests',
  'service-request-paymongo',
] as const;

export type RuntimeMediaFolder =
  (typeof RUNTIME_MEDIA_FOLDERS)[number];

const allowedFolders = new Set<string>(
  RUNTIME_MEDIA_FOLDERS
);

export function getRuntimeMediaRoot() {
  const configured =
    process.env.CLOUDVIEW_MEDIA_ROOT?.trim();

  if (configured) {
    return path.resolve(configured);
  }

  /*
   * The default is a Linux deployment path. On a developer machine it
   * resolves to something like D:arwwwcloudview-media, which does not
   * exist, so every uploaded image 404s and the portal renders dishes with
   * no photo. Outside production, fall back to the repository own
   * public/uploads directory.
   *
   * Production keeps the deployment path deliberately: a server missing its
   * media root should fail visibly rather than quietly serve whatever image
   * happens to be baked into the build.
   */
  if (process.env.NODE_ENV !== 'production') {
    return path.resolve(
      process.cwd(),
      'public',
      'uploads'
    );
  }

  return path.resolve('/var/www/cloudview-media');
}

export function getRuntimeMediaDirectory(
  folder: RuntimeMediaFolder
) {
  if (!allowedFolders.has(folder)) {
    throw new Error(
      `Unsupported runtime media folder: ${folder}`
    );
  }

  return path.join(
    getRuntimeMediaRoot(),
    folder
  );
}

export function resolveRuntimeMediaPathFromUrl(
  imageUrl: string
) {
  let pathname = '';

  try {
    pathname = new URL(
      imageUrl,
      'http://cloudview.local'
    ).pathname;
  } catch {
    return null;
  }

  const segments = pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return '';
      }
    });

  if (
    segments.length < 3 ||
    segments[0] !== 'uploads'
  ) {
    return null;
  }

  const folder = segments[1];

  if (!allowedFolders.has(folder)) {
    return null;
  }

  const relativeSegments = segments.slice(2);

  if (
    relativeSegments.some(
      (segment) =>
        !segment ||
        segment === '.' ||
        segment === '..' ||
        segment.includes('\0') ||
        segment.includes('/') ||
        segment.includes('\\')
    )
  ) {
    return null;
  }

  const root = getRuntimeMediaRoot();
  const resolved = path.resolve(
    root,
    folder,
    ...relativeSegments
  );

  const allowedPrefix = `${path.resolve(
    root,
    folder
  )}${path.sep}`;

  if (!resolved.startsWith(allowedPrefix)) {
    return null;
  }

  return resolved;
}
