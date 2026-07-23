import {
  existsSync,
  readFileSync,
} from 'fs';

import {
  readdir,
  stat,
} from 'fs/promises';

import path from 'path';

function loadEnvironmentFile(filePath: string, override = false) {
  if (!existsSync(filePath)) {
    return;
  }

  const contents = readFileSync(filePath, 'utf8');

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();

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

    if (
      override ||
      typeof process.env[key] === 'undefined'
    ) {
      process.env[key] = value;
    }
  }
}

loadEnvironmentFile('.env');
loadEnvironmentFile('.env.production.local', true);
loadEnvironmentFile('.env.local', true);

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

function tokenize(value: string) {
  return slugify(value)
    .split('-')
    .filter((token) => token.length >= 2);
}

function publicUrlFor(fileName: string) {
  return `/uploads/menu/${fileName}`;
}

function fileNameFromUrl(url: string | null | undefined) {
  if (!url) {
    return null;
  }

  try {
    if (
      url.startsWith('http://') ||
      url.startsWith('https://')
    ) {
      const parsed = new URL(url);
      return path.basename(parsed.pathname);
    }

    return path.basename(url.split('?')[0]);
  } catch {
    return path.basename(url.split('?')[0]);
  }
}

type MenuFile = {
  fileName: string;
  slug: string;
  modifiedAt: number;
};

async function main() {
  const uploadDirectory =
    process.env.MENU_UPLOAD_DIR?.trim() ||
    '/var/www/cloudview-uploads/menu';

  console.log(`Upload directory: ${uploadDirectory}`);

  const directoryEntries = await readdir(
    uploadDirectory,
    {
      withFileTypes: true,
    }
  );

  const menuFiles: MenuFile[] = [];

  for (const entry of directoryEntries) {
    if (!entry.isFile()) {
      continue;
    }

    const extension = path
      .extname(entry.name)
      .toLowerCase();

    if (
      ![
        '.jpg',
        '.jpeg',
        '.png',
        '.webp',
        '.gif',
        '.avif',
      ].includes(extension)
    ) {
      continue;
    }

    const filePath = path.join(
      uploadDirectory,
      entry.name
    );

    const fileStat = await stat(filePath);

    menuFiles.push({
      fileName: entry.name,
      slug: slugify(
        path.basename(entry.name, extension)
      ),
      modifiedAt: fileStat.mtimeMs,
    });
  }

  menuFiles.sort(
    (left, right) =>
      right.modifiedAt - left.modifiedAt
  );

  console.log(
    `Found ${menuFiles.length} physical menu image(s).`
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
  let alreadyValid = 0;
  let unmatched = 0;

  for (const product of products) {
    const relatedUrl =
      product.images[0]?.url || null;

    const currentUrl =
      relatedUrl ||
      product.imageUrl ||
      null;

    const currentFileName =
      fileNameFromUrl(currentUrl);

    const currentPhysicalFile =
      currentFileName
        ? path.join(
            uploadDirectory,
            currentFileName
          )
        : null;

    if (
      currentPhysicalFile &&
      existsSync(currentPhysicalFile)
    ) {
      const normalizedUrl =
        publicUrlFor(currentFileName!);

      const needsSynchronization =
        product.imageUrl !== normalizedUrl ||
        product.images.length !== 1 ||
        product.images[0]?.url !== normalizedUrl;

      if (needsSynchronization) {
        await db.$transaction(async (tx) => {
          await tx.menuProduct.update({
            where: {
              id: product.id,
            },
            data: {
              imageUrl: normalizedUrl,
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
              url: normalizedUrl,
              alt: product.name,
              sortOrder: 0,
            },
          });
        });

        console.log(
          `SYNCED: ${product.name} -> ${normalizedUrl}`
        );

        repaired += 1;
      } else {
        console.log(
          `OK: ${product.name} -> ${normalizedUrl}`
        );

        alreadyValid += 1;
      }

      continue;
    }

    const productSlug = slugify(product.name);
    const productTokens = tokenize(product.name);

    let matches = menuFiles.filter((file) => {
      return (
        file.slug === productSlug ||
        file.slug.startsWith(`${productSlug}-`) ||
        file.slug.includes(productSlug)
      );
    });

    if (!matches.length && productTokens.length) {
      matches = menuFiles
        .map((file) => {
          const score = productTokens.reduce(
            (total, token) => {
              return total +
                (file.slug.includes(token) ? 1 : 0);
            },
            0
          );

          return {
            file,
            score,
          };
        })
        .filter(
          ({ score }) =>
            score === productTokens.length
        )
        .sort((left, right) => {
          if (right.score !== left.score) {
            return right.score - left.score;
          }

          return (
            right.file.modifiedAt -
            left.file.modifiedAt
          );
        })
        .map(({ file }) => file);
    }

    const selectedFile = matches[0];

    if (!selectedFile) {
      console.log(
        `UNMATCHED: ${product.name} — no physical image found`
      );

      unmatched += 1;
      continue;
    }

    const repairedUrl = publicUrlFor(
      selectedFile.fileName
    );

    await db.$transaction(async (tx) => {
      await tx.menuProduct.update({
        where: {
          id: product.id,
        },
        data: {
          imageUrl: repairedUrl,
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
          url: repairedUrl,
          alt: product.name,
          sortOrder: 0,
        },
      });
    });

    console.log(
      `REPAIRED: ${product.name} -> ${repairedUrl}`
    );

    repaired += 1;
  }

  console.log('');
  console.log('Repair summary');
  console.log('--------------');
  console.log(`Products checked: ${products.length}`);
  console.log(`Repaired: ${repaired}`);
  console.log(`Already valid: ${alreadyValid}`);
  console.log(`Unmatched: ${unmatched}`);

  await db.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
