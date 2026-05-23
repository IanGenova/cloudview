'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { loginAction } from './actions';

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="mb-2 block text-sm font-bold">Email</label>
        <Input name="email" type="email" defaultValue="admin@cloudview.test" required />
      </div>
      <div>
        <label className="mb-2 block text-sm font-bold">Password</label>
        <Input name="password" type="password" defaultValue="Password123!" required />
      </div>
      {state?.error ? <p className="rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-700">{state.error}</p> : null}
      <Button disabled={pending} className="w-full" size="lg">{pending ? 'Signing in...' : 'Sign in'}</Button>
      <p className="text-center text-xs text-neutral-500">Seed accounts: admin@cloudview.test / hoteladmin@cloudview.test / staff@cloudview.test / kitchen@cloudview.test</p>
    </form>
  );
}
