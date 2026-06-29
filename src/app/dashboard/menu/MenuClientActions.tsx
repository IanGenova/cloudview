'use client';

import { type ReactNode, useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Loader2, Trash2, X } from 'lucide-react';

export type MenuMessage =
  | {
      type: 'success' | 'error';
      text: string;
    }
  | null;

type MenuServerAction = (formData: FormData) => Promise<unknown>;

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Something went wrong. Please try again.';
}

export function MenuPageToast({
  initialMessage,
}: {
  initialMessage: MenuMessage;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [toast, setToast] = useState<MenuMessage>(initialMessage);

  useEffect(() => {
    if (!initialMessage) {
      return;
    }

    setToast(initialMessage);

    const params = new URLSearchParams(searchParams.toString());
    params.delete('success');
    params.delete('error');

    router.replace(params.toString() ? `${pathname}?${params.toString()}` : pathname, {
      scroll: false,
    });
  }, [initialMessage, pathname, router, searchParams]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setToast(null);
    }, 3500);

    return () => window.clearTimeout(timeout);
  }, [toast]);

  if (!toast) {
    return null;
  }

  const isSuccess = toast.type === 'success';

  return (
    <div className="fixed right-6 top-24 z-[140] w-[calc(100%-3rem)] max-w-sm">
      <div
        className={
          isSuccess
            ? 'rounded-3xl border border-emerald-200 bg-emerald-50/95 p-4 text-emerald-800 shadow-2xl backdrop-blur-xl'
            : 'rounded-3xl border border-red-200 bg-red-50/95 p-4 text-red-800 shadow-2xl backdrop-blur-xl'
        }
      >
        <div className="flex items-start gap-3">
          <div
            className={
              isSuccess
                ? 'grid size-10 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-emerald-700'
                : 'grid size-10 shrink-0 place-items-center rounded-2xl bg-red-100 text-red-700'
            }
          >
            {isSuccess ? <CheckCircle2 className="size-5" /> : <X className="size-5" />}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-[0.18em] opacity-70">
              {isSuccess ? 'Success' : 'Action failed'}
            </p>
            <p className="mt-1 text-sm font-black">{toast.text}</p>
          </div>

          <button
            type="button"
            onClick={() => setToast(null)}
            className="grid size-8 shrink-0 place-items-center rounded-full bg-white/70 text-current transition hover:bg-white"
            aria-label="Close notification"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function MenuActionForm({
  id,
  action,
  successMessage,
  className,
  closeDialog = true,
  children,
}: {
  id?: string;
  action: MenuServerAction;
  successMessage: string;
  className?: string;
  closeDialog?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement | null>(null);
  const [isPending, startTransition] = useTransition();

  function closeParentDialog() {
    if (!closeDialog) {
      return;
    }

    const dialog = formRef.current?.closest('dialog') as HTMLDialogElement | null;

    if (dialog?.open) {
      dialog.close();
    }
  }

  function handleAction(formData: FormData) {
    startTransition(() => {
      void (async () => {
        try {
          await action(formData);

          closeParentDialog();

          window.dispatchEvent(
            new CustomEvent('cloudview-menu-toast', {
              detail: {
                type: 'success',
                text: successMessage,
              },
            })
          );

          router.refresh();
        } catch (error) {
          window.dispatchEvent(
            new CustomEvent('cloudview-menu-toast', {
              detail: {
                type: 'error',
                text: getErrorMessage(error),
              },
            })
          );
        }
      })();
    });
  }

  return (
    <form ref={formRef} id={id} action={handleAction} className={className}>
      {children}

      {isPending ? (
        <span className="sr-only" aria-live="polite">
          Saving...
        </span>
      ) : null}
    </form>
  );
}

export function MenuToastListener() {
  const [toast, setToast] = useState<MenuMessage>(null);

  useEffect(() => {
    function handleToast(event: Event) {
      const customEvent = event as CustomEvent<MenuMessage>;
      setToast(customEvent.detail);
    }

    window.addEventListener('cloudview-menu-toast', handleToast);

    return () => window.removeEventListener('cloudview-menu-toast', handleToast);
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setToast(null);
    }, 3500);

    return () => window.clearTimeout(timeout);
  }, [toast]);

  if (!toast) {
    return null;
  }

  const isSuccess = toast.type === 'success';

  return (
    <div className="fixed right-6 top-24 z-[150] w-[calc(100%-3rem)] max-w-sm">
      <div
        className={
          isSuccess
            ? 'rounded-3xl border border-emerald-200 bg-emerald-50/95 p-4 text-emerald-800 shadow-2xl backdrop-blur-xl'
            : 'rounded-3xl border border-red-200 bg-red-50/95 p-4 text-red-800 shadow-2xl backdrop-blur-xl'
        }
      >
        <div className="flex items-start gap-3">
          <div
            className={
              isSuccess
                ? 'grid size-10 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-emerald-700'
                : 'grid size-10 shrink-0 place-items-center rounded-2xl bg-red-100 text-red-700'
            }
          >
            {isSuccess ? <CheckCircle2 className="size-5" /> : <X className="size-5" />}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-[0.18em] opacity-70">
              {isSuccess ? 'Success' : 'Action failed'}
            </p>
            <p className="mt-1 text-sm font-black">{toast.text}</p>
          </div>

          <button
            type="button"
            onClick={() => setToast(null)}
            className="grid size-8 shrink-0 place-items-center rounded-full bg-white/70 text-current transition hover:bg-white"
            aria-label="Close notification"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function MenuConfirmDeleteButton({
  id,
  fieldName,
  itemName,
  itemType,
  action,
  successMessage,
  className,
}: {
  id: string;
  fieldName: 'productId' | 'categoryId';
  itemName: string;
  itemType: 'product' | 'category';
  action: MenuServerAction;
  successMessage: string;
  className?: string;
}) {
  const router = useRouter();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function runDelete() {
    startTransition(() => {
      void (async () => {
        try {
          const formData = new FormData();
          formData.set(fieldName, id);

          await action(formData);

          setConfirmOpen(false);

          window.dispatchEvent(
            new CustomEvent('cloudview-menu-toast', {
              detail: {
                type: 'success',
                text: successMessage,
              },
            })
          );

          router.refresh();
        } catch (error) {
          window.dispatchEvent(
            new CustomEvent('cloudview-menu-toast', {
              detail: {
                type: 'error',
                text: getErrorMessage(error),
              },
            })
          );
        }
      })();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={isPending}
        className={className}
      >
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
        {isPending ? 'Deleting...' : 'Delete'}
      </button>

      {confirmOpen ? (
        <div className="fixed inset-0 z-[160] grid place-items-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-[2rem] border border-neutral-200 bg-white shadow-2xl">
            <div className="border-b border-red-100 bg-red-50 p-6">
              <div className="flex items-start gap-4">
                <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-red-100 text-red-700">
                  <Trash2 className="size-5" />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-xl font-black text-neutral-950">
                    Delete {itemType === 'product' ? 'Product' : 'Category'}?
                  </p>

                  <p className="mt-2 text-sm font-semibold leading-6 text-neutral-600">
                    This will remove <b>{itemName}</b> from the menu management list.
                    This action cannot be undone.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setConfirmOpen(false)}
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-white/70 text-neutral-500 transition hover:bg-white"
                  aria-label="Close confirmation"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-neutral-400">
                  Selected {itemType}
                </p>

                <p className="mt-2 truncate text-lg font-black text-neutral-950">
                  {itemName}
                </p>
              </div>

              <div className="mt-6 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setConfirmOpen(false)}
                  disabled={isPending}
                  className="h-11 rounded-2xl border border-neutral-200 bg-white text-sm font-black text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={runDelete}
                  disabled={isPending}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-red-600 text-sm font-black text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                  {isPending ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}