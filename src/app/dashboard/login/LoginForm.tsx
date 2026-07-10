'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
  X,
} from 'lucide-react';
import { loginAction, type LoginActionState } from './actions';

type LoginFormProps = {
  next?: string;
  initialError?: string;
};

const inputClass =
  'h-14 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-[15px] font-semibold text-neutral-950 shadow-sm outline-none transition placeholder:text-neutral-400 focus:border-[#c99c38] focus:ring-4 focus:ring-[#c99c38]/15 disabled:cursor-not-allowed disabled:bg-neutral-100';

function LoginToast({
  state,
  initialError,
}: {
  state: LoginActionState;
  initialError?: string;
}) {
  const message = state?.success || state?.error || initialError || '';
  const isSuccess = Boolean(state?.success);
  const [visible, setVisible] = useState(Boolean(message));

  useEffect(() => {
    if (!message) {
      setVisible(false);
      return;
    }

    setVisible(true);

    const timeout = window.setTimeout(() => {
      setVisible(false);
    }, 4500);

    return () => window.clearTimeout(timeout);
  }, [message]);

  if (!visible || !message) {
    return null;
  }

  return (
    <div
      className="fixed inset-x-4 top-4 z-[100] mx-auto w-auto max-w-md sm:inset-x-auto sm:right-5 sm:top-5"
      role="status"
      aria-live="polite"
    >
      <div
        className={
          isSuccess
            ? 'flex items-start gap-3 rounded-[1.4rem] border border-emerald-200 bg-emerald-50/95 p-4 text-emerald-800 shadow-2xl backdrop-blur-xl'
            : 'flex items-start gap-3 rounded-[1.4rem] border border-red-200 bg-red-50/95 p-4 text-red-800 shadow-2xl backdrop-blur-xl'
        }
      >
        <div
          className={
            isSuccess
              ? 'grid size-10 shrink-0 place-items-center rounded-2xl bg-emerald-600 text-white'
              : 'grid size-10 shrink-0 place-items-center rounded-2xl bg-red-600 text-white'
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
            {isSuccess ? 'Signed in' : 'Unable to sign in'}
          </p>
          <p className="mt-1 text-sm font-semibold leading-6">{message}</p>
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

export function LoginForm({
  next = '',
  initialError = '',
}: LoginFormProps) {
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

  return (
    <>
      <LoginToast state={state} initialError={initialError} />

      <form action={action} className="space-y-5">
        <input type="hidden" name="next" value={sanitizedNext} />

        <div>
          <label
            htmlFor="email"
            className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-neutral-600"
          >
            Email address
          </label>

          <div className="relative">
            <Mail className="pointer-events-none absolute left-4 top-1/2 z-10 size-4.5 -translate-y-1/2 text-neutral-400" />

            <input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
              required
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="Enter your email"
              disabled={pending}
              className={`${inputClass} pl-11`}
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="password"
            className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-neutral-600"
          >
            Password
          </label>

          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 z-10 size-4.5 -translate-y-1/2 text-neutral-400" />

            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
              required
              autoComplete="current-password"
              placeholder="Enter your password"
              disabled={pending}
              className={`${inputClass} pl-11 pr-12`}
            />

            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              disabled={pending}
              className="absolute right-3 top-1/2 z-10 grid size-9 -translate-y-1/2 place-items-center rounded-xl text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-950 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
            >
              {showPassword ? (
                <EyeOff className="size-4.5" />
              ) : (
                <Eye className="size-4.5" />
              )}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={pending || !email.trim() || !password}
          className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#11100b] px-5 text-sm font-black text-white shadow-[0_16px_35px_rgba(17,16,11,0.22)] transition hover:-translate-y-0.5 hover:bg-black hover:shadow-[0_20px_42px_rgba(17,16,11,0.28)] disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-55"
        >
          {pending ? (
            <>
              <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Verifying access...
            </>
          ) : (
            <>
              <ShieldCheck className="size-4.5" />
              Secure sign in
            </>
          )}
        </button>

        <div className="flex items-start gap-3 rounded-2xl border border-[#c99c38]/20 bg-[#fff9eb] p-4">
          <LockKeyhole className="mt-0.5 size-4.5 shrink-0 text-[#9a6b18]" />
          <p className="text-xs font-semibold leading-5 text-neutral-600">
            Authorized personnel only. Access activity may be recorded for
            security and operational auditing.
          </p>
        </div>
      </form>
    </>
  );
}
