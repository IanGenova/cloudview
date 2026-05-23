'use server';

import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { createSession, dashboardHomeForRole, verifyPassword } from '@/lib/auth';
import { loginSchema } from '@/lib/validators';

export async function loginAction(_: { error?: string } | undefined, formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password')
  });

  if (!parsed.success) return { error: 'Enter a valid email and password.' };

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  if (!user || !user.isActive) return { error: 'Invalid login credentials.' };

  const valid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!valid) return { error: 'Invalid login credentials.' };

  await createSession({ sub: user.id, email: user.email, role: user.role, hotelId: user.hotelId });
  redirect(dashboardHomeForRole(user.role));
}
