import { Role } from '@prisma/client';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { db } from '@/lib/db';
import { requireRole, requireUser } from '@/lib/auth';
import { UserAccountSettingsClient } from './UserAccountSettingsClient';

function getAllowedRoles(role: Role) {
  if (role === Role.SUPER_ADMIN) {
    return [Role.SUPER_ADMIN, Role.HOTEL_ADMIN, Role.STAFF, Role.KITCHEN];
  }

  return [Role.STAFF, Role.KITCHEN];
}

export default async function UserAccountSettingsPage() {
  const user = await requireUser();

  requireRole(user.role, [Role.SUPER_ADMIN, Role.HOTEL_ADMIN]);

  const allowedRoles = getAllowedRoles(user.role);

  const [hotels, users] = await Promise.all([
    user.role === Role.SUPER_ADMIN
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
            id: user.hotelId!,
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
        user.role === Role.SUPER_ADMIN
          ? {}
          : {
              hotelId: user.hotelId!,
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
      },
      orderBy: {
        createdAt: 'desc',
      },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="User Account Settings"
        description="Create user accounts, assign hotel access, and manage dashboard roles."
      />

      <UserAccountSettingsClient
        users={users}
        hotels={hotels}
        allowedRoles={allowedRoles}
        currentUserRole={user.role}
      />
    </div>
  );
}