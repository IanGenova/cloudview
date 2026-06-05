'use client';

import { useActionState, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  UserRound,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { loginAction, type LoginActionState } from './actions';

function LoginToast({ state }: { state: LoginActionState }) {
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
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  return (
    <>
      <LoginToast state={state} />

      <form action={action} className="space-y-6">
        <div>
          <label
            htmlFor="email"
            className="mb-2 block text-sm font-black text-ink"
          >
            Email
          </label>

          <div className="relative">
            <Mail className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-neutral-400" />

            <Input
              id="email"
              name="email"
              type="email"
              defaultValue="admin@cloudview.test"
              required
              autoComplete="email"
              className="h-14 rounded-2xl border-neutral-200 bg-white pl-12 text-base font-semibold shadow-sm transition focus:border-gold focus:ring-gold/20"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="password"
            className="mb-2 block text-sm font-black text-ink"
          >
            Password
          </label>

          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-neutral-400" />

            <Input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              defaultValue="Password123!"
              required
              autoComplete="current-password"
              className="h-14 rounded-2xl border-neutral-200 bg-white px-12 text-base font-semibold shadow-sm transition focus:border-gold focus:ring-gold/20"
            />

            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              className="absolute right-4 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-neutral-400 transition hover:bg-neutral-100 hover:text-ink"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <EyeOff className="size-5" />
              ) : (
                <Eye className="size-5" />
              )}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="inline-flex cursor-pointer items-center gap-3 text-sm font-bold text-neutral-600">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
              className="size-5 rounded border-neutral-300 text-ink accent-ink"
            />
            Remember me
          </label>

          <button
            type="button"
            className="text-sm font-black text-gold transition hover:text-ink"
          >
            Forgot password?
          </button>
        </div>

        <Button
          disabled={pending}
          className="h-16 w-full rounded-2xl bg-ink text-base font-black text-white shadow-[0_16px_34px_rgba(11,31,58,0.24)] transition hover:-translate-y-0.5 hover:bg-black disabled:translate-y-0 disabled:opacity-70"
          size="lg"
        >
          <span className="inline-flex items-center gap-3">
            <LockKeyhole className="size-5" />
            {pending ? 'Signing in...' : 'Sign in'}
          </span>
        </Button>

        <div className="pt-2">
          <div className="flex items-center gap-4">
            <span className="h-px flex-1 bg-neutral-200" />
            <p className="text-xs font-black uppercase tracking-[0.35em] text-gold">
              Demo Accounts
            </p>
            <span className="h-px flex-1 bg-neutral-200" />
          </div>

          <div className="mt-5 flex items-start justify-center gap-3 text-center text-sm font-semibold leading-7 text-neutral-600">
            <UserRound className="mt-1 size-5 shrink-0 text-neutral-500" />

            <p>
              admin@cloudview.test{' '}
              <span className="mx-2 font-black text-gold">/</span>
              hoteladmin@cloudview.test{' '}
              <span className="mx-2 font-black text-gold">/</span>
              <br className="hidden sm:block" />
              staff@cloudview.test{' '}
              <span className="mx-2 font-black text-gold">/</span>
              kitchen@cloudview.test
            </p>
          </div>
        </div>
      </form>
    </>
  );
}