'use client';

import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Loader2, RotateCcw, Save, X } from 'lucide-react';

type SaveAction = (formData: FormData) => void | Promise<void>;

type ToastState = {
  type: 'success' | 'info' | 'loading';
  title: string;
  description: string;
} | null;

const IGNORED_CHANGE_FIELDS = new Set(['guestPortalHeroImage']);

function readComparableFormValues(form: HTMLFormElement) {
  const formData = new FormData(form);
  const values: Record<string, string> = {};

  for (const [key, value] of formData.entries()) {
    if (IGNORED_CHANGE_FIELDS.has(key)) continue;

    if (typeof value === 'string') {
      values[key] = value.trim();
    }
  }

  const heroFileInput = form.elements.namedItem(
    'guestPortalHeroImage'
  ) as HTMLInputElement | null;

  const hasHeroUpload = Boolean(heroFileInput?.files?.length);

  return {
    values,
    hasHeroUpload,
  };
}

function hasChanges(
  currentValues: Record<string, string>,
  initialValues: Record<string, string>,
  hasHeroUpload: boolean
) {
  if (hasHeroUpload) return true;

  const keys = new Set([
    ...Object.keys(currentValues),
    ...Object.keys(initialValues),
  ]);

  for (const key of keys) {
    if ((currentValues[key] ?? '') !== (initialValues[key] ?? '')) {
      return true;
    }
  }

  return false;
}

export function HotelSettingsFormClient({
  action,
  initialValues,
  children,
}: {
  action: SaveAction;
  initialValues: Record<string, string>;
  children: ReactNode;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const searchParams = useSearchParams();

  const [isDirty, setIsDirty] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmedSubmit, setConfirmedSubmit] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  function checkDirty() {
    const form = formRef.current;
    if (!form) return;

    const { values, hasHeroUpload } = readComparableFormValues(form);
    setIsDirty(hasChanges(values, initialValues, hasHeroUpload));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (confirmedSubmit) {
      setConfirmedSubmit(false);
      setToast({
        type: 'loading',
        title: 'Saving hotel settings...',
        description: 'Please wait while CloudView updates the property settings.',
      });
      return;
    }

    const { values, hasHeroUpload } = readComparableFormValues(event.currentTarget);
    const changed = hasChanges(values, initialValues, hasHeroUpload);

    if (!changed) {
      event.preventDefault();
      setToast({
        type: 'info',
        title: 'No changes detected',
        description: 'Update a field first before saving hotel settings.',
      });
      return;
    }

    event.preventDefault();
    setConfirmOpen(true);
  }

  function confirmSave() {
    setConfirmOpen(false);
    setConfirmedSubmit(true);

    requestAnimationFrame(() => {
      formRef.current?.requestSubmit();
    });
  }

  function resetForm() {
    formRef.current?.reset();

    requestAnimationFrame(() => {
      checkDirty();
      setToast({
        type: 'info',
        title: 'Changes reset',
        description: 'The form was restored to the last saved values.',
      });
    });
  }

  useEffect(() => {
    if (searchParams.get('saved') === '1') {
      setToast({
        type: 'success',
        title: 'Hotel settings saved',
        description: 'Your latest property settings have been updated successfully.',
      });

      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!toast || toast.type === 'loading') return;

    const timeout = window.setTimeout(() => {
      setToast(null);
    }, 4000);

    return () => window.clearTimeout(timeout);
  }, [toast]);

  return (
    <>
      <form
        ref={formRef}
        action={action}
        onSubmit={handleSubmit}
        onChange={checkDirty}
        onInput={checkDirty}
        className="grid gap-6 md:grid-cols-2"
      >
        {children}

        <div className="md:col-span-2">
          <div className="rounded-[1.5rem] border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-950">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-black text-neutral-950 dark:text-white">
                  Review and save changes
                </p>
                <p className="mt-1 text-sm font-medium text-neutral-500 dark:text-neutral-400">
                  CloudView will ask for confirmation before applying changes.
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={!isDirty}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-neutral-200 bg-white px-5 text-sm font-black text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white dark:hover:bg-neutral-800"
                >
                  <RotateCcw className="size-4" />
                  Reset
                </button>

                <button
                  type="submit"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-black px-5 text-sm font-black text-white transition hover:bg-neutral-800 dark:bg-gold dark:text-black dark:hover:bg-gold/80"
                >
                  <Save className="size-4" />
                  Save Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      </form>

      {isDirty ? (
        <div className="fixed bottom-6 left-1/2 z-40 w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 rounded-[1.5rem] border border-amber-200 bg-white/95 p-3 shadow-2xl backdrop-blur dark:border-amber-500/30 dark:bg-neutral-950/95">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200">
                <AlertTriangle className="size-5" />
              </div>

              <div>
                <p className="text-sm font-black text-neutral-950 dark:text-white">
                  You have unsaved changes
                </p>
                <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                  Save or reset before leaving this settings page.
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={resetForm}
                className="h-10 rounded-xl border border-neutral-200 bg-white px-4 text-xs font-black text-neutral-700 hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white"
              >
                Reset
              </button>

              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                className="h-10 rounded-xl bg-black px-4 text-xs font-black text-white hover:bg-neutral-800 dark:bg-gold dark:text-black"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmOpen ? (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl dark:bg-neutral-950">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xl font-black text-neutral-950 dark:text-white">
                  Save hotel settings?
                </p>
                <p className="mt-2 text-sm leading-6 text-neutral-500 dark:text-neutral-400">
                  These changes will update the guest portal, hotel guide, billing defaults, and property information.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="grid size-9 place-items-center rounded-full bg-neutral-100 text-neutral-500 hover:bg-neutral-200 dark:bg-neutral-900 dark:text-white"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="h-11 rounded-2xl border border-neutral-200 bg-white text-sm font-black text-neutral-700 hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={confirmSave}
                className="h-11 rounded-2xl bg-black text-sm font-black text-white hover:bg-neutral-800 dark:bg-gold dark:text-black"
              >
                Yes, Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="fixed right-5 top-5 z-[130] w-[calc(100%-2.5rem)] max-w-sm rounded-[1.5rem] border border-neutral-200 bg-white p-4 shadow-2xl dark:border-neutral-800 dark:bg-neutral-950">
          <div className="flex gap-3">
            <div
              className={
                toast.type === 'success'
                  ? 'grid size-10 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200'
                  : toast.type === 'loading'
                    ? 'grid size-10 shrink-0 place-items-center rounded-2xl bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200'
                    : 'grid size-10 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200'
              }
            >
              {toast.type === 'loading' ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <CheckCircle2 className="size-5" />
              )}
            </div>

            <div>
              <p className="font-black text-neutral-950 dark:text-white">
                {toast.title}
              </p>
              <p className="mt-1 text-sm leading-5 text-neutral-500 dark:text-neutral-400">
                {toast.description}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}