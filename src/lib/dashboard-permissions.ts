import { DashboardModule, Role } from '@prisma/client';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';

export type DashboardPermissionAction =
  | 'canView'
  | 'canCreate'
  | 'canEdit'
  | 'canDelete';

export type DashboardPermissionSnapshot = {
  module: DashboardModule;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

export type DashboardNavItem = {
  module: DashboardModule;
  label: string;
  href: string;
  group?: 'main' | 'settings';
};

export const DASHBOARD_NAV_ITEMS: DashboardNavItem[] = [
  {
    module: DashboardModule.OVERVIEW,
    label: 'Overview',
    href: '/dashboard',
    group: 'main',
  },
  {
    module: DashboardModule.HOTELS,
    label: 'Hotels',
    href: '/dashboard/hotels',
    group: 'main',
  },
  {
    module: DashboardModule.HOTEL_GUIDE,
    label: 'Hotel Guide',
    href: '/dashboard/hotel-guide',
    group: 'main',
  },
  {
    module: DashboardModule.ROOMS_LOCATIONS,
    label: 'Rooms & Locations',
    href: '/dashboard/locations',
    group: 'main',
  },
  {
    module: DashboardModule.NFC_TAGS,
    label: 'NFC Tags',
    href: '/dashboard/tags',
    group: 'main',
  },
  {
    module: DashboardModule.MENU,
    label: 'Menu',
    href: '/dashboard/menu',
    group: 'main',
  },
  {
    module: DashboardModule.INVENTORY,
    label: 'Inventory',
    href: '/dashboard/inventory',
    group: 'main',
  },
  {
    module: DashboardModule.ORDERS,
    label: 'Orders',
    href: '/dashboard/orders',
    group: 'main',
  },
  {
    module: DashboardModule.KITCHEN_DISPLAY,
    label: 'Kitchen Display',
    href: '/dashboard/kitchen',
    group: 'main',
  },
  {
    module: DashboardModule.SERVICES_MODULE,
    label: 'Services Module',
    href: '/dashboard/services',
    group: 'main',
  },
  {
    module: DashboardModule.SERVICE_REQUESTS,
    label: 'Service Requests',
    href: '/dashboard/service-requests',
    group: 'main',
  },
  {
    module: DashboardModule.POS_TERMINAL,
    label: 'POS Terminal',
    href: '/dashboard/pos',
    group: 'main',
  },
  {
    module: DashboardModule.ANALYTICS,
    label: 'Analytics',
    href: '/dashboard/analytics',
    group: 'main',
  },
    {
      module: DashboardModule.HOTEL_SETTINGS,
      label: 'Hotel Settings',
      href: '/dashboard/settings',
      group: 'settings',
    },
  {
    module: DashboardModule.USER_ACCOUNT_SETTINGS,
    label: 'User Account Settings',
    href: '/dashboard/settings/users',
    group: 'settings',
  },
];

function legacyRoleFallback(
  role: Role,
  module: DashboardModule,
  action: DashboardPermissionAction
) {
  if (role === Role.SUPER_ADMIN) {
    return true;
  }

  if (role === Role.HOTEL_ADMIN) {
    return module !== DashboardModule.HOTELS;
  }

  if (role === Role.KITCHEN) {
    if (module === DashboardModule.KITCHEN_DISPLAY) {
      return action === 'canView' || action === 'canEdit';
    }

    return (
      action === 'canView' &&
      (module === DashboardModule.OVERVIEW ||
        module === DashboardModule.ORDERS)
    );
  }

  if (role === Role.STAFF) {
    return (
      action === 'canView' &&
      (module === DashboardModule.OVERVIEW ||
        module === DashboardModule.ORDERS ||
        module === DashboardModule.SERVICE_REQUESTS ||
        module === DashboardModule.POS_TERMINAL)
    );
  }

  return false;
}

export async function getUserDashboardPermissions(userId: string, role: Role) {
  if (role === Role.SUPER_ADMIN) {
    return DASHBOARD_NAV_ITEMS.map((item) => ({
      module: item.module,
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
    }));
  }

  const savedPermissions = await db.userDashboardPermission.findMany({
    where: {
      userId,
    },
    select: {
      module: true,
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
    },
  });

  /**
   * Important:
   * If custom permissions exist, use them as the source of truth.
   * Do not add old role-based modules again.
   */
  if (savedPermissions.length > 0) {
    return savedPermissions;
  }

  /**
   * Fallback only for old users that do not have permission rows yet.
   */
  return DASHBOARD_NAV_ITEMS.map((item) => ({
    module: item.module,
    canView: legacyRoleFallback(role, item.module, 'canView'),
    canCreate: legacyRoleFallback(role, item.module, 'canCreate'),
    canEdit: legacyRoleFallback(role, item.module, 'canEdit'),
    canDelete: legacyRoleFallback(role, item.module, 'canDelete'),
  }));
}

export function hasDashboardPermission(
  permissions: DashboardPermissionSnapshot[],
  module: DashboardModule,
  action: DashboardPermissionAction = 'canView'
) {
  const permission = permissions.find((item) => item.module === module);

  return Boolean(permission?.[action]);
}

export async function getVisibleDashboardNavItems(userId: string, role: Role) {
  const permissions = await getUserDashboardPermissions(userId, role);

  return DASHBOARD_NAV_ITEMS.filter((item) =>
    hasDashboardPermission(permissions, item.module, 'canView')
  );
}

export async function getFirstVisibleDashboardHref(userId: string, role: Role) {
  const visibleItems = await getVisibleDashboardNavItems(userId, role);

  return visibleItems[0]?.href ?? null;
}

export async function requireDashboardPermission(
  module: DashboardModule,
  action: DashboardPermissionAction = 'canView'
) {
  const user = await requireUser();

  if (user.role === Role.SUPER_ADMIN) {
    return user;
  }

  const permissions = await getUserDashboardPermissions(user.id, user.role);
  const allowed = hasDashboardPermission(permissions, module, action);

  if (!allowed) {
    const firstAllowedHref = await getFirstVisibleDashboardHref(
      user.id,
      user.role
    );

    redirect(firstAllowedHref ?? '/login');
  }

  return user;
}