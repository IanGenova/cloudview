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