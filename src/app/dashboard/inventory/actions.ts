'use server';

import { Prisma, InventoryMovementType } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { requireUser, requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { scopedHotelId } from '@/lib/access';
import { cleanText } from '@/lib/sanitize';

export async function createInventoryItemAction(formData: FormData) {
  const user = await requireUser();
  requireRole(user.role, ['SUPER_ADMIN', 'HOTEL_ADMIN', 'STAFF']);
  const hotelId = scopedHotelId(user, cleanText(formData.get('hotelId')));
  const name = cleanText(formData.get('name'), 160);
  const unit = cleanText(formData.get('unit'), 40);
  const stockQuantity = new Prisma.Decimal(Number(formData.get('stockQuantity') || 0));
  const reorderLevel = new Prisma.Decimal(Number(formData.get('reorderLevel') || 0));
  if (!hotelId || !name || !unit) throw new Error('Inventory name and unit required');
  await db.inventoryItem.create({
    data: { hotelId, name, unit, stockQuantity, reorderLevel, sku: cleanText(formData.get('sku'), 80), supplier: cleanText(formData.get('supplier'), 160) }
  });
  revalidatePath('/dashboard/inventory');
}

export async function stockMovementAction(formData: FormData) {
  const user = await requireUser();
  requireRole(user.role, ['SUPER_ADMIN', 'HOTEL_ADMIN', 'STAFF']);
  const itemId = cleanText(formData.get('itemId'));
  const type = formData.get('type') as InventoryMovementType;
  const quantity = Number(formData.get('quantity') || 0);
  if (!itemId || !Object.values(InventoryMovementType).includes(type) || quantity <= 0) throw new Error('Invalid movement');
  const item = await db.inventoryItem.findUnique({ where: { id: itemId } });
  if (!item) throw new Error('Item not found');
  scopedHotelId(user, item.hotelId);
  const isOut = type === 'STOCK_OUT' || type === 'ORDER_DEDUCTION';
  await db.$transaction([
    db.inventoryItem.update({ where: { id: item.id }, data: { stockQuantity: isOut ? { decrement: quantity } : { increment: quantity } } }),
    db.inventoryMovement.create({ data: { hotelId: item.hotelId, itemId: item.id, type, quantity: new Prisma.Decimal(quantity), reason: cleanText(formData.get('reason'), 240), userId: user.id } })
  ]);
  revalidatePath('/dashboard/inventory');
}

export async function linkRecipeAction(formData: FormData) {
  const user = await requireUser();
  requireRole(user.role, ['SUPER_ADMIN', 'HOTEL_ADMIN']);
  const productId = cleanText(formData.get('productId'));
  const inventoryItemId = cleanText(formData.get('inventoryItemId'));
  const quantity = Number(formData.get('quantity') || 0);
  if (!productId || !inventoryItemId || quantity <= 0) throw new Error('Invalid recipe');
  const [product, item] = await Promise.all([
    db.menuProduct.findUnique({ where: { id: productId } }),
    db.inventoryItem.findUnique({ where: { id: inventoryItemId } })
  ]);
  if (!product || !item || product.hotelId !== item.hotelId) throw new Error('Product and inventory item must be in same hotel');
  scopedHotelId(user, product.hotelId);
  await db.productInventoryRecipe.upsert({
    where: { productId_inventoryItemId: { productId, inventoryItemId } },
    update: { quantity: new Prisma.Decimal(quantity) },
    create: { productId, inventoryItemId, quantity: new Prisma.Decimal(quantity) }
  });
  revalidatePath('/dashboard/inventory');
  revalidatePath('/dashboard/menu');
}
