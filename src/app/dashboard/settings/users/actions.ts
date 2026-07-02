'use server';

import { DashboardModule, Prisma, Role } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { hashPassword, requireRole, requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { cleanText } from '@/lib/sanitize';

export type ActionState = {
  ok: boolean;
  message?: string;
};

type PermissionKey = 'canView' | 'canCreate' | 'canEdit' | 'canDelete';

type DashboardPermissionInput = {
  module: DashboardModule;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

const SUPER_ADMIN_ALLOWED_ROLES: readonly Role[] = [
  Role.SUPER_ADMIN,
  Role.HOTEL_ADMIN,
  Role.STAFF,
  Role.KITCHEN,
];

const HOTEL_ADMIN_ALLOWED_ROLES: readonly Role[] = [Role.STAFF, Role.KITCHEN];

const ALL_DASHBOARD_MODULES = Object.values(
  DashboardModule
) as DashboardModule[];

const HOTEL_ADMIN_RESTRICTED_MODULES = new Set<DashboardModule>([
  DashboardModule.HOTELS,
  DashboardModule.REWARDS,
]);

const PERMISSION_KEYS: readonly PermissionKey[] = [
  'canView',
  'canCreate',
  'canEdit',
  'canDelete',
];

function getAllowedRoles(currentUserRole: Role) {
  if (currentUserRole === Role.SUPER_ADMIN) {
    return SUPER_ADMIN_ALLOWED_ROLES;
  }

  return HOTEL_ADMIN_ALLOWED_ROLES;
}

function getAssignableDashboardModules(currentUserRole: Role) {
  if (currentUserRole === Role.SUPER_ADMIN) {
    return ALL_DASHBOARD_MODULES;
  }

  return ALL_DASHBOARD_MODULES.filter(
    (module) => !HOTEL_ADMIN_RESTRICTED_MODULES.has(module)
  );
}

function normalizeEmail(value: FormDataEntryValue | null) {
  return (cleanText(value, 160) ?? '').toLowerCase();
}

function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password: string) {
  if (!password) {
    return 'Password is required.';
  }

  if (password.length < 5) {
    return 'Password must be at least 5 characters.';
  }

  return null;
}

function getReadablePrismaError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return 'A user with this email already exists.';
    }

    if (error.code === 'P2003') {
      return 'This user cannot be deleted because the account is already connected to records in the system.';
    }
  }

  return 'Something went wrong. Please try again.';
}

function permissionFieldName(module: DashboardModule, key: PermissionKey) {
  return `permission:${module}:${key}`;
}

function isChecked(value: FormDataEntryValue | null) {
  if (!value) {
    return false;
  }

  const normalized = String(value).toLowerCase();

  return normalized === 'on' || normalized === 'true' || normalized === '1';
}

function fullPermission(module: DashboardModule): DashboardPermissionInput {
  return {
    module,
    canView: true,
    canCreate: true,
    canEdit: true,
    canDelete: true,
  };
}

function viewOnlyPermission(module: DashboardModule): DashboardPermissionInput {
  return {
    module,
    canView: true,
    canCreate: false,
    canEdit: false,
    canDelete: false,
  };
}

function getDashboardModule(value: string) {
  return ALL_DASHBOARD_MODULES.find((module) => module === value) ?? null;
}

function optionalViewOnlyPermission(value: string): DashboardPermissionInput[] {
  const module = getDashboardModule(value);

  return module ? [viewOnlyPermission(module)] : [];
}

function optionalCustomPermission(
  value: string,
  permissions: Partial<Omit<DashboardPermissionInput, 'module'>>
): DashboardPermissionInput[] {
  const module = getDashboardModule(value);

  return module ? [customPermission(module, permissions)] : [];
}

function customPermission(
  module: DashboardModule,
  permissions: Partial<Omit<DashboardPermissionInput, 'module'>>
): DashboardPermissionInput {
  const canCreate = permissions.canCreate ?? false;
  const canEdit = permissions.canEdit ?? false;
  const canDelete = permissions.canDelete ?? false;

  const canView =
    Boolean(permissions.canView ?? false) ||
    canCreate ||
    canEdit ||
    canDelete;

  return {
    module,
    canView,
    canCreate,
    canEdit,
    canDelete,
  };
}

function getDefaultDashboardPermissions(role: Role): DashboardPermissionInput[] {
  if (role === Role.SUPER_ADMIN) {
    return ALL_DASHBOARD_MODULES.map(fullPermission);
  }

  if (role === Role.HOTEL_ADMIN) {
    return ALL_DASHBOARD_MODULES.filter(
      (module) =>
        module !== DashboardModule.HOTELS &&
        module !== DashboardModule.REWARDS
    ).map(fullPermission);
  }

  if (role === Role.KITCHEN) {
    return [
      viewOnlyPermission(DashboardModule.OVERVIEW),
      viewOnlyPermission(DashboardModule.ORDERS),
      customPermission(DashboardModule.KITCHEN_DISPLAY, {
        canView: true,
        canEdit: true,
      }),
      viewOnlyPermission(DashboardModule.INVENTORY),
    ];
  }

  return [
    viewOnlyPermission(DashboardModule.OVERVIEW),
    viewOnlyPermission(DashboardModule.HOTEL_GUIDE),
    viewOnlyPermission(DashboardModule.ROOMS_LOCATIONS),
    viewOnlyPermission(DashboardModule.NFC_TAGS),
    customPermission(DashboardModule.MENU, {
      canView: true,
      canCreate: true,
      canEdit: true,
    }),
    customPermission(DashboardModule.INVENTORY, {
      canView: true,
      canEdit: true,
    }),
    customPermission(DashboardModule.ORDERS, {
      canView: true,
      canCreate: true,
      canEdit: true,
    }),
    viewOnlyPermission(DashboardModule.KITCHEN_DISPLAY),
    customPermission(DashboardModule.SERVICES_MODULE, {
      canView: true,
      canCreate: true,
      canEdit: true,
    }),
    customPermission(DashboardModule.SERVICE_REQUESTS, {
      canView: true,
      canCreate: true,
      canEdit: true,
    }),
    customPermission(DashboardModule.POS_TERMINAL, {
      canView: true,
      canCreate: true,
      canEdit: true,
    }),
    viewOnlyPermission(DashboardModule.ANALYTICS),
    ...optionalViewOnlyPermission('REPORTS'),
    ...optionalViewOnlyPermission('GUEST_STAYS'),
  ];
}

function normalizeDashboardPermissionsForSafeLogin(
  permissions: DashboardPermissionInput[],
  targetRole: Role
) {
  if (targetRole === Role.SUPER_ADMIN) {
    return permissions;
  }

  const permissionMap = new Map(
    permissions.map((permission) => [permission.module, permission])
  );

  const overviewPermission =
    permissionMap.get(DashboardModule.OVERVIEW) ??
    viewOnlyPermission(DashboardModule.OVERVIEW);

  permissionMap.set(DashboardModule.OVERVIEW, {
    ...overviewPermission,
    canView: true,
    canCreate: false,
    canEdit: false,
    canDelete: false,
  });

  permissionMap.delete(DashboardModule.REWARDS);

  // targetRole is already narrowed to non-SUPER_ADMIN above,
  // so delete HOTELS directly instead of comparing again.
  permissionMap.delete(DashboardModule.HOTELS);

  if (targetRole !== Role.HOTEL_ADMIN) {
    permissionMap.delete(DashboardModule.HOTEL_SETTINGS);
    permissionMap.delete(DashboardModule.USER_ACCOUNT_SETTINGS);
  }

  return Array.from(permissionMap.values());
}

function parseDashboardPermissionsFromForm(
  formData: FormData,
  currentUserRole: Role,
  targetRole: Role
): DashboardPermissionInput[] | null {
  const permissionsEnabled = formData.get('permissionsEnabled') === '1';

  if (!permissionsEnabled) {
    return null;
  }

  if (targetRole === Role.SUPER_ADMIN) {
    return getDefaultDashboardPermissions(Role.SUPER_ADMIN);
  }

  const assignableModules = new Set(
    getAssignableDashboardModules(currentUserRole)
  );

  const parsedPermissions = ALL_DASHBOARD_MODULES.filter((module) =>
    assignableModules.has(module)
  ).map((module) => {
    const canCreate = isChecked(
      formData.get(permissionFieldName(module, 'canCreate'))
    );
    const canEdit = isChecked(
      formData.get(permissionFieldName(module, 'canEdit'))
    );
    const canDelete = isChecked(
      formData.get(permissionFieldName(module, 'canDelete'))
    );

    const canView =
      isChecked(formData.get(permissionFieldName(module, 'canView'))) ||
      canCreate ||
      canEdit ||
      canDelete;

    return {
      module,
      canView,
      canCreate,
      canEdit,
      canDelete,
    };
  });

  return normalizeDashboardPermissionsForSafeLogin(
    parsedPermissions,
    targetRole
  );
}

async function syncDashboardPermissions(
  tx: Prisma.TransactionClient,
  userId: string,
  permissions: DashboardPermissionInput[]
) {
  await tx.userDashboardPermission.deleteMany({
    where: {
      userId,
    },
  });

  if (!permissions.length) {
    return;
  }

  await tx.userDashboardPermission.createMany({
    data: permissions.map((permission) => ({
      userId,
      module: permission.module,
      canView: permission.canView,
      canCreate: permission.canCreate,
      canEdit: permission.canEdit,
      canDelete: permission.canDelete,
    })),
  });
}

export async function createUserAccountAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const currentUser = await requireUser();
    requireRole(currentUser.role, [Role.SUPER_ADMIN, Role.HOTEL_ADMIN]);

    const name = cleanText(formData.get('name'), 120);
    const email = normalizeEmail(formData.get('email'));
    const password = cleanText(formData.get('password'), 160) ?? '';
    const role = formData.get('role') as Role;
    const hotelIdFromForm = cleanText(formData.get('hotelId'));

    const allowedRoles = getAllowedRoles(currentUser.role);

    if (!name) {
      return { ok: false, message: 'Full name is required.' };
    }

    if (!email || !validateEmail(email)) {
      return { ok: false, message: 'A valid email address is required.' };
    }

    const passwordError = validatePassword(password);

    if (passwordError) {
      return { ok: false, message: passwordError };
    }

    if (!Object.values(Role).includes(role) || !allowedRoles.includes(role)) {
      return {
        ok: false,
        message: 'You are not allowed to create this user role.',
      };
    }

    const hotelId =
      role === Role.SUPER_ADMIN
        ? null
        : currentUser.role === Role.SUPER_ADMIN
          ? hotelIdFromForm || null
          : currentUser.hotelId;

    if (role !== Role.SUPER_ADMIN && !hotelId) {
      return {
        ok: false,
        message: 'Hotel access is required for this user role.',
      };
    }

    const passwordHash = await hashPassword(password);

    const permissions = normalizeDashboardPermissionsForSafeLogin(
      parseDashboardPermissionsFromForm(formData, currentUser.role, role) ??
        getDefaultDashboardPermissions(role),
      role
    );

    await db.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          name,
          email,
          passwordHash,
          role,
          hotelId,
        },
        select: {
          id: true,
        },
      });

      await syncDashboardPermissions(tx, createdUser.id, permissions);
    });

    revalidatePath('/dashboard/settings/users');

    return { ok: true, message: 'User account created successfully.' };
  } catch (error) {
    return { ok: false, message: getReadablePrismaError(error) };
  }
}

export async function updateUserAccountAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const currentUser = await requireUser();
    requireRole(currentUser.role, [Role.SUPER_ADMIN, Role.HOTEL_ADMIN]);

    const userId = cleanText(formData.get('userId'));
    const name = cleanText(formData.get('name'), 120);
    const email = normalizeEmail(formData.get('email'));
    const role = formData.get('role') as Role;
    const hotelIdFromForm = cleanText(formData.get('hotelId'));

    const allowedRoles = getAllowedRoles(currentUser.role);

    if (!userId) {
      return { ok: false, message: 'User account is required.' };
    }

    if (!name) {
      return { ok: false, message: 'Full name is required.' };
    }

    if (!email || !validateEmail(email)) {
      return { ok: false, message: 'A valid email address is required.' };
    }

    if (!Object.values(Role).includes(role) || !allowedRoles.includes(role)) {
      return {
        ok: false,
        message: 'You are not allowed to assign this role.',
      };
    }

    const targetUser = await db.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!targetUser) {
      return { ok: false, message: 'User account was not found.' };
    }

    if (
      currentUser.role !== Role.SUPER_ADMIN &&
      targetUser.hotelId !== currentUser.hotelId
    ) {
      return {
        ok: false,
        message: 'You are not allowed to update this user account.',
      };
    }

    if (targetUser.role === Role.SUPER_ADMIN && role !== Role.SUPER_ADMIN) {
      const superAdminCount = await db.user.count({
        where: {
          role: Role.SUPER_ADMIN,
        },
      });

      if (superAdminCount <= 1) {
        return {
          ok: false,
          message: 'You cannot demote the last Super Admin account.',
        };
      }
    }

    const hotelId =
      role === Role.SUPER_ADMIN
        ? null
        : currentUser.role === Role.SUPER_ADMIN
          ? hotelIdFromForm || null
          : currentUser.hotelId;

    if (role !== Role.SUPER_ADMIN && !hotelId) {
      return {
        ok: false,
        message: 'Hotel access is required for this user role.',
      };
    }

    const parsedPermissions =
      role === Role.SUPER_ADMIN
        ? getDefaultDashboardPermissions(Role.SUPER_ADMIN)
        : parseDashboardPermissionsFromForm(formData, currentUser.role, role);

    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: {
          id: userId,
        },
        data: {
          name,
          email,
          role,
          hotelId,
        },
      });

      if (parsedPermissions) {
        await syncDashboardPermissions(tx, userId, parsedPermissions);
      }
    });

    revalidatePath('/dashboard/settings/users');

    return { ok: true, message: 'User account updated successfully.' };
  } catch (error) {
    return { ok: false, message: getReadablePrismaError(error) };
  }
}

export async function resetUserPasswordAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const currentUser = await requireUser();
    requireRole(currentUser.role, [Role.SUPER_ADMIN, Role.HOTEL_ADMIN]);

    const userId = cleanText(formData.get('userId'));
    const password = cleanText(formData.get('password'), 160) ?? '';
    const confirmPassword = cleanText(formData.get('confirmPassword'), 160) ?? '';

    if (!userId) {
      return { ok: false, message: 'User account is required.' };
    }

    const passwordError = validatePassword(password);

    if (passwordError) {
      return { ok: false, message: passwordError };
    }

    if (password !== confirmPassword) {
      return { ok: false, message: 'Passwords do not match.' };
    }

    const targetUser = await db.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!targetUser) {
      return { ok: false, message: 'User account was not found.' };
    }

    if (
      currentUser.role !== Role.SUPER_ADMIN &&
      targetUser.hotelId !== currentUser.hotelId
    ) {
      return {
        ok: false,
        message: 'You are not allowed to reset this user password.',
      };
    }

    const passwordHash = await hashPassword(password);

    await db.user.update({
      where: {
        id: userId,
      },
      data: {
        passwordHash,
      },
    });

    revalidatePath('/dashboard/settings/users');

    return { ok: true, message: 'Password reset successfully. The new plain temporary password can now be used to sign in.' };
  } catch (error) {
    return { ok: false, message: getReadablePrismaError(error) };
  }
}

export async function deleteUserAccountAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const currentUser = await requireUser();
    requireRole(currentUser.role, [Role.SUPER_ADMIN, Role.HOTEL_ADMIN]);

    const userId = cleanText(formData.get('userId'));

    if (!userId) {
      return { ok: false, message: 'User account is required.' };
    }

    if (userId === currentUser.id) {
      return { ok: false, message: 'You cannot delete your own account.' };
    }

    const targetUser = await db.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!targetUser) {
      return { ok: false, message: 'User account was not found.' };
    }

    if (
      currentUser.role !== Role.SUPER_ADMIN &&
      targetUser.hotelId !== currentUser.hotelId
    ) {
      return {
        ok: false,
        message: 'You are not allowed to delete this user account.',
      };
    }

    if (targetUser.role === Role.SUPER_ADMIN) {
      const superAdminCount = await db.user.count({
        where: {
          role: Role.SUPER_ADMIN,
        },
      });

      if (superAdminCount <= 1) {
        return {
          ok: false,
          message: 'You cannot delete the last Super Admin account.',
        };
      }
    }

    await db.user.delete({
      where: {
        id: userId,
      },
    });

    revalidatePath('/dashboard/settings/users');

    return { ok: true, message: 'User account deleted successfully.' };
  } catch (error) {
    return { ok: false, message: getReadablePrismaError(error) };
  }
}