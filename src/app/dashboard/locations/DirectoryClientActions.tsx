'use client';

import {
  type ChangeEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useTransition,
} from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  Building2,
  CheckCircle2,
  Loader2,
  Trash2,
  X,
} from 'lucide-react';

type DirectoryServerAction = (formData: FormData) => Promise<unknown>;

type ToastState = {
  type: 'success' | 'error';
  message: string;
} | null;

type DirectoryTab = 'rooms' | 'locations';

type HotelOption = {
  id: string;
  name: string;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Something went wrong. Please try again.';
}

function FloatingToast({
  toast,
  onClose,
}: {
  toast: ToastState;
  onClose: () => void;
}) {
  if (!toast) {
    return null;
  }

  const isSuccess = toast.type === 'success';

  return (
    <div className="fixed right-6 top-24 z-[180] w-[calc(100%-3rem)] max-w-sm">
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
            {isSuccess ? (
              <CheckCircle2 className="size-5" />
            ) : (
              <X className="size-5" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-[0.18em] opacity-70">
              {isSuccess ? 'Success' : 'Error'}
            </p>
            <p className="mt-1 text-sm font-black">{toast.message}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
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

function ToastPortal({
  toast,
  onClose,
}: {
  toast: ToastState;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => {
      onClose();
    }, 3500);

    return () => window.clearTimeout(timeout);
  }, [toast, onClose]);

  if (!mounted) {
    return null;
  }

  return createPortal(
    <FloatingToast toast={toast} onClose={onClose} />,
    document.body
  );
}

export function DirectoryHotelFilter({
  hotels,
  selectedHotelId,
  activeTab,
  searchQuery,
}: {
  hotels: HotelOption[];
  selectedHotelId: string;
  activeTab: DirectoryTab;
  searchQuery?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleHotelChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextHotelId = event.target.value;
    const params = new URLSearchParams();

    params.set('tab', activeTab);

    if (nextHotelId) {
      params.set('hotelId', nextHotelId);
    }

    if (searchQuery) {
      params.set('q', searchQuery);
    }

    startTransition(() => {
      router.replace(`/dashboard/locations?${params.toString()}`, {
        scroll: false,
      });
    });
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#f7f1e5] text-[#a8781d]">
          <Building2 className="size-5" />
        </span>

        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-neutral-400">
            Hotel filter
          </p>
          <p className="mt-0.5 text-sm font-black text-neutral-900">
            Manage one property at a time
          </p>
        </div>
      </div>

      <div className="relative w-full sm:max-w-sm">
        <select
          value={selectedHotelId}
          onChange={handleHotelChange}
          disabled={isPending || hotels.length === 0}
          aria-label="Filter rooms and locations by hotel"
          className="h-12 w-full appearance-none rounded-2xl border border-neutral-200 bg-white px-4 pr-11 text-sm font-black text-neutral-900 outline-none transition focus:border-[#c99c38] focus:ring-4 focus:ring-[#c99c38]/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {hotels.length === 0 ? (
            <option value="">No hotels available</option>
          ) : (
            hotels.map((hotel) => (
              <option key={hotel.id} value={hotel.id}>
                {hotel.name}
              </option>
            ))
          )}
        </select>

        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400">
          {isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <span className="text-xs">▼</span>
          )}
        </span>
      </div>
    </div>
  );
}

export function DirectoryActionForm({
  action,
  successMessage,
  className,
  children,
}: {
  action: DirectoryServerAction;
  successMessage: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [isPending, startTransition] = useTransition();

  function closeParentDialog() {
    const dialog = formRef.current?.closest(
      'dialog'
    ) as HTMLDialogElement | null;

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
          setToast({
            type: 'success',
            message: successMessage,
          });

          router.refresh();
        } catch (error) {
          setToast({
            type: 'error',
            message: getErrorMessage(error),
          });
        }
      })();
    });
  }

  return (
    <>
      <form ref={formRef} action={handleAction} className={className}>
        <fieldset disabled={isPending} className="contents">
          {children}
        </fieldset>
      </form>

      <ToastPortal toast={toast} onClose={() => setToast(null)} />
    </>
  );
}

export function DirectoryConfirmButton({
  id,
  fieldName,
  itemName,
  itemType,
  action,
  successMessage,
  className,
}: {
  id: string;
  fieldName: 'roomId' | 'locationId';
  itemName: string;
  itemType: 'room' | 'location';
  action: DirectoryServerAction;
  successMessage: string;
  className?: string;
}) {
  const router = useRouter();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [isPending, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  function runDelete() {
    startTransition(() => {
      void (async () => {
        try {
          const formData = new FormData();
          formData.set(fieldName, id);

          await action(formData);

          setConfirmOpen(false);
          setToast({
            type: 'success',
            message: successMessage,
          });

          router.refresh();
        } catch (error) {
          setToast({
            type: 'error',
            message: getErrorMessage(error),
          });
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
        {isPending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Trash2 className="size-3.5" />
        )}
        {isPending ? 'Deleting...' : 'Delete'}
      </button>

      {mounted && confirmOpen
        ? createPortal(
            <div className="fixed inset-0 z-[160] flex items-start justify-center overflow-y-auto overscroll-contain bg-black/55 px-3 py-3 backdrop-blur-sm sm:items-center sm:p-4">
              <div role="alertdialog" aria-modal="true" className="max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-[1.5rem] border border-neutral-200 bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:rounded-[2rem]">
                <div className="border-b border-red-100 bg-red-50 p-4 sm:p-6">
                  <div className="flex items-start gap-4">
                    <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-red-100 text-red-700">
                      <Trash2 className="size-5" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-xl font-black text-neutral-950">
                        Delete {itemType === 'room' ? 'Room' : 'Location'}?
                      </p>

                      <p className="mt-2 text-sm font-semibold leading-6 text-neutral-600">
                        This will remove <b>{itemName}</b> from the active
                        directory. This action cannot be undone.
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

                <div className="p-4 sm:p-6">
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
            </div>,
            document.body
          )
        : null}

      <ToastPortal toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
