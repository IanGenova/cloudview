import type { DataBackupType } from '@prisma/client';

export const CLOUDVIEW_BACKUP_VERSION = 1;
export const CLOUDVIEW_BACKUP_SCHEMA_VERSION = '2026.07.12.1';

export const BACKUP_MODULES = [
  'HOTEL',
  'ROOMS_LOCATIONS',
  'NFC_TAGS',
  'HOTEL_GUIDE',
  'MENU',
  'INVENTORY',
  'SERVICES',
  'USERS_PERMISSIONS',
  'GUESTS_STAYS',
  'ORDERS',
  'SERVICE_REQUESTS',
  'REWARDS',
  'ACTIVITY_NOTIFICATIONS',
] as const;

export type BackupModule = (typeof BACKUP_MODULES)[number];

export type BackupRecordCounts = Record<string, number>;

export type BackupManifest = {
  application: 'CloudView';
  backupVersion: number;
  schemaVersion: string;
  createdAt: string;
  createdByUserId: string | null;
  hotelId: string;
  hotelName: string;
  hotelSlug: string;
  backupType: DataBackupType;
  modules: BackupModule[];
  recordCounts: BackupRecordCounts;
  sanitizedFields: string[];
};

export type BackupArchiveContent = {
  manifest: BackupManifest;
  modules: Partial<Record<BackupModule, Record<string, unknown>>>;
  checksums: Record<string, string>;
};

export const FULL_HOTEL_MODULES: BackupModule[] = [...BACKUP_MODULES];

export const CONFIGURATION_MODULES: BackupModule[] = [
  'HOTEL',
  'ROOMS_LOCATIONS',
  'NFC_TAGS',
  'HOTEL_GUIDE',
  'MENU',
  'INVENTORY',
  'SERVICES',
  'USERS_PERMISSIONS',
  'REWARDS',
];

export function modulesForBackupType(type: DataBackupType): BackupModule[] {
  if (type === 'CONFIGURATION') {
    return [...CONFIGURATION_MODULES];
  }

  return [...FULL_HOTEL_MODULES];
}

export function isBackupModule(value: unknown): value is BackupModule {
  return (
    typeof value === 'string' &&
    (BACKUP_MODULES as readonly string[]).includes(value)
  );
}

export function moduleFilename(module: BackupModule) {
  return `modules/${module.toLowerCase().replaceAll('_', '-')}.json`;
}

export const SANITIZED_FIELDS = [
  'User.passwordHash',
  'NfcTag.scanSecret',
  'NfcAccessSession.*',
  'NfcGuestSession.sessionKey',
  'GuestStay.passcodeHash',
  'GuestStay.passcodeEncrypted',
  'GuestStayDevice.*',
  'PosIntegration.apiKeyEncrypted',
  'PosIntegration.webhookSecret',
  'PayMongoWebhookEvent.*',
] as const;
