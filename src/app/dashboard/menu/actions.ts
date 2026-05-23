'use server';

import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { redirect } from 'next/navigation';

const categorySchema = z.object({
  hotelId: z.string().min(1),
  name: z.string().min(1).max(120),
  sortOrder: z.coerce.number().int().min(0).default(0)
});

const updateCategorySchema = z.object({
  categoryId: z.string().min(1),
  name: z.string().min(1).max(120),
  sortOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(false)
});

const productSchema = z.object({
  categoryId: z.string().min(1),
  name: z.string().min(1).max(160),
  price: z.coerce.number().min(0),
  imageUrl: z.string().optional(),
  prepTimeMinutes: z.coerce.number().int().min(0).default(15),
  description: z.string().optional(),
  isAvailable: z.boolean().default(false)
});

const updateProductSchema = productSchema.extend({
  productId: z.string().min(1)
});

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

function redirectMenu(success: string) {
  revalidatePath('/dashboard/menu');
  revalidatePath('/dashboard/pos');
  revalidatePath('/t/[tagCode]/menu', 'page');

  redirect(`/dashboard/menu?success=${success}`);
}

async function saveProductImage(file: File | null, productName: string) {
  if (!file || file.size === 0) return null;

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

  if (!allowedTypes.includes(file.type)) {
    throw new Error('Invalid image type. Please upload JPG, PNG, WEBP, or GIF.');
  }

  const maxSize = 5 * 1024 * 1024;

  if (file.size > maxSize) {
    throw new Error('Image is too large. Maximum upload size is 5MB.');
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
    throw new Error('You are not allowed to manage this hotel.');
  }

  return user;
}

async function revalidateMenuPages() {
  revalidatePath('/dashboard/menu');
  revalidatePath('/dashboard/pos');
  revalidatePath('/t/[tagCode]/menu', 'page');
}

export async function createCategoryAction(formData: FormData) {
  const parsed = categorySchema.parse({
    hotelId: formData.get('hotelId'),
    name: cleanText(formData.get('name'), 120),
    sortOrder: formData.get('sortOrder') || 0
  });

  await assertHotelAccess(parsed.hotelId);

  await db.menuCategory.create({
    data: {
      hotelId: parsed.hotelId,
      name: parsed.name,
      sortOrder: parsed.sortOrder,
      isActive: true
    }
  });

  await redirectMenu('category-created');
}

export async function updateCategoryAction(formData: FormData) {
  const parsed = updateCategorySchema.parse({
    categoryId: formData.get('categoryId'),
    name: cleanText(formData.get('name'), 120),
    sortOrder: formData.get('sortOrder') || 0,
    isActive: formData.get('isActive') === 'on'
  });

  const category = await db.menuCategory.findUnique({
    where: { id: parsed.categoryId }
  });

  if (!category) throw new Error('Category not found.');

  await assertHotelAccess(category.hotelId);

  await db.menuCategory.update({
    where: { id: parsed.categoryId },
    data: {
      name: parsed.name,
      sortOrder: parsed.sortOrder,
      isActive: parsed.isActive
    }
  });

  await redirectMenu('category-updated');
}

export async function deleteCategoryAction(formData: FormData) {
  const categoryId = String(formData.get('categoryId') || '');

  const category = await db.menuCategory.findUnique({
    where: { id: categoryId },
    include: {
      _count: {
        select: {
          products: true
        }
      }
    }
  });

  if (!category) throw new Error('Category not found.');

  await assertHotelAccess(category.hotelId);

  if (category._count.products > 0) {
    throw new Error('Cannot delete category with products. Move/delete products first or mark the category inactive.');
  }

  await db.menuCategory.delete({
    where: { id: categoryId }
  });

  await redirectMenu('category-deleted');

}

export async function createProductAction(formData: FormData) {
  const parsed = productSchema.parse({
    categoryId: formData.get('categoryId'),
    name: cleanText(formData.get('name'), 160),
    price: formData.get('price') || 0,
    imageUrl: cleanText(formData.get('imageUrl'), 500),
    prepTimeMinutes: formData.get('prepTimeMinutes') || 15,
    description: cleanText(formData.get('description'), 1000),
    isAvailable: formData.get('isAvailable') === 'on'
  });

  const category = await db.menuCategory.findUnique({
    where: { id: parsed.categoryId }
  });

  if (!category) throw new Error('Selected category was not found.');

  await assertHotelAccess(category.hotelId);

  const uploadedFile = formData.get('imageFile');
  const uploadedImageUrl =
    uploadedFile instanceof File
      ? await saveProductImage(uploadedFile, parsed.name)
      : null;

  const finalImageUrl = uploadedImageUrl || parsed.imageUrl || null;

  await db.menuProduct.create({
    data: {
      hotelId: category.hotelId,
      categoryId: parsed.categoryId,
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
              sortOrder: 0
            }
          }
        : undefined
    }
  });

  await redirectMenu('product-created');
}

export async function updateProductAction(formData: FormData) {
  const parsed = updateProductSchema.parse({
    productId: formData.get('productId'),
    categoryId: formData.get('categoryId'),
    name: cleanText(formData.get('name'), 160),
    price: formData.get('price') || 0,
    imageUrl: cleanText(formData.get('imageUrl'), 500),
    prepTimeMinutes: formData.get('prepTimeMinutes') || 15,
    description: cleanText(formData.get('description'), 1000),
    isAvailable: formData.get('isAvailable') === 'on'
  });

  const product = await db.menuProduct.findUnique({
    where: { id: parsed.productId }
  });

  if (!product) throw new Error('Product not found.');

  const category = await db.menuCategory.findUnique({
    where: { id: parsed.categoryId }
  });

  if (!category) throw new Error('Selected category was not found.');

  await assertHotelAccess(product.hotelId);
  await assertHotelAccess(category.hotelId);

  const uploadedFile = formData.get('imageFile');
  const uploadedImageUrl =
    uploadedFile instanceof File
      ? await saveProductImage(uploadedFile, parsed.name)
      : null;

  const finalImageUrl = uploadedImageUrl || parsed.imageUrl || null;

  await db.$transaction(async (tx) => {
    await tx.menuProduct.update({
      where: { id: parsed.productId },
      data: {
        hotelId: category.hotelId,
        categoryId: parsed.categoryId,
        name: parsed.name,
        description: parsed.description || null,
        priceCents: Math.round(parsed.price * 100),
        prepTimeMinutes: parsed.prepTimeMinutes,
        isAvailable: parsed.isAvailable
      }
    });

    if (finalImageUrl) {
      await tx.productImage.deleteMany({
        where: { productId: parsed.productId }
      });

      await tx.productImage.create({
        data: {
          productId: parsed.productId,
          url: finalImageUrl,
          alt: parsed.name,
          sortOrder: 0
        }
      });
    }
  });

  await redirectMenu('product-updated');
}

export async function deleteProductAction(formData: FormData) {
  const productId = String(formData.get('productId') || '');

  const product = await db.menuProduct.findUnique({
    where: { id: productId }
  });

  if (!product) throw new Error('Product not found.');

  await assertHotelAccess(product.hotelId);

  try {
    await db.$transaction(async (tx) => {
      await tx.productInventoryRecipe.deleteMany({
        where: { productId }
      });

      await tx.productImage.deleteMany({
        where: { productId }
      });

      await tx.menuProduct.delete({
        where: { id: productId }
      });
    });
  } catch {
    await db.menuProduct.update({
      where: { id: productId },
      data: {
        isAvailable: false
      }
    });
  }

  await redirectMenu('product-deleted');
}