'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
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
import { loginAction, type LoginActionState } from './actions';

type LoginFormProps = {
  next?: string;
};

type DemoAccount = {
  label: string;
  email: string;
};

const demoAccounts: DemoAccount[] = [
  {
    label: 'Super Admin',
    email: 'admin@cloudview.test',
  },
  {
    label: 'Hotel Admin',
    email: 'hoteladmin@cloudview.test',
  },
  {
    label: 'Staff',
    email: 'staff@cloudview.test',
  },
  {
    label: 'Kitchen',
    email: 'kitchen@cloudview.test',
  },
];

const inputClass =
  'h-12 w-full rounded-2xl border border-neutral-200 bg-white/95 px-4 text-sm font-bold text-neutral-950 shadow-sm outline-none transition focus:border-[#c99c38] focus:ring-4 focus:ring-[#c99c38]/15';

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

  const isSuccess = Boolean(state?.success);
  const message = state?.success || state?.error || '';

  if (!visible || !message) {
    return null;
  }

  return (
    <div className="fixed right-5 top-5 z-[90] w-[calc(100vw-2.5rem)] max-w-md">
      <div
        className={
          isSuccess
            ? 'flex items-start gap-3 rounded-3xl border border-emerald-200 bg-emerald-50/95 p-4 text-emerald-800 shadow-2xl backdrop-blur-xl'
            : 'flex items-start gap-3 rounded-3xl border border-red-200 bg-red-50/95 p-4 text-red-800 shadow-2xl backdrop-blur-xl'
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
          className="grid size-8 shrink-0 place-items-center rounded-full bg-white/70 transition hover:bg-white"
          aria-label="Close notification"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

export function LoginForm({ next = '' }: LoginFormProps) {
  const [state, action, pending] = useActionState(loginAction, undefined);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const sanitizedNext = useMemo(() => {
    const value = next.trim();

    if (!value || value === '/dashboard/login') {
      return '';
    }

    if (!value.startsWith('/dashboard') || value.startsWith('//')) {
      return '';
    }

    if (value.includes('://')) {
      return '';
    }

    return value;
  }, [next]);

  function fillDemoAccount(account: DemoAccount) {
    setEmail(account.email);
    setPassword('12345');
  }

  return (
    <>
      <LoginToast state={state} />

      <form action={action} className="space-y-5">
        <input type="hidden" name="next" value={sanitizedNext} />

        <div>
          <label
            htmlFor="email"
            className="mb-2 block text-sm font-black text-ink"
          >
            Email
          </label>

          <div className="relative">
            <Mail className="pointer-events-none absolute left-4 top-1/2 z-10 size-4 -translate-y-1/2 text-neutral-400" />

            <input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
              required
              autoComplete="email"
              placeholder="Enter user email"
              className={`${inputClass} pl-11`}
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
            <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 z-10 size-4 -translate-y-1/2 text-neutral-400" />

            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
              required
              autoComplete="current-password"
              placeholder="Example: 12345 or abcde"
              className={`${inputClass} pl-11 pr-12`}
            />

            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              className="absolute right-3 top-1/2 z-10 grid size-8 -translate-y-1/2 place-items-center rounded-full text-neutral-400 transition hover:bg-neutral-100 hover:text-ink"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>

          <p className="mt-2 text-xs font-semibold text-neutral-500">
            Simple temporary passwords are allowed, such as{' '}
            <span className="font-black text-[#8a641d]">12345</span> or{' '}
            <span className="font-black text-[#8a641d]">abcde</span>.
          </p>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-ink px-5 text-sm font-black text-white shadow-[0_14px_30px_rgba(11,31,58,0.20)] transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-70"
        >
          {pending ? (
            <>
              <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Signing in...
            </>
          ) : (
            <>
              <LockKeyhole className="size-4" />
              Sign in
            </>
          )}
        </button>

        <div className="pt-1">
          <div className="flex items-center gap-4">
            <span className="h-px flex-1 bg-neutral-200" />
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-gold">
              Demo Accounts
            </p>
            <span className="h-px flex-1 bg-neutral-200" />
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {demoAccounts.map((account) => (
              <button
                key={account.email}
                type="button"
                onClick={() => fillDemoAccount(account)}
                className="flex items-center gap-2 rounded-2xl border border-white/70 bg-white/45 px-3 py-2.5 text-left text-xs font-black text-neutral-700 transition hover:border-[#c99c38]/40 hover:bg-white/80"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-[#fff8e7] text-[#9a6b18]">
                  <UserRound className="size-4" />
                </span>

                <span className="min-w-0">
                  <span className="block truncate">{account.label}</span>
                  <span className="block truncate text-[11px] font-semibold text-neutral-500">
                    {account.email}
                  </span>
                </span>
              </button>
            ))}
          </div>

          <p className="mt-3 text-center text-[11px] font-semibold leading-5 text-neutral-500">
            Demo buttons fill password as <b>12345</b>. Reset the account
            password first if that value does not match the saved password.
          </p>
        </div>
      </form>
    </>
  );
}
