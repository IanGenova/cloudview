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

const inputClass = `
  h-[62px] w-full rounded-[1.15rem]
  border border-[#d8d2c8]
  bg-white/75
  px-4
  text-[15px] font-semibold text-[#17140f]
  shadow-[0_8px_25px_rgba(49,36,16,0.05),inset_0_1px_0_rgba(255,255,255,0.95)]
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
            ? 'flex items-start gap-3 rounded-[1.4rem] border border-emerald-200/80 bg-emerald-50/95 p-4 text-emerald-900 shadow-[0_24px_70px_rgba(6,78,59,0.18)] backdrop-blur-2xl'
            : 'flex items-start gap-3 rounded-[1.4rem] border border-red-200/80 bg-red-50/95 p-4 text-red-900 shadow-[0_24px_70px_rgba(127,29,29,0.18)] backdrop-blur-2xl'
        }
      >
        <div
          className={
            isSuccess
              ? 'grid size-10 shrink-0 place-items-center rounded-2xl bg-emerald-600 text-white shadow-lg'
              : 'grid size-10 shrink-0 place-items-center rounded-2xl bg-red-600 text-white shadow-lg'
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
            {isSuccess ? 'Signed in successfully' : 'Unable to sign in'}
          </p>

          <p className="mt-1 text-sm font-semibold leading-6">{message}</p>
        </div>

        <button
          type="button"
          onClick={() => setVisible(false)}
          className="grid size-8 shrink-0 place-items-center rounded-full bg-white/70 transition hover:scale-105 hover:bg-white"
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
            className="mb-2.5 block text-[11px] font-black uppercase tracking-[0.16em] text-[#403b34]"
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
            className="mb-2.5 block text-[11px] font-black uppercase tracking-[0.16em] text-[#403b34]"
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
              className="absolute right-3 top-1/2 z-10 grid size-10 -translate-y-1/2 place-items-center rounded-xl text-neutral-400 transition-all duration-200 hover:bg-[#f3eee5] hover:text-[#8e611e] focus:outline-none focus:ring-2 focus:ring-[#c99c38]/30 disabled:cursor-not-allowed disabled:opacity-50"
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

        <div className="flex items-center gap-2.5 pb-1 pt-0.5">
          <span className="h-px flex-1 bg-gradient-to-r from-transparent via-[#c99c38]/30 to-transparent" />

          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.17em] text-neutral-400">
            <ShieldCheck className="size-3.5 text-[#b17a28]" />
            Encrypted access
          </div>

          <span className="h-px flex-1 bg-gradient-to-r from-transparent via-[#c99c38]/30 to-transparent" />
        </div>

        <button
          type="submit"
          disabled={pending || !email.trim() || !password}
          className="
            group relative inline-flex h-[62px] w-full
            items-center justify-center gap-2.5
            overflow-hidden rounded-[1.15rem]
            border border-[#d2aa62]/40
            bg-[linear-gradient(135deg,#d6b16a_0%,#ac782c_42%,#754716_100%)]
            px-5 text-sm font-black text-white
            shadow-[0_18px_38px_rgba(112,70,20,0.28),inset_0_1px_0_rgba(255,255,255,0.35)]
            transition-all duration-300
            hover:-translate-y-0.5
            hover:shadow-[0_24px_50px_rgba(112,70,20,0.36),inset_0_1px_0_rgba(255,255,255,0.4)]
            focus:outline-none
            focus:ring-4
            focus:ring-[#c99c38]/20
            disabled:cursor-not-allowed
            disabled:translate-y-0
            disabled:opacity-50
          "
        >
          <span className="pointer-events-none absolute inset-y-0 left-0 w-24 -translate-x-[150%] skew-x-[-20deg] bg-white/20 blur-sm transition-transform duration-700 group-hover:translate-x-[600%]" />

          <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />

          {pending ? (
            <>
              <span className="relative size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              <span className="relative">Verifying access...</span>
            </>
          ) : (
            <>
              <ShieldCheck className="relative size-5" />
              <span className="relative">Secure sign in</span>
            </>
          )}
        </button>

        <div className="flex items-start gap-3.5 rounded-[1.15rem] border border-[#d9b76c]/40 bg-[linear-gradient(135deg,#fffaf0_0%,#fbf4e6_100%)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#c99c38]/15 text-[#976318]">
            <LockKeyhole className="size-4" />
          </span>

          <p className="pt-0.5 text-xs font-semibold leading-5 text-[#665d50]">
            Authorized personnel only. Access activity may be recorded for
            security and operational auditing.
          </p>
        </div>
      </form>
    </>
  );
}