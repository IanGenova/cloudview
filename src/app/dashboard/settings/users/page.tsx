import { redirect } from 'next/navigation';
import { Role } from '@prisma/client';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { db } from '@/lib/db';
import { dashboardHomeForRole, requireUser } from '@/lib/auth';
import { UserAccountSettingsClient } from './UserAccountSettingsClient';

function getAllowedRoles(role: Role) {
  if (role === Role.SUPER_ADMIN) {
    return [Role.SUPER_ADMIN, Role.HOTEL_ADMIN, Role.STAFF, Role.KITCHEN];
  }

  return [Role.STAFF, Role.KITCHEN];
}

export default async function UserAccountSettingsPage() {
  const currentUser = await requireUser();

  /**
   * Critical fix:
   * Do not throw a raw Forbidden error in the page render.
   * Staff/Kitchen users can reach this page through a stale `next` URL after login,
   * so send them to their safe dashboard landing page instead.
   */
  if (
    currentUser.role !== Role.SUPER_ADMIN &&
    currentUser.role !== Role.HOTEL_ADMIN
  ) {
    redirect(dashboardHomeForRole(currentUser.role));
  }

  if (currentUser.role !== Role.SUPER_ADMIN && !currentUser.hotelId) {
    redirect(dashboardHomeForRole(currentUser.role));
  }

  const allowedRoles = getAllowedRoles(currentUser.role);

  const [hotels, userAccounts] = await Promise.all([
    currentUser.role === Role.SUPER_ADMIN
      ? db.hotel.findMany({
          select: {
            id: true,
            name: true,
          },
          orderBy: {
            name: 'asc',
          },
        })
      : db.hotel.findMany({
          where: {
            id: currentUser.hotelId!,
          },
          select: {
            id: true,
            name: true,
          },
          orderBy: {
            name: 'asc',
          },
        }),

    db.user.findMany({
      where:
        currentUser.role === Role.SUPER_ADMIN
          ? {}
          : {
              hotelId: currentUser.hotelId!,
            },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        hotelId: true,
        hotel: {
          select: {
            id: true,
            name: true,
          },
        },
        dashboardPermissions: {
          select: {
            module: true,
            canView: true,
            canCreate: true,
            canEdit: true,
            canDelete: true,
          },
          orderBy: {
            module: 'asc',
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    }),
  ]);

  const users = userAccounts.map((account) => ({
    id: account.id,
    name: account.name,
    email: account.email,
    role: account.role,
    hotelId: account.hotelId,
    hotel: account.hotel,
    dashboardPermissions: account.dashboardPermissions.map((permission) => ({
      module: permission.module,
      canView: permission.canView,
      canCreate: permission.canCreate,
      canEdit: permission.canEdit,
      canDelete: permission.canDelete,
    })),
  }));

  return (
    <div>
      <PageHeader
        title="User Account Settings"
        description="Create user accounts, assign hotel access, manage dashboard roles, and control module-level permissions."
      />

      <UserAccountSettingsClient
        users={users}
        hotels={hotels}
        allowedRoles={allowedRoles}
        currentUserRole={currentUser.role}
      />
    </div>
  );
}
