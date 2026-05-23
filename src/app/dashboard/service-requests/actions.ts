'use server';

import { ServiceRequestStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { assertHotelScope } from '@/lib/access';
import { cleanText } from '@/lib/sanitize';

export async function updateServiceRequestAction(formData: FormData) {
  const user = await requireUser();
  const requestId = cleanText(formData.get('requestId'));
  const status = formData.get('status') as ServiceRequestStatus;
  const assignedToId = cleanText(formData.get('assignedToId'));
  if (!requestId || !Object.values(ServiceRequestStatus).includes(status)) throw new Error('Invalid service request update');
  const request = await db.serviceRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new Error('Request not found');
  assertHotelScope(user, request.hotelId);
  await db.serviceRequest.update({ where: { id: request.id }, data: { status, assignedToId: assignedToId || undefined } });
  await db.serviceRequestStatusHistory.create({ data: { requestId: request.id, status, userId: user.id, note: cleanText(formData.get('note'), 300) } });
  revalidatePath('/dashboard/service-requests');
}
