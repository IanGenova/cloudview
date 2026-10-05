'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  X,
} from 'lucide-react';
import { loginAction, type LoginActionState } from './actions';

type LoginFormProps = {
  next?: string;
  initialError?: string;
};

const inputClass = `
 h-[62px] w-full 
 border border-[#d8d2c8]
 bg-white/75
 px-4
 text-[15px] font-semibold text-[#17140f]
 
 outline-none backdrop-blur-sm
 transition-all duration-300
 placeholder:font-medium placeholder:text-neutral-400
 hover:border-[#c5b89e]
 focus:border-[#bd8733]
 focus:bg-white
 focus:shadow-[0_10px_30px_rgba(112,74,22,0.10),0_0_0_4px_rgba(201,156,56,0.12)]
 disabled:cursor-not-allowed
 disabled:bg-neutral-100/80
 disabled:text-neutral-500
`;

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
      className="fixed inset-x-4 top-4 z-[100] mx-auto w-auto max-w-md sm:inset-x-auto sm:right-6 sm:top-6"
      role="status"
      aria-live="polite"
    >
      <div
        className={
          isSuccess
            ? 'flex items-start gap-3 border border-emerald-200/80 bg-emerald-50/95 p-4 text-emerald-900 backdrop-blur-2xl'
            : 'flex items-start gap-3 border border-red-200/80 bg-red-50/95 p-4 text-red-900 backdrop-blur-2xl'
        }
      >
        <div
          className={
            isSuccess
              ? 'grid size-10 shrink-0 place-items-center bg-emerald-600 text-white shadow-lg'
              : 'grid size-10 shrink-0 place-items-center bg-red-600 text-white shadow-lg'
          }
        >
          {isSuccess ? (
            <CheckCircle2 className="size-5" />
          ) : (
            <AlertTriangle className="size-5" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {isSuccess ? 'Signed in successfully' : 'Unable to sign in'}
          </p>

          <p className="mt-1 text-sm font-semibold leading-6">{message}</p>
        </div>

        <button
          type="button"
          onClick={() => setVisible(false)}
          className="grid size-8 shrink-0 place-items-center bg-white/70 transition hover:scale-105 hover:bg-white"
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
            className="mb-2.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-[#403b34]"
          >
            Email address
          </label>

          <div className="group relative">
            <Mail className="pointer-events-none absolute left-4 top-1/2 z-10 size-[19px] -translate-y-1/2 text-neutral-400 transition-colors duration-300 group-focus-within:text-[#a87322]" />

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
              className={`${inputClass} pl-12`}
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="password"
            className="mb-2.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-[#403b34]"
          >
            Password
          </label>

          <div className="group relative">
            <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 z-10 size-[19px] -translate-y-1/2 text-neutral-400 transition-colors duration-300 group-focus-within:text-[#a87322]" />

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
              className={`${inputClass} pl-12 pr-14`}
            />

            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              disabled={pending}
              className="absolute right-3 top-1/2 z-10 grid size-10 -translate-y-1/2 place-items-center text-neutral-400 transition-all duration-200 hover:bg-[#f3eee5] hover:text-[#8e611e] focus:outline-none focus:ring-2 focus:ring-[#c99c38]/30 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
            >
              {showPassword ? (
                <EyeOff className="size-[19px]" />
              ) : (
                <Eye className="size-[19px]" />
              )}
            </button>
          </div>
        </div>

        {/*
          CP-2. "Encrypted access" between two fading gold rules, above a
          button reading "Secure sign in" with a shield on it, above a panel
          about auditing: four assurances that the sign-in box is a sign-in
          box. The notice below is the only one that says anything — it tells
          staff their access is logged — so it stays and the rest goes.
        */}

        <button
          type="submit"
          disabled={pending || !email.trim() || !password}
          className="
 inline-flex h-14 w-full items-center justify-center gap-2.5
 bg-[#11100b] px-5 text-sm font-semibold text-white
 transition hover:bg-neutral-800
 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current
 disabled:cursor-not-allowed disabled:opacity-50
 "
        >

          {pending ? (
            <>
              <span className="relative size-4 animate-spin rounded-dot border-2 border-white/30 border-t-white" />
              <span className="relative">Verifying access...</span>
            </>
          ) : (
            <span>Sign in</span>
          )}
        </button>

        <p className="border-t border-cv-hairline pt-4 text-xs leading-5 text-neutral-500">
          Authorised personnel only. Access activity may be recorded for
          security and operational auditing.
        </p>
      </form>
    </>
  );
}