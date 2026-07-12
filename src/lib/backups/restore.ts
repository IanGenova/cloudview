import { randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import {
  DataBackupStatus,
  GuestPayMongoStatus,
  GuestStayStatus,
  POSPayMongoStatus,
  Prisma,
} from '@prisma/client';
import { db } from '@/lib/db';
import type { BackupArchiveContent, BackupModule } from './types';

type JsonRow = Record<string, any>;
type UserIdMap = Map<string, string>;

function moduleData(
  archive: BackupArchiveContent,
  module: BackupModule
): JsonRow {
  return (archive.modules[module] ?? {}) as JsonRow;
}

function rows(data: JsonRow, key: string): JsonRow[] {
  return Array.isArray(data[key]) ? (data[key] as JsonRow[]) : [];
}

function objectOrNull(data: JsonRow, key: string): JsonRow | null {
  const value = data[key];

  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRow)
    : null;
}

function withHotelId(row: JsonRow, hotelId: string) {
  return {
    ...row,
    hotelId,
  };
}

function omit(row: JsonRow, keys: string[]) {
  const result = { ...row };

  for (const key of keys) {
    delete result[key];
  }

  return result;
}

function terminalGuestPaymentStatus(status: unknown) {
  return (
    status === GuestPayMongoStatus.COMPLETED ||
    status === GuestPayMongoStatus.REFUNDED ||
    status === GuestPayMongoStatus.CANCELLED ||
    status === GuestPayMongoStatus.EXPIRED ||
    status === GuestPayMongoStatus.FAILED
  );
}

function terminalPosPaymentStatus(status: unknown) {
  return (
    status === POSPayMongoStatus.COMPLETED ||
    status === POSPayMongoStatus.CANCELLED ||
    status === POSPayMongoStatus.FAILED
  );
}

export async function performFullHotelRestore(input: {
  restoreId: string;
  targetHotelId: string;
  archive: BackupArchiveContent;
}) {
  if (input.archive.manifest.hotelId !== input.targetHotelId) {
    throw new Error(
      'This development restore requires the backup hotel and target hotel to match.'
    );
  }

  await updateRestorePhase(input.restoreId, 'Preparing user references');
  const userContext = await prepareUserContext(
    input.targetHotelId,
    input.archive
  );

  await updateRestorePhase(input.restoreId, 'Removing current operational data');
  await deleteOperationalData(input.targetHotelId);

  await updateRestorePhase(input.restoreId, 'Removing current guest and catalog data');
  await deleteGuestAndCatalogData(input.targetHotelId);

  await updateRestorePhase(input.restoreId, 'Restoring hotel configuration');
  await restoreHotelConfiguration(input.targetHotelId, input.archive);

  await updateRestorePhase(input.restoreId, 'Restoring users and permissions');
  const restoredUserMap = await restoreUsersAndPermissions(
    input.targetHotelId,
    input.archive,
    userContext
  );

  await updateRestorePhase(input.restoreId, 'Restoring rooms, NFC, guide, menu, and services');
  await restoreCatalogs(input.targetHotelId, input.archive);

  await updateRestorePhase(input.restoreId, 'Restoring guests and stays');
  await restoreGuestsAndStays(
    input.targetHotelId,
    input.archive,
    restoredUserMap,
    userContext.existingUserIds
  );

  await updateRestorePhase(input.restoreId, 'Restoring orders and payment history');
  await restoreOrdersAndPayments(
    input.targetHotelId,
    input.archive,
    restoredUserMap,
    userContext.existingUserIds
  );

  await updateRestorePhase(input.restoreId, 'Restoring service requests and folios');
  await restoreServiceRequestsAndFolios(
    input.targetHotelId,
    input.archive,
    restoredUserMap,
    userContext.existingUserIds
  );

  await updateRestorePhase(input.restoreId, 'Restoring inventory, rewards, and audit data');
  await restoreOperationalTail(
    input.targetHotelId,
    input.archive,
    restoredUserMap,
    userContext.existingUserIds
  );

  return input.archive.manifest.recordCounts;
}

async function updateRestorePhase(restoreId: string, currentPhase: string) {
  await db.dataRestore.update({
    where: { id: restoreId },
    data: { currentPhase },
  });
}

async function prepareUserContext(
  hotelId: string,
  archive: BackupArchiveContent
) {
  const userData = moduleData(archive, 'USERS_PERMISSIONS');
  const backupUsers = rows(userData, 'users');

  const existingUsers = await db.user.findMany({
    select: {
      id: true,
      email: true,
      hotelId: true,
    },
  });

  const existingUserIds = new Set(existingUsers.map((user) => user.id));
  const existingByEmail = new Map(
    existingUsers.map((user) => [user.email.toLowerCase(), user])
  );

  return {
    hotelId,
    backupUsers,
    existingUserIds,
    existingByEmail,
  };
}

function mappedUserId(
  originalId: unknown,
  userMap: UserIdMap,
  existingUserIds: Set<string>
) {
  if (typeof originalId !== 'string' || !originalId) {
    return null;
  }

  return userMap.get(originalId) ??
    (existingUserIds.has(originalId) ? originalId : null);
}

async function deleteOperationalData(hotelId: string) {
  await db.$transaction(
    async (tx) => {
      await tx.dashboardNotification.deleteMany({ where: { hotelId } });
      await tx.activityLog.deleteMany({ where: { hotelId } });

      await tx.guestPayMongoRefund.deleteMany({
        where: { guestPaymentSession: { hotelId } },
      });
      await tx.guestPayMongoSession.deleteMany({ where: { hotelId } });
      await tx.posPayMongoSession.deleteMany({ where: { hotelId } });

      await tx.serviceRequestAttachment.deleteMany({ where: { hotelId } });
      await tx.serviceRequestStatusHistory.deleteMany({
        where: { request: { hotelId } },
      });
      await tx.serviceRequest.deleteMany({ where: { hotelId } });
      await tx.roomAddOnCharge.deleteMany({ where: { hotelId } });

      await tx.orderItemBundleComponent.deleteMany({
        where: { orderItem: { order: { hotelId } } },
      });
      await tx.orderStatusHistory.deleteMany({
        where: { order: { hotelId } },
      });
      await tx.posSyncLog.deleteMany({ where: { hotelId } });
      await tx.inventoryMovement.deleteMany({ where: { hotelId } });
      await tx.orderItem.deleteMany({
        where: { order: { hotelId } },
      });
      await tx.order.deleteMany({ where: { hotelId } });

      await tx.guestStayFolioPayment.deleteMany({ where: { hotelId } });
      await tx.guestStayFolioLine.deleteMany({ where: { hotelId } });
      await tx.guestStayFolio.deleteMany({ where: { hotelId } });
    },
    {
      maxWait: 20_000,
      timeout: 120_000,
    }
  );
}

async function deleteGuestAndCatalogData(hotelId: string) {
  await db.$transaction(
    async (tx) => {
      await tx.rewardRedemption.deleteMany({ where: { hotelId } });
      await tx.guestPointLedger.deleteMany({ where: { hotelId } });
      await tx.guestPointAccount.deleteMany({ where: { hotelId } });

      await tx.nfcGuestSession.deleteMany({ where: { hotelId } });
      await tx.guestStay.deleteMany({ where: { hotelId } });
      await tx.guestMember.deleteMany({ where: { hotelId } });

      await tx.serviceAvailabilityMovement.deleteMany({ where: { hotelId } });
      await tx.serviceAvailabilityStock.deleteMany({ where: { hotelId } });
      await tx.serviceCatalogItem.deleteMany({ where: { hotelId } });

      await tx.menuDailyStockMovement.deleteMany({ where: { hotelId } });
      await tx.menuDailyStock.deleteMany({ where: { hotelId } });
      await tx.menuAvailabilityMovement.deleteMany({ where: { hotelId } });
      await tx.menuAvailabilityStock.deleteMany({ where: { hotelId } });

      await tx.productInventoryRecipe.deleteMany({
        where: { product: { hotelId } },
      });
      await tx.inventoryItem.deleteMany({ where: { hotelId } });

      await tx.menuBundleComponent.deleteMany({ where: { hotelId } });
      await tx.productImage.deleteMany({
        where: { product: { hotelId } },
      });
      await tx.menuProduct.deleteMany({ where: { hotelId } });
      await tx.menuCategory.deleteMany({ where: { hotelId } });

      await tx.hotelGuideImage.deleteMany({ where: { hotelId } });
      await tx.hotelGuideItem.deleteMany({ where: { hotelId } });
      await tx.hotelGuideSection.deleteMany({ where: { hotelId } });

      await tx.nfcTag.deleteMany({ where: { hotelId } });
      await tx.room.deleteMany({ where: { hotelId } });
      await tx.location.deleteMany({ where: { hotelId } });

      await tx.guestPointSettings.deleteMany({ where: { hotelId } });
      await tx.reward.deleteMany({ where: { hotelId } });

      await tx.userDashboardPermission.deleteMany({
        where: { user: { hotelId } },
      });

      await tx.hotelSettings.deleteMany({ where: { hotelId } });
      await tx.posIntegration.deleteMany({ where: { hotelId } });
      await tx.hotelSubscription.deleteMany({ where: { hotelId } });
    },
    {
      maxWait: 20_000,
      timeout: 120_000,
    }
  );
}

async function restoreHotelConfiguration(
  hotelId: string,
  archive: BackupArchiveContent
) {
  const hotelData = moduleData(archive, 'HOTEL');
  const hotel = objectOrNull(hotelData, 'hotel');
  const settings = objectOrNull(hotelData, 'settings');
  const subscription = objectOrNull(hotelData, 'subscription');
  const posIntegration = objectOrNull(hotelData, 'posIntegration');

  await db.$transaction(
    async (tx) => {
      if (hotel) {
        await tx.hotel.update({
          where: { id: hotelId },
          data: omit(hotel, ['id', 'createdAt', 'updatedAt']) as Prisma.HotelUpdateInput,
        });
      }

      if (settings) {
        await tx.hotelSettings.create({
          data: withHotelId(
            omit(settings, ['hotelId']),
            hotelId
          ) as Prisma.HotelSettingsCreateManyInput,
        });
      }

      if (posIntegration) {
        await tx.posIntegration.create({
          data: {
            ...withHotelId(
              omit(posIntegration, [
                'hotelId',
                'apiKeyEncrypted',
                'webhookSecret',
              ]),
              hotelId
            ),
            apiKeyEncrypted: null,
            webhookSecret: null,
          } as Prisma.PosIntegrationCreateManyInput,
        });
      }

      if (subscription) {
        const packageRecord =
          (typeof subscription.packageId === 'string'
            ? await tx.subscriptionPackage.findUnique({
                where: { id: subscription.packageId },
              })
            : null) ??
          (typeof subscription.package === 'object' &&
          subscription.package &&
          typeof subscription.package.name === 'string'
            ? await tx.subscriptionPackage.findUnique({
                where: { name: subscription.package.name },
              })
            : null);

        if (packageRecord) {
          await tx.hotelSubscription.create({
            data: {
              ...withHotelId(
                omit(subscription, ['hotelId', 'package']),
                hotelId
              ),
              packageId: packageRecord.id,
            } as Prisma.HotelSubscriptionCreateManyInput,
          });
        }
      }
    },
    {
      maxWait: 20_000,
      timeout: 60_000,
    }
  );
}

async function restoreUsersAndPermissions(
  hotelId: string,
  archive: BackupArchiveContent,
  context: Awaited<ReturnType<typeof prepareUserContext>>
) {
  const data = moduleData(archive, 'USERS_PERMISSIONS');
  const backupUsers = rows(data, 'users');
  const permissions = rows(data, 'permissions');
  const userMap: UserIdMap = new Map();
  const placeholderPasswordHash = await bcrypt.hash(
    randomBytes(32).toString('hex'),
    12
  );

  for (const backupUser of backupUsers) {
    const backupId = String(backupUser.id || '');
    const email = String(backupUser.email || '').toLowerCase();

    if (!backupId || !email) {
      continue;
    }

    const existing =
      context.existingByEmail.get(email) ??
      (context.existingUserIds.has(backupId)
        ? await db.user.findUnique({ where: { id: backupId } })
        : null);

    if (existing) {
      await db.user.update({
        where: { id: existing.id },
        data: {
          name: String(backupUser.name || 'Restored User'),
          role: backupUser.role,
          hotelId,
          isActive: Boolean(backupUser.isActive),
        } as Prisma.UserUpdateInput,
      });

      userMap.set(backupId, existing.id);
      context.existingUserIds.add(existing.id);
      continue;
    }

    const created = await db.user.create({
      data: {
        id: backupId,
        name: String(backupUser.name || 'Restored User'),
        email,
        passwordHash: placeholderPasswordHash,
        role: backupUser.role,
        hotelId,
        isActive: false,
        createdAt: backupUser.createdAt,
        updatedAt: backupUser.updatedAt,
      } as Prisma.UserUncheckedCreateInput,
      select: { id: true },
    });

    userMap.set(backupId, created.id);
    context.existingUserIds.add(created.id);
  }

  const permissionRows = permissions
    .map((permission) => {
      const userId = mappedUserId(
        permission.userId,
        userMap,
        context.existingUserIds
      );

      if (!userId) {
        return null;
      }

      return {
        ...permission,
        userId,
      };
    })
    .filter(Boolean) as Prisma.UserDashboardPermissionCreateManyInput[];

  if (permissionRows.length) {
    await db.userDashboardPermission.createMany({
      data: permissionRows,
      skipDuplicates: true,
    });
  }

  return userMap;
}

async function restoreCatalogs(
  hotelId: string,
  archive: BackupArchiveContent
) {
  const roomsData = moduleData(archive, 'ROOMS_LOCATIONS');
  const nfcData = moduleData(archive, 'NFC_TAGS');
  const guideData = moduleData(archive, 'HOTEL_GUIDE');
  const menuData = moduleData(archive, 'MENU');
  const inventoryData = moduleData(archive, 'INVENTORY');
  const servicesData = moduleData(archive, 'SERVICES');
  const rewardsData = moduleData(archive, 'REWARDS');

  await db.$transaction(
    async (tx) => {
      await createMany(tx.room, rows(roomsData, 'rooms'), hotelId);
      await createMany(tx.location, rows(roomsData, 'locations'), hotelId);
      await createMany(tx.nfcTag, rows(nfcData, 'tags'), hotelId);

      await createMany(
        tx.hotelGuideSection,
        rows(guideData, 'sections'),
        hotelId
      );
      await createMany(tx.hotelGuideItem, rows(guideData, 'items'), hotelId);
      await createMany(tx.hotelGuideImage, rows(guideData, 'images'), hotelId);

      await createMany(
        tx.menuCategory,
        rows(menuData, 'categories'),
        hotelId
      );
      await createMany(tx.menuProduct, rows(menuData, 'products'), hotelId);
      await createManyWithoutHotelId(
        tx.productImage,
        rows(menuData, 'images')
      );
      await createMany(
        tx.menuBundleComponent,
        rows(menuData, 'bundleComponents'),
        hotelId
      );

      await createMany(
        tx.inventoryItem,
        rows(inventoryData, 'inventoryItems'),
        hotelId
      );
      await createManyWithoutHotelId(
        tx.productInventoryRecipe,
        rows(inventoryData, 'recipes')
      );

      await createMany(
        tx.menuDailyStock,
        rows(inventoryData, 'menuDailyStocks'),
        hotelId
      );
      await createMany(
        tx.menuDailyStockMovement,
        rows(inventoryData, 'menuDailyStockMovements'),
        hotelId
      );
      await createMany(
        tx.menuAvailabilityStock,
        rows(inventoryData, 'menuAvailabilityStocks'),
        hotelId
      );
      await createMany(
        tx.menuAvailabilityMovement,
        rows(inventoryData, 'menuAvailabilityMovements'),
        hotelId
      );

      await createMany(
        tx.serviceCatalogItem,
        rows(servicesData, 'serviceCatalogItems'),
        hotelId
      );
      await createMany(
        tx.serviceAvailabilityStock,
        rows(servicesData, 'serviceAvailabilityStocks'),
        hotelId
      );

      const pointSettings = objectOrNull(rewardsData, 'guestPointSettings');

      if (pointSettings) {
        await tx.guestPointSettings.create({
          data: withHotelId(
            omit(pointSettings, ['hotelId']),
            hotelId
          ) as Prisma.GuestPointSettingsCreateManyInput,
        });
      }

      await createMany(tx.reward, rows(rewardsData, 'rewards'), hotelId);
    },
    {
      maxWait: 20_000,
      timeout: 120_000,
    }
  );
}

async function restoreGuestsAndStays(
  hotelId: string,
  archive: BackupArchiveContent,
  userMap: UserIdMap,
  existingUserIds: Set<string>
) {
  const data = moduleData(archive, 'GUESTS_STAYS');
  const placeholderPasscodeHash = await bcrypt.hash(
    randomBytes(32).toString('hex'),
    12
  );

  await db.$transaction(
    async (tx) => {
      await createMany(tx.guestMember, rows(data, 'guestMembers'), hotelId);

      const stays = rows(data, 'guestStays').map((stay) => {
        const wasActive = stay.status === GuestStayStatus.ACTIVE;

        return {
          ...withHotelId(stay, hotelId),
          passcodeHash: placeholderPasscodeHash,
          passcodeEncrypted: null,
          status: wasActive ? GuestStayStatus.EXPIRED : stay.status,
          checkedOutAt: wasActive
            ? new Date().toISOString()
            : stay.checkedOutAt,
          checkedOutById: mappedUserId(
            stay.checkedOutById,
            userMap,
            existingUserIds
          ),
        };
      });

      if (stays.length) {
        await tx.guestStay.createMany({
          data: stays as Prisma.GuestStayCreateManyInput[],
        });
      }

      const sessions = rows(data, 'nfcGuestSessions').map((session) => ({
        ...withHotelId(session, hotelId),
        sessionKey: randomUUID(),
        endedAt: session.endedAt || new Date().toISOString(),
      }));

      if (sessions.length) {
        await tx.nfcGuestSession.createMany({
          data: sessions as Prisma.NfcGuestSessionCreateManyInput[],
        });
      }

      const folios = rows(data, 'guestStayFolios').map((folio) => ({
        ...withHotelId(folio, hotelId),
        createdById: mappedUserId(
          folio.createdById,
          userMap,
          existingUserIds
        ),
        closedById: mappedUserId(
          folio.closedById,
          userMap,
          existingUserIds
        ),
      }));

      if (folios.length) {
        await tx.guestStayFolio.createMany({
          data: folios as Prisma.GuestStayFolioCreateManyInput[],
        });
      }
    },
    {
      maxWait: 20_000,
      timeout: 120_000,
    }
  );
}

async function restoreOrdersAndPayments(
  hotelId: string,
  archive: BackupArchiveContent,
  userMap: UserIdMap,
  existingUserIds: Set<string>
) {
  const ordersData = moduleData(archive, 'ORDERS');

  await db.$transaction(
    async (tx) => {
      await createMany(tx.order, rows(ordersData, 'orders'), hotelId);

      const orderItems = rows(ordersData, 'orderItems').map((item) => ({
        ...item,
        cancelledById:
          mappedUserId(item.cancelledById, userMap, existingUserIds) ??
          item.cancelledById ??
          null,
      }));

      if (orderItems.length) {
        await tx.orderItem.createMany({
          data: orderItems as Prisma.OrderItemCreateManyInput[],
        });
      }

      await createManyWithoutHotelId(
        tx.orderItemBundleComponent,
        rows(ordersData, 'orderItemBundleComponents')
      );

      const history = rows(ordersData, 'orderStatusHistory').map((item) => ({
        ...item,
        userId: mappedUserId(item.userId, userMap, existingUserIds),
      }));

      if (history.length) {
        await tx.orderStatusHistory.createMany({
          data: history as Prisma.OrderStatusHistoryCreateManyInput[],
        });
      }

      await createMany(
        tx.posSyncLog,
        rows(ordersData, 'posSyncLogs'),
        hotelId
      );
    },
    {
      maxWait: 20_000,
      timeout: 120_000,
    }
  );

  await db.$transaction(
    async (tx) => {
      const sessions = rows(ordersData, 'guestPayMongoSessions').map(
        (session) => {
          const terminal = terminalGuestPaymentStatus(session.status);

          return {
            ...withHotelId(session, hotelId),
            status: terminal
              ? session.status
              : GuestPayMongoStatus.PAID_REVIEW_REQUIRED,
            automaticRefundEnabled: terminal
              ? Boolean(session.automaticRefundEnabled)
              : false,
            checkoutSessionId: terminal ? session.checkoutSessionId : null,
            checkoutUrl: terminal ? session.checkoutUrl : null,
            processingStartedAt: null,
            errorMessage: terminal
              ? session.errorMessage
              : 'Restored unresolved payment session. Manual review required.',
          };
        }
      );

      if (sessions.length) {
        await tx.guestPayMongoSession.createMany({
          data: sessions as Prisma.GuestPayMongoSessionCreateManyInput[],
        });
      }

      await createManyWithoutHotelId(
        tx.guestPayMongoRefund,
        rows(ordersData, 'guestPayMongoRefunds')
      );

      const posSessions = rows(ordersData, 'posPayMongoSessions').map(
        (session) => {
          const terminal = terminalPosPaymentStatus(session.status);

          return {
            ...withHotelId(session, hotelId),
            status: terminal
              ? session.status
              : POSPayMongoStatus.PAID_REVIEW_REQUIRED,
            checkoutSessionId: terminal ? session.checkoutSessionId : null,
            checkoutUrl: terminal ? session.checkoutUrl : null,
            processingStartedAt: null,
            errorMessage: terminal
              ? session.errorMessage
              : 'Restored unresolved POS payment session. Manual review required.',
          };
        }
      );

      if (posSessions.length) {
        await tx.posPayMongoSession.createMany({
          data: posSessions as Prisma.PosPayMongoSessionCreateManyInput[],
        });
      }
    },
    {
      maxWait: 20_000,
      timeout: 120_000,
    }
  );
}

async function restoreServiceRequestsAndFolios(
  hotelId: string,
  archive: BackupArchiveContent,
  userMap: UserIdMap,
  existingUserIds: Set<string>
) {
  const serviceData = moduleData(archive, 'SERVICE_REQUESTS');
  const servicesCatalogData = moduleData(archive, 'SERVICES');
  const guestsData = moduleData(archive, 'GUESTS_STAYS');

  await db.$transaction(
    async (tx) => {
      const requests = rows(serviceData, 'serviceRequests').map((request) => ({
        ...withHotelId(request, hotelId),
        assignedToId: mappedUserId(
          request.assignedToId,
          userMap,
          existingUserIds
        ),
        cancelledById:
          mappedUserId(
            request.cancelledById,
            userMap,
            existingUserIds
          ) ?? request.cancelledById ?? null,
      }));

      if (requests.length) {
        await tx.serviceRequest.createMany({
          data: requests as Prisma.ServiceRequestCreateManyInput[],
        });
      }

      const attachments = rows(serviceData, 'attachments').map(
        (attachment) => ({
          ...withHotelId(attachment, hotelId),
          uploadedById: mappedUserId(
            attachment.uploadedById,
            userMap,
            existingUserIds
          ),
        })
      );

      if (attachments.length) {
        await tx.serviceRequestAttachment.createMany({
          data:
            attachments as Prisma.ServiceRequestAttachmentCreateManyInput[],
        });
      }

      const statusHistory = rows(serviceData, 'statusHistory').map(
        (history) => ({
          ...history,
          userId: mappedUserId(
            history.userId,
            userMap,
            existingUserIds
          ),
        })
      );

      if (statusHistory.length) {
        await tx.serviceRequestStatusHistory.createMany({
          data:
            statusHistory as Prisma.ServiceRequestStatusHistoryCreateManyInput[],
        });
      }

      const addOnCharges = rows(
        servicesCatalogData,
        'roomAddOnCharges'
      ).map((charge) => ({
        ...withHotelId(charge, hotelId),
        paidById:
          mappedUserId(charge.paidById, userMap, existingUserIds) ??
          charge.paidById ??
          null,
        postedById:
          mappedUserId(charge.postedById, userMap, existingUserIds) ??
          charge.postedById ??
          null,
      }));

      if (addOnCharges.length) {
        await tx.roomAddOnCharge.createMany({
          data: addOnCharges as Prisma.RoomAddOnChargeCreateManyInput[],
        });
      }

      const folioLines = rows(guestsData, 'guestStayFolioLines').map(
        (line) => ({
          ...withHotelId(line, hotelId),
          postedById: mappedUserId(
            line.postedById,
            userMap,
            existingUserIds
          ),
        })
      );

      if (folioLines.length) {
        await tx.guestStayFolioLine.createMany({
          data: folioLines as Prisma.GuestStayFolioLineCreateManyInput[],
        });
      }

      const folioPayments = rows(
        guestsData,
        'guestStayFolioPayments'
      ).map((payment) => ({
        ...withHotelId(payment, hotelId),
        receivedById: mappedUserId(
          payment.receivedById,
          userMap,
          existingUserIds
        ),
      }));

      if (folioPayments.length) {
        await tx.guestStayFolioPayment.createMany({
          data:
            folioPayments as Prisma.GuestStayFolioPaymentCreateManyInput[],
        });
      }
    },
    {
      maxWait: 20_000,
      timeout: 120_000,
    }
  );
}

async function restoreOperationalTail(
  hotelId: string,
  archive: BackupArchiveContent,
  userMap: UserIdMap,
  existingUserIds: Set<string>
) {
  const inventoryData = moduleData(archive, 'INVENTORY');
  const servicesData = moduleData(archive, 'SERVICES');
  const rewardsData = moduleData(archive, 'REWARDS');
  const activityData = moduleData(archive, 'ACTIVITY_NOTIFICATIONS');

  await db.$transaction(
    async (tx) => {
      const inventoryMovements = rows(
        inventoryData,
        'inventoryMovements'
      ).map((movement) => ({
        ...withHotelId(movement, hotelId),
        userId: mappedUserId(
          movement.userId,
          userMap,
          existingUserIds
        ),
      }));

      if (inventoryMovements.length) {
        await tx.inventoryMovement.createMany({
          data:
            inventoryMovements as Prisma.InventoryMovementCreateManyInput[],
        });
      }

      const serviceMovements = rows(
        servicesData,
        'serviceAvailabilityMovements'
      ).map((movement) => ({
        ...withHotelId(movement, hotelId),
        userId:
          mappedUserId(
            movement.userId,
            userMap,
            existingUserIds
          ) ?? movement.userId ?? null,
      }));

      if (serviceMovements.length) {
        await tx.serviceAvailabilityMovement.createMany({
          data:
            serviceMovements as Prisma.ServiceAvailabilityMovementCreateManyInput[],
        });
      }

      await createMany(
        tx.guestPointAccount,
        rows(rewardsData, 'guestPointAccounts'),
        hotelId
      );

      const ledgers = rows(rewardsData, 'guestPointLedgers').map(
        (ledger) => ({
          ...withHotelId(ledger, hotelId),
          createdById: mappedUserId(
            ledger.createdById,
            userMap,
            existingUserIds
          ),
        })
      );

      if (ledgers.length) {
        await tx.guestPointLedger.createMany({
          data: ledgers as Prisma.GuestPointLedgerCreateManyInput[],
        });
      }

      await createMany(
        tx.rewardRedemption,
        rows(rewardsData, 'rewardRedemptions'),
        hotelId
      );

      const activityLogs = rows(activityData, 'activityLogs').map(
        (activity) => ({
          ...withHotelId(activity, hotelId),
          userId: mappedUserId(
            activity.userId,
            userMap,
            existingUserIds
          ),
        })
      );

      if (activityLogs.length) {
        await tx.activityLog.createMany({
          data: activityLogs as Prisma.ActivityLogCreateManyInput[],
        });
      }

      await createMany(
        tx.dashboardNotification,
        rows(activityData, 'dashboardNotifications'),
        hotelId
      );
    },
    {
      maxWait: 20_000,
      timeout: 120_000,
    }
  );
}

async function createMany(
  delegate: any,
  inputRows: JsonRow[],
  hotelId: string
) {
  if (!inputRows.length) {
    return;
  }

  await delegate.createMany({
    data: inputRows.map((row) => withHotelId(row, hotelId)),
    skipDuplicates: false,
  });
}

async function createManyWithoutHotelId(
  delegate: any,
  inputRows: JsonRow[]
) {
  if (!inputRows.length) {
    return;
  }

  await delegate.createMany({
    data: inputRows,
    skipDuplicates: false,
  });
}
