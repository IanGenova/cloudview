import { Role } from '@prisma/client';

export function scopedHotelId(user: { role: Role; hotelId: string | null }, requestedHotelId?: string | null) {
  if (user.role === 'SUPER_ADMIN') return requestedHotelId ?? undefined;
  if (!user.hotelId) throw new Error('User is not assigned to a hotel');
  return user.hotelId;
}

export function assertHotelScope(user: { role: Role; hotelId: string | null }, hotelId: string) {
  if (user.role !== 'SUPER_ADMIN' && user.hotelId !== hotelId) throw new Error('Forbidden');
}
