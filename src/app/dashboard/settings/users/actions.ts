'use server';

import { Prisma, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { requireRole, requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { cleanText } from '@/lib/sanitize';

export type ActionState = {
  ok: boolean;
  message?: string;
};

const SUPER_ADMIN_ALLOWED_ROLES: readonly Role[] = [
  Role.SUPER_ADMIN,
  Role.HOTEL_ADMIN,
  Role.STAFF,
  Role.KITCHEN,
];

const HOTEL_ADMIN_ALLOWED_ROLES: readonly Role[] = [Role.STAFF, Role.KITCHEN];

function getAllowedRoles(currentUserRole: Role) {
  if (currentUserRole === Role.SUPER_ADMIN) {
    return SUPER_ADMIN_ALLOWED_ROLES;
  }

  return HOTEL_ADMIN_ALLOWED_ROLES;
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

  if (password.length < 8) {
    return 'Password must be at least 8 characters.';
  }

  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter.';
  }

  if (!/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter.';
  }

  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one number.';
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
      currentUser.role === Role.SUPER_ADMIN
        ? hotelIdFromForm || null
        : currentUser.hotelId;

    if (role !== Role.SUPER_ADMIN && !hotelId) {
      return {
        ok: false,
        message: 'Hotel access is required for this user role.',
      };
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await db.user.create({
      data: {
        name,
        email,
        passwordHash,
        role,
        hotelId,
      },
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

    const hotelId =
      currentUser.role === Role.SUPER_ADMIN
        ? hotelIdFromForm || null
        : currentUser.hotelId;

    if (role !== Role.SUPER_ADMIN && !hotelId) {
      return {
        ok: false,
        message: 'Hotel access is required for this user role.',
      };
    }

    await db.user.update({
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
    const confirmPassword = cleanText(formData.get('confirmPassword'), 120);

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

    const passwordHash = await bcrypt.hash(password, 12);

    await db.user.update({
      where: {
        id: userId,
      },
      data: {
        passwordHash,
      },
    });

    revalidatePath('/dashboard/settings/users');

    return { ok: true, message: 'Password reset successfully.' };
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