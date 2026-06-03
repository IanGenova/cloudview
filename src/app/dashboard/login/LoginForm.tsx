'use client';

import { useEffect, useState } from 'react';
import { useActionState } from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { loginAction, type LoginActionState } from './actions';

function LoginToast({
  state,
}: {
  state: LoginActionState;
}) {
  const [visible, setVisible] = useState(Boolean(state?.error || state?.success));

  useEffect(() => {
    if (!state?.error && !state?.success) {
      setVisible(false);
      return;
    }

    setVisible(true);

    const timeout = window.setTimeout(() => {
      setVisible(false);
    }, 4500);

    return () => window.clearTimeout(timeout);
  }, [state?.error, state?.success]);

  if (!visible || (!state?.error && !state?.success)) {
    return null;
  }

  const isSuccess = Boolean(state.success);
  const message = state.success || state.error || '';

  return (
    <div className="fixed right-5 top-5 z-[90] w-[calc(100vw-2.5rem)] max-w-md">
      <div
        className={
          isSuccess
            ? 'flex items-start gap-3 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 shadow-2xl'
            : 'flex items-start gap-3 rounded-3xl border border-red-200 bg-red-50 p-4 text-red-800 shadow-2xl'
        }
      >
        <div
          className={
            isSuccess
              ? 'grid size-9 shrink-0 place-items-center rounded-full bg-emerald-600 text-white'
              : 'grid size-9 shrink-0 place-items-center rounded-full bg-red-600 text-white'
          }
        >
          {isSuccess ? (
            <CheckCircle2 className="size-5" />
          ) : (
            <AlertTriangle className="size-5" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-black">
            {isSuccess ? 'Success' : 'Login failed'}
          </p>
          <p className="mt-1 text-sm font-bold leading-6">{message}</p>
        </div>

        <button
          type="button"
          onClick={() => setVisible(false)}
          className="grid size-8 shrink-0 place-items-center rounded-full bg-white/70 hover:bg-white"
          aria-label="Close notification"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, undefined);

  return (
    <>
      <LoginToast state={state} />

      <form action={action} className="space-y-4">
        <div>
          <label className="mb-2 block text-sm font-bold">Email</label>
          <Input
            name="email"
            type="email"
            defaultValue="admin@cloudview.test"
            required
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-bold">Password</label>
          <Input
            name="password"
            type="password"
            defaultValue="Password123!"
            required
          />
        </div>

        <Button disabled={pending} className="w-full" size="lg">
          {pending ? 'Signing in...' : 'Sign in'}
        </Button>

        <p className="text-center text-xs text-neutral-500">
          Seed accounts: admin@cloudview.test / hoteladmin@cloudview.test /
          staff@cloudview.test / kitchen@cloudview.test
        </p>
      </form>
    </>
  );
}