'use server';

import { revalidatePath } from 'next/cache';
import { requireUser, requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { cleanText } from '@/lib/sanitize';

export async function createHotelAction(formData: FormData) {
  const user = await requireUser();
  requireRole(user.role, ['SUPER_ADMIN']);
  const name = cleanText(formData.get('name'), 120);
  const slug = cleanText(formData.get('slug'), 80)?.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  if (!name || !slug) throw new Error('Hotel name and slug are required');
  await db.hotel.create({
    data: {
      name,
      slug,
      brandColor: cleanText(formData.get('brandColor'), 20) ?? '#111111',
      accentColor: cleanText(formData.get('accentColor'), 20) ?? '#B88938',
      settings: { create: { currency: 'PHP' } }
    }
  });
  revalidatePath('/dashboard/hotels');
}
