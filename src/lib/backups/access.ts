import { Role } from '@prisma/client';

export type BackupActor = {
  id: string;
  role: Role;
  hotelId?: string | null;
};

export function resolveBackupHotelId(
  actor: BackupActor,
  requestedHotelId?: string | null
) {
  if (actor.role === Role.SUPER_ADMIN) {
    if (!requestedHotelId) {
      throw new Error('Please select a hotel.');
    }

    return requestedHotelId;
  }

  if (!actor.hotelId) {
    throw new Error('Your account is not assigned to a hotel.');
  }

  if (requestedHotelId && requestedHotelId !== actor.hotelId) {
    throw new Error('You cannot access another hotel backup.');
  }

  return actor.hotelId;
}

export function assertBackupHotelAccess(
  actor: BackupActor,
  backupHotelId: string
) {
  const allowedHotelId = resolveBackupHotelId(
    actor,
    actor.role === Role.SUPER_ADMIN ? backupHotelId : actor.hotelId
  );

  if (allowedHotelId !== backupHotelId) {
    throw new Error('You cannot access this backup.');
  }
}
