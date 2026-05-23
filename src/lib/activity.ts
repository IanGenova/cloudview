import { db } from '@/lib/db';

export async function logActivity(input: {
  hotelId?: string | null;
  userId?: string | null;
  actor?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  message?: string | null;
}) {
  await db.activityLog.create({
    data: {
      hotelId: input.hotelId ?? undefined,
      userId: input.userId ?? undefined,
      actor: input.actor ?? undefined,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? undefined,
      message: input.message ?? undefined
    }
  });
}
