'use server';

import { revalidatePath } from 'next/cache';
import { requireUser, requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { scopedHotelId } from '@/lib/access';
import { cleanText } from '@/lib/sanitize';

export async function saveHotelSettingsAction(formData: FormData) {
  const user = await requireUser();
  requireRole(user.role, ['SUPER_ADMIN', 'HOTEL_ADMIN']);
  const hotelId = scopedHotelId(user, cleanText(formData.get('hotelId')));
  if (!hotelId) throw new Error('Hotel required');
  await db.hotel.update({ where: { id: hotelId }, data: { name: cleanText(formData.get('hotelName'), 120), logoUrl: cleanText(formData.get('logoUrl'), 500), brandColor: cleanText(formData.get('brandColor'), 20) ?? '#111111', accentColor: cleanText(formData.get('accentColor'), 20) ?? '#B88938' } });
  await db.hotelSettings.upsert({
    where: { hotelId },
    update: {
      currency: cleanText(formData.get('currency'), 3) ?? 'PHP',
      taxRate: Number(formData.get('taxRate') || 0),
      serviceChargeRate: Number(formData.get('serviceChargeRate') || 0),
      wifiName: cleanText(formData.get('wifiName'), 120),
      wifiPassword: cleanText(formData.get('wifiPassword'), 120),
      checkInTime: cleanText(formData.get('checkInTime'), 40) ?? '2:00 PM',
      checkOutTime: cleanText(formData.get('checkOutTime'), 40) ?? '12:00 PM',
      poolHours: cleanText(formData.get('poolHours'), 120) ?? '7:00 AM - 9:00 PM',
      poolRules: cleanText(formData.get('poolRules'), 2000),
      policies: cleanText(formData.get('policies'), 4000),
      guideText: cleanText(formData.get('guideText'), 4000),
      contactPhone: cleanText(formData.get('contactPhone'), 80),
      contactEmail: cleanText(formData.get('contactEmail'), 160)
    },
    create: {
      hotelId,
      currency: cleanText(formData.get('currency'), 3) ?? 'PHP',
      taxRate: Number(formData.get('taxRate') || 0),
      serviceChargeRate: Number(formData.get('serviceChargeRate') || 0),
      wifiName: cleanText(formData.get('wifiName'), 120),
      wifiPassword: cleanText(formData.get('wifiPassword'), 120),
      checkInTime: cleanText(formData.get('checkInTime'), 40) ?? '2:00 PM',
      checkOutTime: cleanText(formData.get('checkOutTime'), 40) ?? '12:00 PM',
      poolHours: cleanText(formData.get('poolHours'), 120) ?? '7:00 AM - 9:00 PM',
      poolRules: cleanText(formData.get('poolRules'), 2000),
      policies: cleanText(formData.get('policies'), 4000),
      guideText: cleanText(formData.get('guideText'), 4000),
      contactPhone: cleanText(formData.get('contactPhone'), 80),
      contactEmail: cleanText(formData.get('contactEmail'), 160)
    }
  });
  revalidatePath('/dashboard/settings');
}
