import {
  existsSync,
  readFileSync,
} from 'fs';

import {
  readdir,
  stat,
} from 'fs/promises';

import path from 'path';

function loadEnvironment(filePath: string) {
  if (!existsSync(filePath)) {
    return;
  }

  const contents = readFileSync(filePath, 'utf8');

  for (const originalLine of contents.split(/\r?\n/)) {
    const line = originalLine.trim();

    if (
      !line ||
      line.startsWith('#') ||
      !line.includes('=')
    ) {
      continue;
    }

    const separator = line.indexOf('=');
    const key = line.slice(0, separator).trim();

    let value = line.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (typeof process.env[key] === 'undefined') {
      process.env[key] = value;
    }
  }
}

loadEnvironment('.env');
loadEnvironment('.env.production.local');
loadEnvironment('.env.local');

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

function extractFileName(
  url: string | null | undefined
) {
  if (!url) {
    return null;
  }

  try {
    if (
      url.startsWith('http://') ||
      url.startsWith('https://')
    ) {
      return path.basename(
        new URL(url).pathname
      );
    }

    return path.basename(
      url.split('?')[0]
    );
  } catch {
    return path.basename(
      url.split('?')[0]
    );
  }
}

async function main() {
  const mediaDirectory = path.resolve(
    process.env.MENU_UPLOAD_DIR?.trim() ||
      '/var/www/cloudview-media/menu'
  );

  const entries = await readdir(
    mediaDirectory,
    {
      withFileTypes: true,
    }
  );

  const files: Array<{
    fileName: string;
    slug: string;
    modifiedAt: number;
  }> = [];

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const extension = path
      .extname(entry.name)
      .toLowerCase();

    if (
      ![
        '.avif',
        '.gif',
        '.jpeg',
        '.jpg',
        '.png',
        '.webp',
      ].includes(extension)
    ) {
      continue;
    }

    const fileInformation = await stat(
      path.join(mediaDirectory, entry.name)
    );

    files.push({
      fileName: entry.name,
      slug: slugify(
        path.basename(entry.name, extension)
      ),
      modifiedAt: fileInformation.mtimeMs,
    });
  }

  files.sort(
    (left, right) =>
      right.modifiedAt - left.modifiedAt
  );

  const filesByName = new Map(
    files.map((file) => [
      file.fileName,
      file,
    ])
  );

  const { db } = await import('../src/lib/db');

  const products = await db.menuProduct.findMany({
    select: {
      id: true,
      name: true,
      imageUrl: true,
      images: {
        select: {
          id: true,
          url: true,
          sortOrder: true,
        },
        orderBy: {
          sortOrder: 'asc',
        },
      },
    },
    orderBy: {
      name: 'asc',
    },
  });

  let repaired = 0;
  let unmatched = 0;

  for (const product of products) {
    const storedUrls = [
      ...product.images.map(
        (image) => image.url
      ),
      product.imageUrl,
    ].filter(
      (value): value is string =>
        Boolean(value)
    );

    let selectedFile = null as
      | (typeof files)[number]
      | null;

    for (const storedUrl of storedUrls) {
      const fileName =
        extractFileName(storedUrl);

      if (
        fileName &&
        filesByName.has(fileName)
      ) {
        selectedFile =
          filesByName.get(fileName) || null;

        break;
      }
    }

    if (!selectedFile) {
      const productSlug =
        slugify(product.name);

      selectedFile =
        files.find((file) => {
          return (
            file.slug === productSlug ||
            file.slug.startsWith(
              `${productSlug}-`
            )
          );
        }) || null;
    }

    if (!selectedFile) {
      console.log(
        `UNMATCHED: ${product.name}`
      );

      unmatched += 1;
      continue;
    }

    const publicUrl =
      `/api/menu-media/${selectedFile.fileName}`;

    await db.$transaction(async (tx) => {
      await tx.menuProduct.update({
        where: {
          id: product.id,
        },
        data: {
          imageUrl: publicUrl,
        },
      });

      await tx.productImage.deleteMany({
        where: {
          productId: product.id,
        },
      });

      await tx.productImage.create({
        data: {
          productId: product.id,
          url: publicUrl,
          alt: product.name,
          sortOrder: 0,
        },
      });
    });

    console.log(
      `REPAIRED: ${product.name} -> ${publicUrl}`
    );

    repaired += 1;
  }

  console.log('');
  console.log(`Products checked: ${products.length}`);
  console.log(`Products repaired: ${repaired}`);
  console.log(`Products unmatched: ${unmatched}`);

  await db.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
