'use server';

import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { revalidatePath } from 'next/cache';
import { DashboardModule, MenuProductType, type Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { requireDashboardPermission } from '@/lib/dashboard-permissions';

const categorySchema = z.object({
  hotelId: z.string().min(1),
  name: z.string().min(1).max(120),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

const updateCategorySchema = z.object({
  categoryId: z.string().min(1),
  name: z.string().min(1).max(120),
  sortOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(false),
});

const productSchema = z.object({
  categoryId: z.string().min(1),
  productType: z.nativeEnum(MenuProductType).default(MenuProductType.SINGLE),
  name: z.string().min(1).max(160),
  price: z.coerce.number().min(0),
  imageUrl: z.string().optional(),
  prepTimeMinutes: z.coerce.number().int().min(0).default(15),
  description: z.string().optional(),
  isAvailable: z.boolean().default(false),
});

const updateProductSchema = productSchema.extend({
  productId: z.string().min(1),
});

type BundleComponentInput = {
  componentProductId: string;
  quantity: number;
  sortOrder: number;
};

function cleanText(value: FormDataEntryValue | null, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function finishMenuAction(success: string) {
  revalidatePath('/dashboard/menu');
  revalidatePath('/dashboard/inventory');
  revalidatePath('/dashboard/pos');
  revalidatePath('/t/[tagCode]/menu', 'page');

  return {
    ok: true,
    success,
  };
}

function menuErrorMessage(error: string) {
  switch (error) {
    case 'category-required':
      return 'Menu category details are required.';
    case 'category-not-found':
      return 'Menu category was not found.';
    case 'category-has-products':
      return 'This category still has products. Move or delete the products first.';
    case 'product-required':
      return 'Menu item details are required.';
    case 'product-not-found':
      return 'Menu item was not found.';
    case 'invalid-image-type':
      return 'Please upload a JPG, PNG, WEBP, or GIF image only.';
    case 'image-too-large':
      return 'Product image is too large. Maximum file size is 5 MB.';
    case 'bundle-components-required':
      return 'Bundle products must include at least one component item.';
    case 'bundle-self-component':
      return 'A bundle cannot include itself as a component.';
    case 'nested-bundle-not-supported':
      return 'Bundle products cannot be used inside another bundle.';
    case 'unauthorized':
      return 'You are not allowed to manage this hotel.';
    default:
      return 'Menu action failed. Please try again.';
  }
}

function throwMenuError(error: string): never {
  throw new Error(menuErrorMessage(error));
}

function parseCategoryForm(formData: FormData) {
  const parsed = categorySchema.safeParse({
    hotelId: formData.get('hotelId'),
    name: cleanText(formData.get('name'), 120),
    sortOrder: formData.get('sortOrder') || 0,
  });

  if (!parsed.success) {
    throwMenuError('category-required');
  }

  return parsed.data;
}

function parseUpdateCategoryForm(formData: FormData) {
  const parsed = updateCategorySchema.safeParse({
    categoryId: formData.get('categoryId'),
    name: cleanText(formData.get('name'), 120),
    sortOrder: formData.get('sortOrder') || 0,
    isActive: formData.get('isActive') === 'on',
  });

  if (!parsed.success) {
    throwMenuError('category-required');
  }

  return parsed.data;
}

function parseProductForm(formData: FormData) {
  const parsed = productSchema.safeParse({
    categoryId: formData.get('categoryId'),
    productType: formData.get('productType') || MenuProductType.SINGLE,
    name: cleanText(formData.get('name'), 160),
    price: formData.get('price') || 0,
    imageUrl: cleanText(formData.get('imageUrl'), 500),
    prepTimeMinutes: formData.get('prepTimeMinutes') || 15,
    description: cleanText(formData.get('description'), 1000),
    isAvailable: formData.get('isAvailable') === 'on',
  });

  if (!parsed.success) {
    throwMenuError('product-required');
  }

  return parsed.data;
}

function parseUpdateProductForm(formData: FormData) {
  const parsed = updateProductSchema.safeParse({
    productId: formData.get('productId'),
    categoryId: formData.get('categoryId'),
    productType: formData.get('productType') || MenuProductType.SINGLE,
    name: cleanText(formData.get('name'), 160),
    price: formData.get('price') || 0,
    imageUrl: cleanText(formData.get('imageUrl'), 500),
    prepTimeMinutes: formData.get('prepTimeMinutes') || 15,
    description: cleanText(formData.get('description'), 1000),
    isAvailable: formData.get('isAvailable') === 'on',
  });

  if (!parsed.success) {
    throwMenuError('product-required');
  }

  return parsed.data;
}

async function saveProductImage(file: File | null, productName: string) {
  if (!file || file.size === 0) {
    return null;
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

  if (!allowedTypes.includes(file.type)) {
    throwMenuError('invalid-image-type');
  }

  const maxSize = 5 * 1024 * 1024;

  if (file.size > maxSize) {
    throwMenuError('image-too-large');
  }

  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const safeName = slugify(productName || 'menu-product');
  const fileName = `${safeName}-${Date.now()}.${extension}`;

  const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'menu');
  await mkdir(uploadDir, { recursive: true });

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  await writeFile(path.join(uploadDir, fileName), buffer);

  return `/uploads/menu/${fileName}`;
}

async function assertHotelAccess(hotelId: string) {
  const user = await requireUser();

  if (user.role !== 'SUPER_ADMIN' && user.hotelId !== hotelId) {
    throwMenuError('unauthorized');
  }

  return user;
}

function readBundleComponentsFromFormData(formData: FormData) {
  const componentIds = formData.getAll('bundleComponentProductId');
  const componentQuantities = formData.getAll('bundleComponentQuantity');

  const componentMap = new Map<string, BundleComponentInput>();

  componentIds.forEach((rawComponentId, index) => {
    const componentProductId = cleanText(rawComponentId, 100);

    if (!componentProductId) {
      return;
    }

    const rawQuantity = componentQuantities[index];
    const quantity = Number(rawQuantity || 1);

    if (!Number.isInteger(quantity) || quantity <= 0) {
      throwMenuError('bundle-components-required');
    }

    const existing = componentMap.get(componentProductId);

    if (existing) {
      existing.quantity += quantity;
      return;
    }

    componentMap.set(componentProductId, {
      componentProductId,
      quantity,
      sortOrder: componentMap.size,
    });
  });

  return Array.from(componentMap.values());
}

async function validateBundleComponents({
  tx,
  hotelId,
  bundleProductId,
  productType,
  components,
}: {
  tx: Prisma.TransactionClient;
  hotelId: string;
  bundleProductId?: string;
  productType: MenuProductType;
  components: BundleComponentInput[];
}) {
  if (productType === MenuProductType.SINGLE) {
    return [];
  }

  if (!components.length) {
    throwMenuError('bundle-components-required');
  }

  const componentProductIds = components.map(
    (component) => component.componentProductId
  );

  if (bundleProductId && componentProductIds.includes(bundleProductId)) {
    throwMenuError('bundle-self-component');
  }

  const componentProducts = await tx.menuProduct.findMany({
    where: {
      id: {
        in: componentProductIds,
      },
      hotelId,
    },
    select: {
      id: true,
      name: true,
      productType: true,
      isAvailable: true,
    },
  });

  if (componentProducts.length !== componentProductIds.length) {
    throwMenuError('product-not-found');
  }

  const nestedBundle = componentProducts.find(
    (componentProduct) => componentProduct.productType === MenuProductType.BUNDLE
  );

  if (nestedBundle) {
    throwMenuError('nested-bundle-not-supported');
  }

  return components;
}

async function preventBundleProductFromBeingUsedAsComponent(productId: string) {
  const usedAsComponentCount = await db.menuBundleComponent.count({
    where: {
      componentProductId: productId,
    },
  });

  if (usedAsComponentCount > 0) {
    throwMenuError('nested-bundle-not-supported');
  }
}

export async function createCategoryAction(formData: FormData) {
  await requireDashboardPermission(DashboardModule.MENU, 'canCreate');

  const parsed = parseCategoryForm(formData);

  await assertHotelAccess(parsed.hotelId);

  await db.menuCategory.create({
    data: {
      hotelId: parsed.hotelId,
      name: parsed.name,
      sortOrder: parsed.sortOrder,
      isActive: true,
    },
  });

  return finishMenuAction('category-created');
}

export async function updateCategoryAction(formData: FormData) {
  await requireDashboardPermission(DashboardModule.MENU, 'canEdit');

  const parsed = parseUpdateCategoryForm(formData);

  const category = await db.menuCategory.findUnique({
    where: {
      id: parsed.categoryId,
    },
  });

  if (!category) {
    throwMenuError('category-not-found');
  }

  await assertHotelAccess(category.hotelId);

  await db.menuCategory.update({
    where: {
      id: parsed.categoryId,
    },
    data: {
      name: parsed.name,
      sortOrder: parsed.sortOrder,
      isActive: parsed.isActive,
    },
  });

  return finishMenuAction('category-updated');
}

export async function deleteCategoryAction(formData: FormData) {
  await requireDashboardPermission(DashboardModule.MENU, 'canDelete');

  const categoryId = String(formData.get('categoryId') || '');

  if (!categoryId) {
    throwMenuError('category-required');
  }

  const category = await db.menuCategory.findUnique({
    where: {
      id: categoryId,
    },
    include: {
      _count: {
        select: {
          products: true,
        },
      },
    },
  });

  if (!category) {
    throwMenuError('category-not-found');
  }

  await assertHotelAccess(category.hotelId);

  if (category._count.products > 0) {
    throwMenuError('category-has-products');
  }

  await db.menuCategory.delete({
    where: {
      id: categoryId,
    },
  });

  return finishMenuAction('category-deleted');
}

export async function createProductAction(formData: FormData) {
  await requireDashboardPermission(DashboardModule.MENU, 'canCreate');

  const parsed = parseProductForm(formData);

  const category = await db.menuCategory.findUnique({
    where: {
      id: parsed.categoryId,
    },
  });

  if (!category) {
    throwMenuError('category-not-found');
  }

  await assertHotelAccess(category.hotelId);

  const uploadedFile = formData.get('imageFile');
  const uploadedImageUrl =
    uploadedFile instanceof File
      ? await saveProductImage(uploadedFile, parsed.name)
      : null;

  const finalImageUrl = uploadedImageUrl || parsed.imageUrl || null;
  const bundleComponents = readBundleComponentsFromFormData(formData);

  await db.$transaction(async (tx) => {
    const product = await tx.menuProduct.create({
      data: {
        hotelId: category.hotelId,
        categoryId: parsed.categoryId,
        productType: parsed.productType,
        name: parsed.name,
        description: parsed.description || null,
        priceCents: Math.round(parsed.price * 100),
        prepTimeMinutes: parsed.prepTimeMinutes,
        isAvailable: parsed.isAvailable,

        images: finalImageUrl
          ? {
              create: {
                url: finalImageUrl,
                alt: parsed.name,
                sortOrder: 0,
              },
            }
          : undefined,
      },
    });

    const validatedBundleComponents = await validateBundleComponents({
      tx,
      hotelId: category.hotelId,
      bundleProductId: product.id,
      productType: parsed.productType,
      components: bundleComponents,
    });

    if (parsed.productType === MenuProductType.BUNDLE) {
      await tx.menuBundleComponent.createMany({
        data: validatedBundleComponents.map((component) => ({
          hotelId: category.hotelId,
          bundleProductId: product.id,
          componentProductId: component.componentProductId,
          quantity: component.quantity,
          sortOrder: component.sortOrder,
        })),
      });
    }
  });

  return finishMenuAction('product-created');
}

export async function updateProductAction(formData: FormData) {
  await requireDashboardPermission(DashboardModule.MENU, 'canEdit');

  const parsed = parseUpdateProductForm(formData);

  const product = await db.menuProduct.findUnique({
    where: {
      id: parsed.productId,
    },
  });

  if (!product) {
    throwMenuError('product-not-found');
  }

  const category = await db.menuCategory.findUnique({
    where: {
      id: parsed.categoryId,
    },
  });

  if (!category) {
    throwMenuError('category-not-found');
  }

  await assertHotelAccess(product.hotelId);
  await assertHotelAccess(category.hotelId);

  if (parsed.productType === MenuProductType.BUNDLE) {
    await preventBundleProductFromBeingUsedAsComponent(parsed.productId);
  }

  const uploadedFile = formData.get('imageFile');
  const uploadedImageUrl =
    uploadedFile instanceof File
      ? await saveProductImage(uploadedFile, parsed.name)
      : null;

  const finalImageUrl = uploadedImageUrl || parsed.imageUrl || null;
  const bundleComponents = readBundleComponentsFromFormData(formData);

  await db.$transaction(async (tx) => {
    await tx.menuProduct.update({
      where: {
        id: parsed.productId,
      },
      data: {
        hotelId: category.hotelId,
        categoryId: parsed.categoryId,
        productType: parsed.productType,
        name: parsed.name,
        description: parsed.description || null,
        priceCents: Math.round(parsed.price * 100),
        prepTimeMinutes: parsed.prepTimeMinutes,
        isAvailable: parsed.isAvailable,
      },
    });

    if (finalImageUrl) {
      await tx.productImage.deleteMany({
        where: {
          productId: parsed.productId,
        },
      });

      await tx.productImage.create({
        data: {
          productId: parsed.productId,
          url: finalImageUrl,
          alt: parsed.name,
          sortOrder: 0,
        },
      });
    }

    await tx.menuBundleComponent.deleteMany({
      where: {
        bundleProductId: parsed.productId,
      },
    });

    if (parsed.productType === MenuProductType.BUNDLE) {
      await tx.productInventoryRecipe.deleteMany({
        where: {
          productId: parsed.productId,
        },
      });

      const validatedBundleComponents = await validateBundleComponents({
        tx,
        hotelId: category.hotelId,
        bundleProductId: parsed.productId,
        productType: parsed.productType,
        components: bundleComponents,
      });

      await tx.menuBundleComponent.createMany({
        data: validatedBundleComponents.map((component) => ({
          hotelId: category.hotelId,
          bundleProductId: parsed.productId,
          componentProductId: component.componentProductId,
          quantity: component.quantity,
          sortOrder: component.sortOrder,
        })),
      });
    }
  });

  return finishMenuAction('product-updated');
}

export async function deleteProductAction(formData: FormData) {
  await requireDashboardPermission(DashboardModule.MENU, 'canDelete');

  const productId = String(formData.get('productId') || '');

  if (!productId) {
    throwMenuError('product-required');
  }

  const product = await db.menuProduct.findUnique({
    where: {
      id: productId,
    },
    select: {
      id: true,
      hotelId: true,
      productType: true,
    },
  });

  if (!product) {
    throwMenuError('product-not-found');
  }

  await assertHotelAccess(product.hotelId);

  const usedAsComponentCount = await db.menuBundleComponent.count({
    where: {
      componentProductId: productId,
    },
  });

  if (usedAsComponentCount > 0) {
    await db.menuProduct.update({
      where: {
        id: productId,
      },
      data: {
        isAvailable: false,
      },
    });

    return finishMenuAction('product-deleted');
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.menuBundleComponent.deleteMany({
        where: {
          bundleProductId: productId,
        },
      });

      await tx.productInventoryRecipe.deleteMany({
        where: {
          productId,
        },
      });

      await tx.productImage.deleteMany({
        where: {
          productId,
        },
      });

      await tx.menuProduct.delete({
        where: {
          id: productId,
        },
      });
    });
  } catch {
    await db.menuProduct.update({
      where: {
        id: productId,
      },
      data: {
        isAvailable: false,
      },
    });
  }

  return finishMenuAction('product-deleted');
}

type BulkDuplicateMode = 'UPSERT' | 'CREATE_ONLY' | 'SKIP_EXISTING';

type BulkComponentReference = {
  categoryName: string | null;
  productName: string;
  quantity: number;
};

type BulkMenuRow = {
  rowNumber: number;
  productType: MenuProductType;
  categoryName: string;
  name: string;
  priceCents: number;
  prepTimeMinutes: number;
  description: string | null;
  imageUrl: string | null;
  isAvailable: boolean;
  components: BulkComponentReference[];
};

type BulkImportSummary = {
  rows: number;
  created: number;
  updated: number;
  skipped: number;
  categoriesCreated: number;
  singleItems: number;
  bundleItems: number;
};

const BULK_MENU_MAX_FILE_SIZE = 2 * 1024 * 1024;
const BULK_MENU_MAX_ROWS = 1000;

function normalizeBulkKey(value: string) {
  return value.trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
}

function parseCsvRows(csvText: string) {
  const text = csvText.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += character;
      }

      continue;
    }

    if (character === '"') {
      inQuotes = true;
      continue;
    }

    if (character === ',') {
      row.push(field);
      field = '';
      continue;
    }

    if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') {
        index += 1;
      }

      row.push(field);
      field = '';

      if (row.some((cell) => cell.trim().length > 0)) {
        rows.push(row);
      }

      row = [];
      continue;
    }

    field += character;
  }

  if (inQuotes) {
    throw new Error(
      'The CSV contains an unclosed quoted field. Check the last edited row.'
    );
  }

  row.push(field);

  if (row.some((cell) => cell.trim().length > 0)) {
    rows.push(row);
  }

  return rows;
}

function normalizeCsvHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function getCsvColumnMap(headerRow: string[]) {
  const aliases: Record<string, string> = {
    type: 'product_type',
    producttype: 'product_type',
    product_type: 'product_type',
    category: 'category',
    category_name: 'category',
    name: 'name',
    product_name: 'name',
    price: 'price',
    price_php: 'price',
    prep_time: 'prep_time_minutes',
    prep_time_minutes: 'prep_time_minutes',
    preparation_time: 'prep_time_minutes',
    description: 'description',
    image: 'image_url',
    image_url: 'image_url',
    available: 'is_available',
    availability: 'is_available',
    is_available: 'is_available',
    components: 'components',
    bundle_components: 'components',
  };

  const columnMap = new Map<string, number>();

  headerRow.forEach((header, index) => {
    const normalized = normalizeCsvHeader(header);
    const canonical = aliases[normalized] ?? normalized;

    if (!columnMap.has(canonical)) {
      columnMap.set(canonical, index);
    }
  });

  for (const requiredColumn of [
    'product_type',
    'category',
    'name',
    'price',
  ]) {
    if (!columnMap.has(requiredColumn)) {
      throw new Error(
        `The CSV is missing the required "${requiredColumn}" column.`
      );
    }
  }

  return columnMap;
}

function getCsvCell(
  row: string[],
  columns: Map<string, number>,
  column: string
) {
  const index = columns.get(column);

  if (typeof index !== 'number') {
    return '';
  }

  return String(row[index] ?? '').trim();
}

function parseBulkProductType(value: string, rowNumber: number) {
  const normalized = value.trim().toUpperCase();

  if (['SINGLE', 'ITEM', 'SINGLE ITEM'].includes(normalized)) {
    return MenuProductType.SINGLE;
  }

  if (['BUNDLE', 'COMBO', 'BUNDLE / COMBO'].includes(normalized)) {
    return MenuProductType.BUNDLE;
  }

  throw new Error(
    `Row ${rowNumber}: product_type must be SINGLE or BUNDLE.`
  );
}

function parseBulkPrice(value: string, rowNumber: number) {
  const normalized = value.replace(/[₱,\s]/g, '');
  const price = Number(normalized);

  if (!Number.isFinite(price) || price < 0) {
    throw new Error(`Row ${rowNumber}: price must be zero or greater.`);
  }

  return Math.round(price * 100);
}

function parseBulkPrepTime(value: string, rowNumber: number) {
  if (!value) {
    return 15;
  }

  const prepTime = Number(value);

  if (!Number.isInteger(prepTime) || prepTime < 0 || prepTime > 1440) {
    throw new Error(
      `Row ${rowNumber}: prep_time_minutes must be a whole number from 0 to 1440.`
    );
  }

  return prepTime;
}

function parseBulkAvailability(value: string) {
  if (!value) {
    return true;
  }

  const normalized = value.trim().toLowerCase();

  if (['true', 'yes', '1', 'available', 'active', 'show'].includes(normalized)) {
    return true;
  }

  if (['false', 'no', '0', 'hidden', 'inactive', 'hide'].includes(normalized)) {
    return false;
  }

  throw new Error(
    `Invalid is_available value "${value}". Use TRUE/FALSE, YES/NO, or 1/0.`
  );
}

function parseBulkImageUrl(value: string, rowNumber: number) {
  const imageUrl = value.trim();

  if (!imageUrl) {
    return null;
  }

  if (
    !imageUrl.startsWith('http://') &&
    !imageUrl.startsWith('https://') &&
    !imageUrl.startsWith('/')
  ) {
    throw new Error(
      `Row ${rowNumber}: image_url must start with http://, https://, or /.`
    );
  }

  return imageUrl.slice(0, 1000);
}

function parseBulkComponents(
  value: string,
  rowNumber: number
): BulkComponentReference[] {
  if (!value.trim()) {
    return [];
  }

  const components = new Map<string, BulkComponentReference>();

  for (const rawComponent of value.split('|')) {
    const componentText = rawComponent.trim();

    if (!componentText) {
      continue;
    }

    const parts = componentText
      .split('::')
      .map((part) => part.trim());

    let categoryName: string | null = null;
    let productName = '';
    let quantityText = '';

    if (parts.length === 2) {
      [productName, quantityText] = parts;
    } else if (parts.length === 3) {
      [categoryName, productName, quantityText] = parts;
    } else {
      throw new Error(
        `Row ${rowNumber}: invalid component "${componentText}". Use Product Name::Quantity or Category::Product Name::Quantity.`
      );
    }

    const quantity = Number(quantityText);

    if (!productName || !Number.isInteger(quantity) || quantity <= 0) {
      throw new Error(
        `Row ${rowNumber}: component "${componentText}" must have a product name and a positive whole-number quantity.`
      );
    }

    const componentKey = `${normalizeBulkKey(categoryName || '')}::${normalizeBulkKey(
      productName
    )}`;

    const existing = components.get(componentKey);

    if (existing) {
      existing.quantity += quantity;
      continue;
    }

    components.set(componentKey, {
      categoryName: categoryName || null,
      productName: productName.slice(0, 160),
      quantity,
    });
  }

  return Array.from(components.values());
}

function parseBulkMenuCsv(csvText: string) {
  const rows = parseCsvRows(csvText);

  if (rows.length < 2) {
    throw new Error(
      'The CSV must contain one header row and at least one menu item row.'
    );
  }

  const columns = getCsvColumnMap(rows[0]);
  const parsedRows: BulkMenuRow[] = [];
  const duplicateRows = new Map<string, number>();

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    const rowNumber = index + 1;

    if (!row.some((cell) => cell.trim())) {
      continue;
    }

    const productType = parseBulkProductType(
      getCsvCell(row, columns, 'product_type'),
      rowNumber
    );
    const categoryName = getCsvCell(row, columns, 'category').slice(0, 120);
    const name = getCsvCell(row, columns, 'name').slice(0, 160);

    if (!categoryName) {
      throw new Error(`Row ${rowNumber}: category is required.`);
    }

    if (!name) {
      throw new Error(`Row ${rowNumber}: name is required.`);
    }

    const duplicateKey = `${normalizeBulkKey(categoryName)}::${normalizeBulkKey(
      name
    )}`;
    const firstRowNumber = duplicateRows.get(duplicateKey);

    if (firstRowNumber) {
      throw new Error(
        `Rows ${firstRowNumber} and ${rowNumber} contain the same category and product name. Remove the duplicate row.`
      );
    }

    duplicateRows.set(duplicateKey, rowNumber);

    const components = parseBulkComponents(
      getCsvCell(row, columns, 'components'),
      rowNumber
    );

    if (productType === MenuProductType.BUNDLE && !components.length) {
      throw new Error(
        `Row ${rowNumber}: bundle "${name}" must include at least one component.`
      );
    }

    if (productType === MenuProductType.SINGLE && components.length) {
      throw new Error(
        `Row ${rowNumber}: single item "${name}" cannot contain bundle components.`
      );
    }

    parsedRows.push({
      rowNumber,
      productType,
      categoryName,
      name,
      priceCents: parseBulkPrice(
        getCsvCell(row, columns, 'price'),
        rowNumber
      ),
      prepTimeMinutes: parseBulkPrepTime(
        getCsvCell(row, columns, 'prep_time_minutes'),
        rowNumber
      ),
      description:
        getCsvCell(row, columns, 'description').slice(0, 4000) || null,
      imageUrl: parseBulkImageUrl(
        getCsvCell(row, columns, 'image_url'),
        rowNumber
      ),
      isAvailable: parseBulkAvailability(
        getCsvCell(row, columns, 'is_available')
      ),
      components,
    });
  }

  if (!parsedRows.length) {
    throw new Error('The CSV does not contain any menu item rows.');
  }

  if (parsedRows.length > BULK_MENU_MAX_ROWS) {
    throw new Error(
      `The CSV contains ${parsedRows.length} rows. Upload no more than ${BULK_MENU_MAX_ROWS} rows at a time.`
    );
  }

  return parsedRows;
}

function parseBulkDuplicateMode(value: FormDataEntryValue | null) {
  const mode = String(value || 'UPSERT').toUpperCase();

  if (
    mode === 'UPSERT' ||
    mode === 'CREATE_ONLY' ||
    mode === 'SKIP_EXISTING'
  ) {
    return mode as BulkDuplicateMode;
  }

  return 'UPSERT';
}

function formatBulkRowError(row: BulkMenuRow, message: string) {
  return `Row ${row.rowNumber} (${row.categoryName} / ${row.name}): ${message}`;
}

export async function bulkImportMenuAction(formData: FormData) {
  await requireDashboardPermission(DashboardModule.MENU, 'canCreate');

  const hotelId = cleanText(formData.get('hotelId'), 100);
  const duplicateMode = parseBulkDuplicateMode(formData.get('duplicateMode'));
  const createMissingCategories =
    formData.get('createMissingCategories') === 'on';

  if (!hotelId) {
    throw new Error('Choose a hotel before importing menu items.');
  }

  await assertHotelAccess(hotelId);

  const upload = formData.get('bulkMenuFile');

  if (!(upload instanceof File) || upload.size === 0) {
    throw new Error('Choose a CSV file to import.');
  }

  const fileName = upload.name.toLowerCase();

  if (!fileName.endsWith('.csv')) {
    throw new Error('Bulk menu import currently accepts CSV files only.');
  }

  if (upload.size > BULK_MENU_MAX_FILE_SIZE) {
    throw new Error('The CSV file must be 2 MB or smaller.');
  }

  const csvText = await upload.text();
  const rows = parseBulkMenuCsv(csvText);

  const summary: BulkImportSummary = {
    rows: rows.length,
    created: 0,
    updated: 0,
    skipped: 0,
    categoriesCreated: 0,
    singleItems: rows.filter(
      (row) => row.productType === MenuProductType.SINGLE
    ).length,
    bundleItems: rows.filter(
      (row) => row.productType === MenuProductType.BUNDLE
    ).length,
  };

  await db.$transaction(
    async (tx) => {
      const existingCategories = await tx.menuCategory.findMany({
        where: {
          hotelId,
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      const categoriesByName = new Map<string, typeof existingCategories>();

      for (const category of existingCategories) {
        const key = normalizeBulkKey(category.name);
        const matches = categoriesByName.get(key) ?? [];
        matches.push(category);
        categoriesByName.set(key, matches);
      }

      const categoryByRowName = new Map<
        string,
        (typeof existingCategories)[number]
      >();

      for (const row of rows) {
        const categoryKey = normalizeBulkKey(row.categoryName);

        if (categoryByRowName.has(categoryKey)) {
          continue;
        }

        const matchingCategories = categoriesByName.get(categoryKey) ?? [];

        if (matchingCategories.length > 1) {
          throw new Error(
            `Hotel has multiple categories named "${row.categoryName}". Rename the duplicates before importing.`
          );
        }

        if (matchingCategories.length === 1) {
          categoryByRowName.set(categoryKey, matchingCategories[0]);
          continue;
        }

        if (!createMissingCategories) {
          throw new Error(
            `Row ${row.rowNumber}: category "${row.categoryName}" does not exist. Enable "Create missing categories" or create it first.`
          );
        }

        const createdCategory = await tx.menuCategory.create({
          data: {
            hotelId,
            name: row.categoryName,
            sortOrder:
              existingCategories.length + summary.categoriesCreated,
            isActive: true,
          },
        });

        summary.categoriesCreated += 1;
        categoryByRowName.set(categoryKey, createdCategory);
        categoriesByName.set(categoryKey, [createdCategory]);
      }

      const existingProducts = await tx.menuProduct.findMany({
        where: {
          hotelId,
        },
        include: {
          category: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      type ProductRecord = (typeof existingProducts)[number];

      const productsByCategoryAndName = new Map<string, ProductRecord[]>();
      const productsByName = new Map<string, ProductRecord[]>();

      function registerProduct(product: ProductRecord) {
        const categoryProductKey = `${product.categoryId}::${normalizeBulkKey(
          product.name
        )}`;
        const categoryMatches =
          productsByCategoryAndName.get(categoryProductKey) ?? [];

        if (!categoryMatches.some((current) => current.id === product.id)) {
          categoryMatches.push(product);
          productsByCategoryAndName.set(
            categoryProductKey,
            categoryMatches
          );
        }

        const nameKey = normalizeBulkKey(product.name);
        const nameMatches = productsByName.get(nameKey) ?? [];

        if (!nameMatches.some((current) => current.id === product.id)) {
          nameMatches.push(product);
          productsByName.set(nameKey, nameMatches);
        }
      }

      function unregisterProduct(product: ProductRecord) {
        const categoryProductKey = `${product.categoryId}::${normalizeBulkKey(
          product.name
        )}`;
        productsByCategoryAndName.set(
          categoryProductKey,
          (productsByCategoryAndName.get(categoryProductKey) ?? []).filter(
            (current) => current.id !== product.id
          )
        );

        const nameKey = normalizeBulkKey(product.name);
        productsByName.set(
          nameKey,
          (productsByName.get(nameKey) ?? []).filter(
            (current) => current.id !== product.id
          )
        );
      }

      existingProducts.forEach(registerProduct);

      async function upsertProductShell(row: BulkMenuRow) {
        const category = categoryByRowName.get(
          normalizeBulkKey(row.categoryName)
        );

        if (!category) {
          throw new Error(
            formatBulkRowError(row, 'category could not be resolved.')
          );
        }

        const productKey = `${category.id}::${normalizeBulkKey(row.name)}`;
        const matches = productsByCategoryAndName.get(productKey) ?? [];

        if (matches.length > 1) {
          throw new Error(
            formatBulkRowError(
              row,
              'multiple existing products use the same name in this category.'
            )
          );
        }

        const existing = matches[0];

        if (existing && duplicateMode === 'CREATE_ONLY') {
          throw new Error(
            formatBulkRowError(
              row,
              'a product with this category and name already exists.'
            )
          );
        }

        if (existing && duplicateMode === 'SKIP_EXISTING') {
          summary.skipped += 1;

          return {
            product: existing,
            skipped: true,
          };
        }

        if (
          existing &&
          existing.productType === MenuProductType.SINGLE &&
          row.productType === MenuProductType.BUNDLE
        ) {
          const usedAsComponentCount = await tx.menuBundleComponent.count({
            where: {
              componentProductId: existing.id,
            },
          });

          if (usedAsComponentCount > 0) {
            throw new Error(
              formatBulkRowError(
                row,
                'this single item is already used inside another bundle and cannot be converted to a bundle.'
              )
            );
          }
        }

        let product: ProductRecord;

        if (existing) {
          unregisterProduct(existing);

          product = await tx.menuProduct.update({
            where: {
              id: existing.id,
            },
            data: {
              categoryId: category.id,
              productType: row.productType,
              name: row.name,
              description: row.description,
              priceCents: row.priceCents,
              prepTimeMinutes: row.prepTimeMinutes,
              isAvailable: row.isAvailable,
            },
            include: {
              category: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          });

          summary.updated += 1;
        } else {
          product = await tx.menuProduct.create({
            data: {
              hotelId,
              categoryId: category.id,
              productType: row.productType,
              name: row.name,
              description: row.description,
              priceCents: row.priceCents,
              prepTimeMinutes: row.prepTimeMinutes,
              isAvailable: row.isAvailable,
            },
            include: {
              category: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          });

          summary.created += 1;
        }

        registerProduct(product);

        if (row.imageUrl) {
          await tx.productImage.deleteMany({
            where: {
              productId: product.id,
            },
          });

          await tx.productImage.create({
            data: {
              productId: product.id,
              url: row.imageUrl,
              alt: row.name,
              sortOrder: 0,
            },
          });
        }

        await tx.menuBundleComponent.deleteMany({
          where: {
            bundleProductId: product.id,
          },
        });

        if (row.productType === MenuProductType.BUNDLE) {
          await tx.productInventoryRecipe.deleteMany({
            where: {
              productId: product.id,
            },
          });
        }

        return {
          product,
          skipped: false,
        };
      }

      const singleRows = rows.filter(
        (row) => row.productType === MenuProductType.SINGLE
      );
      const bundleRows = rows.filter(
        (row) => row.productType === MenuProductType.BUNDLE
      );

      for (const row of singleRows) {
        await upsertProductShell(row);
      }

      for (const row of bundleRows) {
        const result = await upsertProductShell(row);

        if (result.skipped) {
          continue;
        }

        const componentMap = new Map<
          string,
          {
            product: ProductRecord;
            quantity: number;
          }
        >();

        for (const componentReference of row.components) {
          let matches: ProductRecord[] = [];

          if (componentReference.categoryName) {
            const componentCategoryKey = normalizeBulkKey(
              componentReference.categoryName
            );
            let componentCategory =
              categoryByRowName.get(componentCategoryKey) ?? null;

            if (!componentCategory) {
              const matchingCategories =
                categoriesByName.get(componentCategoryKey) ?? [];

              if (matchingCategories.length > 1) {
                throw new Error(
                  formatBulkRowError(
                    row,
                    `multiple categories are named "${componentReference.categoryName}". Rename the duplicates before importing.`
                  )
                );
              }

              componentCategory = matchingCategories[0] ?? null;
            }

            if (!componentCategory) {
              throw new Error(
                formatBulkRowError(
                  row,
                  `component category "${componentReference.categoryName}" was not found.`
                )
              );
            }

            matches =
              productsByCategoryAndName.get(
                `${componentCategory.id}::${normalizeBulkKey(
                  componentReference.productName
                )}`
              ) ?? [];
          } else {
            matches =
              productsByName.get(
                normalizeBulkKey(componentReference.productName)
              ) ?? [];
          }

          if (!matches.length) {
            throw new Error(
              formatBulkRowError(
                row,
                `component "${componentReference.productName}" was not found. Import or create the single item first.`
              )
            );
          }

          if (matches.length > 1) {
            throw new Error(
              formatBulkRowError(
                row,
                `component "${componentReference.productName}" is ambiguous. Use Category::Product Name::Quantity in the components column.`
              )
            );
          }

          const componentProduct = matches[0];

          if (componentProduct.id === result.product.id) {
            throw new Error(
              formatBulkRowError(
                row,
                'a bundle cannot include itself as a component.'
              )
            );
          }

          if (componentProduct.productType !== MenuProductType.SINGLE) {
            throw new Error(
              formatBulkRowError(
                row,
                `component "${componentReference.productName}" is another bundle. Nested bundles are not supported.`
              )
            );
          }

          const currentComponent = componentMap.get(componentProduct.id);

          if (currentComponent) {
            currentComponent.quantity += componentReference.quantity;
          } else {
            componentMap.set(componentProduct.id, {
              product: componentProduct,
              quantity: componentReference.quantity,
            });
          }
        }

        const components = Array.from(componentMap.values());

        if (!components.length) {
          throw new Error(
            formatBulkRowError(
              row,
              'bundle must include at least one component.'
            )
          );
        }

        await tx.menuBundleComponent.createMany({
          data: components.map((component, sortOrder) => ({
            hotelId,
            bundleProductId: result.product.id,
            componentProductId: component.product.id,
            quantity: component.quantity,
            sortOrder,
          })),
        });
      }
    },
    {
      maxWait: 10_000,
      timeout: 120_000,
    }
  );

  const result = finishMenuAction('bulk-menu-imported');

  return {
    ...result,
    summary,
  };
}

