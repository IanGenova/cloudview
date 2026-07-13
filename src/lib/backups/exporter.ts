import type { DataBackupType } from '@prisma/client';
import { db } from '@/lib/db';
import {
  SANITIZED_FIELDS,
  type BackupManifest,
  type BackupModule,
  type BackupRecordCounts,
  modulesForBackupType,
} from './types';
import { normalizeForBackup } from './serialization';

type ModuleData = Record<string, unknown>;

function withoutKeys<T extends Record<string, unknown>>(
  value: T,
  keys: string[]
) {
  const copy = { ...value };

  for (const key of keys) {
    delete copy[key];
  }

  return copy;
}

function countModuleRecords(
  module: BackupModule,
  value: ModuleData,
  output: BackupRecordCounts
) {
  for (const [key, item] of Object.entries(value)) {
    if (Array.isArray(item)) {
      output[`${module}.${key}`] = item.length;
    } else if (item && typeof item === 'object') {
      output[`${module}.${key}`] = 1;
    }
  }
}

export async function exportHotelBackup(input: {
  hotelId: string;
  createdByUserId: string | null;
  backupType: DataBackupType;
  modules?: BackupModule[];
}) {
  const hotel = await db.hotel.findUnique({
    where: { id: input.hotelId },
  });

  if (!hotel) {
    throw new Error('Hotel was not found.');
  }

  const modules = input.modules?.length
    ? input.modules
    : modulesForBackupType(input.backupType);

  const exported: Partial<Record<BackupModule, ModuleData>> = {};
  const recordCounts: BackupRecordCounts = {};

  for (const module of modules) {
    const data = await exportModule(module, input.hotelId);
    exported[module] = normalizeForBackup(data) as ModuleData;
    countModuleRecords(module, data, recordCounts);
  }

  const manifest: BackupManifest = {
    application: 'CloudView',
    backupVersion: 1,
    schemaVersion: '2026.07.12.1',
    createdAt: new Date().toISOString(),
    createdByUserId: input.createdByUserId,
    hotelId: hotel.id,
    hotelName: hotel.name,
    hotelSlug: hotel.slug,
    backupType: input.backupType,
    modules,
    recordCounts,
    sanitizedFields: [...SANITIZED_FIELDS],
  };

  return {
    hotel,
    manifest,
    modules: exported,
    recordCounts,
  };
}

async function exportModule(
  module: BackupModule,
  hotelId: string
): Promise<ModuleData> {
  switch (module) {
    case 'HOTEL':
      return exportHotelModule(hotelId);
    case 'ROOMS_LOCATIONS':
      return exportRoomsLocationsModule(hotelId);
    case 'NFC_TAGS':
      return exportNfcTagsModule(hotelId);
    case 'HOTEL_GUIDE':
      return exportHotelGuideModule(hotelId);
    case 'MENU':
      return exportMenuModule(hotelId);
    case 'INVENTORY':
      return exportInventoryModule(hotelId);
    case 'SERVICES':
      return exportServicesModule(hotelId);
    case 'USERS_PERMISSIONS':
      return exportUsersPermissionsModule(hotelId);
    case 'GUESTS_STAYS':
      return exportGuestsStaysModule(hotelId);
    case 'ORDERS':
      return exportOrdersModule(hotelId);
    case 'SERVICE_REQUESTS':
      return exportServiceRequestsModule(hotelId);
    case 'REWARDS':
      return exportRewardsModule(hotelId);
    case 'ACTIVITY_NOTIFICATIONS':
      return exportActivityNotificationsModule(hotelId);
  }
}

async function exportHotelModule(hotelId: string) {
  const [hotel, settings, subscription, posIntegration] = await Promise.all([
    db.hotel.findUnique({ where: { id: hotelId } }),
    db.hotelSettings.findUnique({ where: { hotelId } }),
    db.hotelSubscription.findUnique({
      where: { hotelId },
      include: {
        package: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),
    db.posIntegration.findUnique({ where: { hotelId } }),
  ]);

  return {
    hotel,
    settings,
    subscription,
    posIntegration: posIntegration
      ? withoutKeys(
          posIntegration as unknown as Record<string, unknown>,
          ['apiKeyEncrypted', 'webhookSecret']
        )
      : null,
  };
}

async function exportRoomsLocationsModule(hotelId: string) {
  const [rooms, locations] = await Promise.all([
    db.room.findMany({
      where: { hotelId },
      orderBy: [{ number: 'asc' }, { createdAt: 'asc' }],
    }),
    db.location.findMany({
      where: { hotelId },
      orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
    }),
  ]);

  return { rooms, locations };
}

async function exportNfcTagsModule(hotelId: string) {
  const tags = await db.nfcTag.findMany({
    where: { hotelId },
    orderBy: { createdAt: 'asc' },
  });

  return {
    tags: tags.map((tag) =>
      withoutKeys(tag as unknown as Record<string, unknown>, ['scanSecret'])
    ),
  };
}

async function exportHotelGuideModule(hotelId: string) {
  const [sections, items, images] = await Promise.all([
    db.hotelGuideSection.findMany({
      where: { hotelId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    db.hotelGuideItem.findMany({
      where: { hotelId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    db.hotelGuideImage.findMany({
      where: { hotelId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
  ]);

  return { sections, items, images };
}

async function exportMenuModule(hotelId: string) {
  const [categories, products, images, bundleComponents] = await Promise.all([
    db.menuCategory.findMany({
      where: { hotelId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    db.menuProduct.findMany({
      where: { hotelId },
      orderBy: { createdAt: 'asc' },
    }),
    db.productImage.findMany({
      where: { product: { hotelId } },
      orderBy: [{ productId: 'asc' }, { sortOrder: 'asc' }],
    }),
    db.menuBundleComponent.findMany({
      where: { hotelId },
      orderBy: [{ bundleProductId: 'asc' }, { sortOrder: 'asc' }],
    }),
  ]);

  return { categories, products, images, bundleComponents };
}

async function exportInventoryModule(hotelId: string) {
  const [
    inventoryItems,
    recipes,
    inventoryMovements,
    menuDailyStocks,
    menuDailyStockMovements,
    menuAvailabilityStocks,
    menuAvailabilityMovements,
  ] = await Promise.all([
    db.inventoryItem.findMany({
      where: { hotelId },
      orderBy: { createdAt: 'asc' },
    }),
    db.productInventoryRecipe.findMany({
      where: { product: { hotelId } },
      orderBy: { id: 'asc' },
    }),
    db.inventoryMovement.findMany({
      where: { hotelId },
      orderBy: { createdAt: 'asc' },
    }),
    db.menuDailyStock.findMany({
      where: { hotelId },
      orderBy: [{ stockDate: 'asc' }, { createdAt: 'asc' }],
    }),
    db.menuDailyStockMovement.findMany({
      where: { hotelId },
      orderBy: { createdAt: 'asc' },
    }),
    db.menuAvailabilityStock.findMany({
      where: { hotelId },
      orderBy: { createdAt: 'asc' },
    }),
    db.menuAvailabilityMovement.findMany({
      where: { hotelId },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  return {
    inventoryItems,
    recipes,
    inventoryMovements,
    menuDailyStocks,
    menuDailyStockMovements,
    menuAvailabilityStocks,
    menuAvailabilityMovements,
  };
}

async function exportServicesModule(hotelId: string) {
  const [
    serviceCatalogItems,
    serviceAvailabilityStocks,
    serviceAvailabilityMovements,
    roomAddOnCharges,
  ] = await Promise.all([
    db.serviceCatalogItem.findMany({
      where: { hotelId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    db.serviceAvailabilityStock.findMany({
      where: { hotelId },
      orderBy: { createdAt: 'asc' },
    }),
    db.serviceAvailabilityMovement.findMany({
      where: { hotelId },
      orderBy: { createdAt: 'asc' },
    }),
    db.roomAddOnCharge.findMany({
      where: { hotelId },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  return {
    serviceCatalogItems,
    serviceAvailabilityStocks,
    serviceAvailabilityMovements,
    roomAddOnCharges,
  };
}

async function exportUsersPermissionsModule(hotelId: string) {
  const users = await db.user.findMany({
    where: { hotelId },
    orderBy: { createdAt: 'asc' },
  });

  const permissions = await db.userDashboardPermission.findMany({
    where: {
      user: {
        hotelId,
      },
    },
    orderBy: [{ userId: 'asc' }, { module: 'asc' }],
  });

  return {
    users: users.map((user) =>
      withoutKeys(user as unknown as Record<string, unknown>, ['passwordHash'])
    ),
    permissions,
  };
}

async function exportGuestsStaysModule(hotelId: string) {
  const [
    guestMembers,
    guestStays,
    nfcGuestSessions,
    guestStayFolios,
    guestStayFolioLines,
    guestStayFolioPayments,
  ] = await Promise.all([
    db.guestMember.findMany({
      where: { hotelId },
      orderBy: { createdAt: 'asc' },
    }),
    db.guestStay.findMany({
      where: { hotelId },
      orderBy: { createdAt: 'asc' },
    }),
    db.nfcGuestSession.findMany({
      where: { hotelId },
      orderBy: { startedAt: 'asc' },
    }),
    db.guestStayFolio.findMany({
      where: { hotelId },
      orderBy: { createdAt: 'asc' },
    }),
    db.guestStayFolioLine.findMany({
      where: { hotelId },
      orderBy: { createdAt: 'asc' },
    }),
    db.guestStayFolioPayment.findMany({
      where: { hotelId },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  return {
    guestMembers,
    guestStays: guestStays.map((stay) =>
      withoutKeys(stay as unknown as Record<string, unknown>, [
        'passcodeHash',
        'passcodeEncrypted',
      ])
    ),
    nfcGuestSessions: nfcGuestSessions.map((session) =>
      withoutKeys(session as unknown as Record<string, unknown>, ['sessionKey'])
    ),
    guestStayFolios,
    guestStayFolioLines,
    guestStayFolioPayments,
  };
}

async function exportOrdersModule(hotelId: string) {
  const [
    orders,
    orderItems,
    orderItemBundleComponents,
    orderStatusHistory,
    posSyncLogs,
    guestXenditSessions,
    guestXenditRefunds,
    posXenditSessions,
  ] = await Promise.all([
    db.order.findMany({
      where: { hotelId },
      orderBy: { createdAt: 'asc' },
    }),
    db.orderItem.findMany({
      where: { order: { hotelId } },
      orderBy: { createdAt: 'asc' },
    }),
    db.orderItemBundleComponent.findMany({
      where: { orderItem: { order: { hotelId } } },
      orderBy: { createdAt: 'asc' },
    }),
    db.orderStatusHistory.findMany({
      where: { order: { hotelId } },
      orderBy: { createdAt: 'asc' },
    }),
    db.posSyncLog.findMany({
      where: { hotelId },
      orderBy: { createdAt: 'asc' },
    }),
    db.guestXenditSession.findMany({
      where: { hotelId },
      orderBy: { createdAt: 'asc' },
    }),
    db.guestXenditRefund.findMany({
      where: {
        guestPaymentSession: {
          hotelId,
        },
      },
      orderBy: { createdAt: 'asc' },
    }),
    db.posXenditSession.findMany({
      where: { hotelId },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  return {
    orders,
    orderItems,
    orderItemBundleComponents,
    orderStatusHistory,
    posSyncLogs,
    guestXenditSessions,
    guestXenditRefunds,
    posXenditSessions,
  };
}

async function exportServiceRequestsModule(hotelId: string) {
  const [serviceRequests, attachments, statusHistory] = await Promise.all([
    db.serviceRequest.findMany({
      where: { hotelId },
      orderBy: { createdAt: 'asc' },
    }),
    db.serviceRequestAttachment.findMany({
      where: { hotelId },
      orderBy: { createdAt: 'asc' },
    }),
    db.serviceRequestStatusHistory.findMany({
      where: { request: { hotelId } },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  return { serviceRequests, attachments, statusHistory };
}

async function exportRewardsModule(hotelId: string) {
  const [
    guestPointSettings,
    rewards,
    rewardRedemptions,
    guestPointAccounts,
    guestPointLedgers,
  ] = await Promise.all([
    db.guestPointSettings.findUnique({ where: { hotelId } }),
    db.reward.findMany({
      where: { hotelId },
      orderBy: { createdAt: 'asc' },
    }),
    db.rewardRedemption.findMany({
      where: { hotelId },
      orderBy: { createdAt: 'asc' },
    }),
    db.guestPointAccount.findMany({
      where: { hotelId },
      orderBy: { createdAt: 'asc' },
    }),
    db.guestPointLedger.findMany({
      where: { hotelId },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  return {
    guestPointSettings,
    rewards,
    rewardRedemptions,
    guestPointAccounts,
    guestPointLedgers,
  };
}

async function exportActivityNotificationsModule(hotelId: string) {
  const [activityLogs, dashboardNotifications] = await Promise.all([
    db.activityLog.findMany({
      where: { hotelId },
      orderBy: { createdAt: 'asc' },
    }),
    db.dashboardNotification.findMany({
      where: { hotelId },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  return { activityLogs, dashboardNotifications };
}
