'use client';

import { useActionState, useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
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

type LoginFormProps = {
  next?: string;
};

const ease = [0.22, 1, 0.36, 1] as const;

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

  return (
    <AnimatePresence>
      {visible && message ? (
        <motion.div
          initial={{ opacity: 0, y: -18, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -18, scale: 0.96 }}
          transition={{ duration: 0.45, ease }}
          className="fixed right-5 top-5 z-[90] w-[calc(100vw-2.5rem)] max-w-md"
        >
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
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function LoginForm({ next = '' }: LoginFormProps) {
  const [state, action, pending] = useActionState(loginAction, undefined);
  const [showPassword, setShowPassword] = useState(false);
  const reduceMotion = useReducedMotion();

  const fieldInitial = reduceMotion ? false : { opacity: 0, y: 18 };
  const fieldAnimate = reduceMotion ? undefined : { opacity: 1, y: 0 };

  return (
    <>
      <LoginToast state={state} />

      <motion.form
        action={action}
        className="space-y-6"
        initial={reduceMotion ? false : 'hidden'}
        animate="show"
        variants={{
          hidden: {},
          show: {
            transition: {
              staggerChildren: 0.09,
              delayChildren: 0.15,
            },
          },
        }}
      >
        <input type="hidden" name="next" value={next} />

        <motion.div
          initial={fieldInitial}
          animate={fieldAnimate}
          transition={{ duration: 0.55, ease }}
        >
          <label
            htmlFor="email"
            className="mb-2 block text-sm font-black text-ink"
          >
            Email
          </label>

       <div className="group relative transition duration-200 focus-within:-translate-y-0.5 focus-within:scale-[1.01]">
            <div className="pointer-events-none absolute -inset-1 rounded-[1.35rem] bg-gradient-to-r from-[#c99c38]/0 via-[#c99c38]/25 to-[#c99c38]/0 opacity-0 blur-xl transition duration-300 group-focus-within:opacity-100" />

            <Mail className="pointer-events-none absolute left-4 top-1/2 z-10 size-5 -translate-y-1/2 text-neutral-400 transition group-focus-within:text-[#b88938]" />

            <Input
              id="email"
              name="email"
              type="email"
              defaultValue="admin@cloudview.test"
              required
              autoComplete="email"
              className="relative h-14 rounded-2xl border-neutral-200 bg-white/95 pl-12 text-base font-semibold shadow-sm transition focus:border-[#c99c38] focus:ring-[#c99c38]/20"
            />
             </div>
          </motion.div>
      

        <motion.div
          initial={fieldInitial}
          animate={fieldAnimate}
          transition={{ duration: 0.55, ease, delay: 0.04 }}
        >
          <label
            htmlFor="password"
            className="mb-2 block text-sm font-black text-ink"
          >
            Password
          </label>

            <div className="group relative transition duration-200 focus-within:-translate-y-0.5 focus-within:scale-[1.01]">
            <div className="pointer-events-none absolute -inset-1 rounded-[1.35rem] bg-gradient-to-r from-[#c99c38]/0 via-[#c99c38]/25 to-[#c99c38]/0 opacity-0 blur-xl transition duration-300 group-focus-within:opacity-100" />

            <LockKeyhole className="pointer-events-none absolute left-5 top-1/2 z-10 size-5 -translate-y-1/2 text-neutral-400 transition group-focus-within:text-[#b88938]" />

            <Input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              defaultValue="Password123!"
              required
              autoComplete="current-password"
              className="relative h-14 rounded-2xl border-neutral-200 bg-white/95 pl-14 pr-14 text-base font-semibold shadow-sm transition focus:border-[#c99c38] focus:ring-[#c99c38]/20"
            />

            <motion.button
              type="button"
              whileTap={{ scale: 0.9 }}
              onClick={() => setShowPassword((current) => !current)}
              className="absolute right-4 top-1/2 z-10 grid size-8 -translate-y-1/2 place-items-center rounded-full text-neutral-400 transition hover:bg-neutral-100 hover:text-ink"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={showPassword ? 'hide' : 'show'}
                  initial={{ opacity: 0, rotate: -18, scale: 0.85 }}
                  animate={{ opacity: 1, rotate: 0, scale: 1 }}
                  exit={{ opacity: 0, rotate: 18, scale: 0.85 }}
                  transition={{ duration: 0.18 }}
                >
                  {showPassword ? (
                    <EyeOff className="size-5" />
                  ) : (
                    <Eye className="size-5" />
                  )}
                </motion.span>
              </AnimatePresence>
            </motion.button>
             </div>
          </motion.div>
      

        <motion.div
          initial={fieldInitial}
          animate={fieldAnimate}
          transition={{ duration: 0.55, ease, delay: 0.08 }}
        >
          <Button
            type="submit"
            disabled={pending}
            className="group relative h-16 w-full overflow-hidden rounded-2xl bg-ink text-base font-black text-white shadow-[0_16px_34px_rgba(11,31,58,0.24)] transition hover:-translate-y-0.5 hover:bg-black disabled:translate-y-0 disabled:opacity-70"
            size="lg"
          >
            <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition duration-700 group-hover:translate-x-full" />

            {pending ? (
              <span className="relative inline-flex items-center gap-3">
                <span className="size-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Signing in...
              </span>
            ) : (
              <span className="relative inline-flex items-center gap-3">
                <LockKeyhole className="size-5" />
                Sign in
              </span>
            )}
          </Button>
        </motion.div>

        <motion.div
          initial={fieldInitial}
          animate={fieldAnimate}
          transition={{ duration: 0.55, ease, delay: 0.12 }}
          className="pt-2"
        >
          <div className="flex items-center gap-4">
            <span className="h-px flex-1 bg-neutral-200" />
            <p className="text-xs font-black uppercase tracking-[0.35em] text-gold">
              Demo Accounts
            </p>
            <span className="h-px flex-1 bg-neutral-200" />
          </div>

          <motion.div
            whileHover={reduceMotion ? undefined : { scale: 1.01 }}
            className="mt-5 flex items-start justify-center gap-3 rounded-2xl bg-white/35 px-4 py-3 text-center text-sm font-semibold leading-7 text-neutral-600 ring-1 ring-white/50"
          >
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
          </motion.div>
        </motion.div>
      </motion.form>
    </>
  );
}