'use client';

import { DashboardToastViewport } from '@/components/dashboard/DashboardToastViewport';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  ConciergeBell,
  EyeOff,
  Filter,
  Loader2,
  PackagePlus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import {
  createServiceCatalogItemAction,
  deleteServiceCatalogItemAction,
  seedDefaultServicesAction,
  updateServiceCatalogItemAction,
} from './actions';

type ServiceBillingMode = 'FREE' | 'FIXED_PRICE' | 'PRICE_ON_CONFIRMATION';

type HotelOption = {
  id: string;
  name: string;
};

type ServiceItem = {
  id: string;
  hotelId: string;
  hotelName: string;
  name: string;
  code: string;
  category: string;
  description: string;
  iconKey: string;
  billingMode: ServiceBillingMode;
  unitPrice: number;
  unitLabel: string;
  isActive: boolean;
  sortOrder: number;
};

type Message =
  | {
      type: 'success' | 'error';
      text: string;
    }
  | null;

type ToastState = Message;

type ServiceServerAction = (formData: FormData) => Promise<unknown>;

type ServiceFormAction = (formData: FormData) => void | Promise<void>;

function getClientActionError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Something went wrong. Please try again.';
}  

const iconOptions = [
  'ConciergeBell',
  'Waves',
  'Sparkles',
  'Shirt',
  'Hammer',
  'PackagePlus',
  'Baby',
  'Car',
  'SprayCan',
  'Clock',
  'Droplets',
  'BedDouble',
];

const categoryOptions = [
  'Housekeeping',
  'Room Assistance',
  'Concierge',
  'Essentials',
  'Dining',
  'Amenities',
  'Other',
];

const moneyFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
});

function getBillingLabel(service: ServiceItem) {
  if (service.billingMode === 'FREE') {
    return 'Free';
  }

  if (service.billingMode === 'PRICE_ON_CONFIRMATION') {
    return 'Price on confirmation';
  }

  return `${moneyFormatter.format(service.unitPrice)} ${
    service.unitLabel || ''
  }`;
}

function getBillingBadgeClass(service: ServiceItem) {
  if (service.billingMode === 'FREE') {
    return 'bg-emerald-100 text-emerald-700';
  }

  if (service.billingMode === 'PRICE_ON_CONFIRMATION') {
    return 'bg-amber-100 text-amber-700';
  }

  return 'bg-gold/20 text-ink';
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
    <DashboardToastViewport>
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

            <p className="mt-1 text-sm font-black">{toast.text}</p>
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
    </DashboardToastViewport>
  );
}

function Modal({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/50 px-3 py-3 sm:items-center sm:px-4 sm:py-6">
      <div role="dialog" aria-modal="true" className="max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl overflow-y-auto rounded-[1.5rem] bg-white p-4 shadow-2xl sm:max-h-[calc(100dvh-3rem)] sm:rounded-[2rem] sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black">{title}</h2>
            {description ? (
              <p className="mt-1 text-sm text-neutral-500">{description}</p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-neutral-100 text-sm font-black hover:bg-neutral-200"
          >
            ✕
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

function CreateServiceModal({
  hotels,
  defaultHotelId,
  canChangeHotel,
  onClose,
  action,
}: {
  hotels: HotelOption[];
  defaultHotelId: string;
  canChangeHotel: boolean;
  onClose: () => void;
  action: ServiceFormAction;
}) {

  return (
    <Modal
      title="Create Service / Add-on"
      description="Add a service or paid room add-on that guests can request from the Guest Portal."
      onClose={onClose}
    >
      <form action={action} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
            Hotel
          </label>
          <Select
            name="hotelId"
            defaultValue={defaultHotelId}
            disabled={!canChangeHotel}
          >
            {hotels.map((hotel) => (
              <option key={hotel.id} value={hotel.id}>
                {hotel.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
              Service Name
            </label>
            <input
              name="name"
              required
              placeholder="Extra Towels"
              className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
              Code
            </label>
            <input
              name="code"
              placeholder="EXTRA_TOWELS"
              className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold uppercase outline-none focus:border-neutral-400"
            />
            <p className="mt-1 text-xs text-neutral-500">
              Leave blank to generate from service name.
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
              Category
            </label>
            <Select name="category" defaultValue="Housekeeping">
              {categoryOptions.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
              Icon
            </label>
            <Select name="iconKey" defaultValue="ConciergeBell">
              {iconOptions.map((icon) => (
                <option key={icon} value={icon}>
                  {icon}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
              Billing Mode
            </label>
            <Select name="billingMode" defaultValue="FREE">
              <option value="FREE">Free</option>
              <option value="FIXED_PRICE">Fixed Price</option>
              <option value="PRICE_ON_CONFIRMATION">
                Price on Confirmation
              </option>
            </Select>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
              Unit Price
            </label>
            <input
              name="unitPrice"
              type="number"
              min="0"
              step="0.01"
              defaultValue="0"
              className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
              Unit Label
            </label>
            <input
              name="unitLabel"
              placeholder="per set"
              className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
              Sort Order
            </label>
            <input
              name="sortOrder"
              type="number"
              step="1"
              defaultValue="0"
              className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
            Description
          </label>
          <textarea
            name="description"
            rows={3}
            placeholder="Describe what the guest will receive."
            className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-neutral-400"
          />
        </div>

        <label className="flex items-center gap-2 text-sm font-bold">
          <input
            type="checkbox"
            name="isActive"
            value="true"
            defaultChecked
            className="size-4"
          />
          Show in Guest Portal
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-2xl border border-neutral-200 px-5 text-sm font-black hover:bg-neutral-50"
          >
            Cancel
          </button>

          <Button>Create Service Item</Button>
        </div>
      </form>
    </Modal>
  );
}

function EditServiceModal({
  service,
  onClose,
  action,
}: {
  service: ServiceItem;
  onClose: () => void;
  action: ServiceFormAction;
}) {
  return (
    <Modal
      title="Edit Service Item"
      description="Update how this service appears in the Guest Portal."
      onClose={onClose}
    >
      <form action={action} className="space-y-4">
        <input type="hidden" name="itemId" value={service.id} />

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
              Service Name
            </label>
            <input
              name="name"
              defaultValue={service.name}
              required
              className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
              Code
            </label>
            <input
              name="code"
              defaultValue={service.code}
              required
              className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold uppercase outline-none focus:border-neutral-400"
            />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
              Category
            </label>
            <Select name="category" defaultValue={service.category}>
              {categoryOptions.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
              Icon
            </label>
            <Select name="iconKey" defaultValue={service.iconKey}>
              {iconOptions.map((icon) => (
                <option key={icon} value={icon}>
                  {icon}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
              Billing Mode
            </label>
            <Select name="billingMode" defaultValue={service.billingMode}>
              <option value="FREE">Free</option>
              <option value="FIXED_PRICE">Fixed Price</option>
              <option value="PRICE_ON_CONFIRMATION">
                Price on Confirmation
              </option>
            </Select>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
              Unit Price
            </label>
            <input
              name="unitPrice"
              type="number"
              min="0"
              step="0.01"
              defaultValue={String(service.unitPrice)}
              className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
              Unit Label
            </label>
            <input
              name="unitLabel"
              defaultValue={service.unitLabel}
              placeholder="per set"
              className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
              Sort Order
            </label>
            <input
              name="sortOrder"
              type="number"
              step="1"
              defaultValue={service.sortOrder}
              className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
            Description
          </label>
          <textarea
            name="description"
            rows={3}
            defaultValue={service.description}
            className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-neutral-400"
          />
        </div>

        <label className="flex items-center gap-2 text-sm font-bold">
          <input
            type="checkbox"
            name="isActive"
            value="true"
            defaultChecked={service.isActive}
            className="size-4"
          />
          Show in Guest Portal
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-2xl border border-neutral-200 px-5 text-sm font-black hover:bg-neutral-50"
          >
            Cancel
          </button>

          <Button>Save Changes</Button>
        </div>
      </form>
    </Modal>
  );
}

export function ServicesModuleClient({
  hotels,
  services,
  message,
  defaultHotelId,
  canChangeHotel,
}: {
  hotels: HotelOption[];
  services: ServiceItem[];
  message: Message;
  defaultHotelId: string;
  canChangeHotel: boolean;
}) {
 const router = useRouter();

  const [localServices, setLocalServices] = useState<ServiceItem[]>(services);
  const [creatingService, setCreatingService] = useState(false);
  const [editingService, setEditingService] = useState<ServiceItem | null>(null);
  const [deleteService, setDeleteService] = useState<ServiceItem | null>(null);
  const [toast, setToast] = useState<ToastState>(message);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'HIDDEN'>(
    'ALL'
  );
  const [billingFilter, setBillingFilter] = useState<'ALL' | ServiceBillingMode>(
    'ALL'
  );
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
  setLocalServices(services);
}, [services]);

useEffect(() => {
  if (message) {
    setToast(message);
  }
}, [message]);

useEffect(() => {
  if (!toast) {
    return;
  }

  const timeout = window.setTimeout(() => {
    setToast(null);
  }, 3500);

  return () => window.clearTimeout(timeout);
}, [toast]);

function runServiceAction({
  formData,
  action,
  successText,
  pendingKey,
  optimisticUpdate,
  onSuccess,
}: {
  formData: FormData;
  action: ServiceServerAction;
  successText: string;
  pendingKey: string;
  optimisticUpdate?: (items: ServiceItem[]) => ServiceItem[];
  onSuccess?: () => void;
}) {
  const previousServices = localServices;

  setToast(null);
  setPendingAction(pendingKey);

  if (optimisticUpdate) {
    setLocalServices((items) => optimisticUpdate(items));
  }

  startTransition(() => {
    void (async () => {
      try {
        await action(formData);

        onSuccess?.();

        setToast({
          type: 'success',
          text: successText,
        });

        router.refresh();
      } catch (error) {
        setLocalServices(previousServices);

        setToast({
          type: 'error',
          text: getClientActionError(error),
        });
      } finally {
        setPendingAction(null);
      }
    })();
  });
}

function handleCreateService(formData: FormData) {
  runServiceAction({
    formData,
    action: createServiceCatalogItemAction,
    successText: 'Service item successfully created.',
    pendingKey: 'create',
    onSuccess: () => setCreatingService(false),
  });
}

function handleUpdateService(formData: FormData) {
  runServiceAction({
    formData,
    action: updateServiceCatalogItemAction,
    successText: 'Service item successfully updated.',
    pendingKey: `update:${editingService?.id ?? ''}`,
    onSuccess: () => setEditingService(null),
  });
}

function handleSeedDefaultServices(formData: FormData) {
  runServiceAction({
    formData,
    action: seedDefaultServicesAction,
    successText: 'Default services successfully added.',
    pendingKey: 'seed',
  });
}

function handleDeleteServiceConfirm() {
  if (!deleteService) {
    return;
  }

  const formData = new FormData();
  formData.set('itemId', deleteService.id);

  const serviceId = deleteService.id;

  setDeleteService(null);

  runServiceAction({
    formData,
    action: deleteServiceCatalogItemAction,
    successText: 'Service item successfully deleted.',
    pendingKey: `delete:${serviceId}`,
    optimisticUpdate: (items) =>
      items.filter((item) => item.id !== serviceId),
  });
}

  const serviceStats = useMemo(() => {
    return localServices.reduce(
      (stats, service) => {
        stats.total += 1;

        if (service.isActive) {
          stats.active += 1;
        } else {
          stats.hidden += 1;
        }

        if (service.billingMode === 'FREE') {
          stats.free += 1;
        } else if (service.billingMode === 'FIXED_PRICE') {
          stats.paid += 1;
        } else {
          stats.confirmation += 1;
        }

        return stats;
      },
      {
        total: 0,
        active: 0,
        hidden: 0,
        free: 0,
        paid: 0,
        confirmation: 0,
      }
    );
  }, [localServices]);

  const availableCategories = useMemo(() => {
    return Array.from(
      new Set(localServices.map((service) => service.category).filter(Boolean))
    ).sort((left, right) => left.localeCompare(right));
  }, [localServices]);

  const filteredServices = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return localServices.filter((service) => {
      if (categoryFilter !== 'ALL' && service.category !== categoryFilter) {
        return false;
      }

      if (statusFilter === 'ACTIVE' && !service.isActive) {
        return false;
      }

      if (statusFilter === 'HIDDEN' && service.isActive) {
        return false;
      }

      if (billingFilter !== 'ALL' && service.billingMode !== billingFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const searchableText = [
        service.name,
        service.code,
        service.category,
        service.description,
        service.hotelName,
        service.iconKey,
      ]
        .join(' ')
        .toLowerCase();

      return searchableText.includes(normalizedSearch);
    });
  }, [billingFilter, categoryFilter, localServices, searchQuery, statusFilter]);

  const groupedServices = useMemo(() => {
    const groups = new Map<string, ServiceItem[]>();

    for (const service of filteredServices) {
      const key = canChangeHotel
        ? `${service.hotelName} · ${service.category}`
        : service.category;

      const current = groups.get(key) ?? [];
      current.push(service);
      groups.set(key, current);
    }

    return Array.from(groups.entries()).map(([groupName, items]) => ({
      groupName,
      items,
    }));
  }, [filteredServices, canChangeHotel]);

  return (
    <>
      <FloatingToast toast={toast} onClose={() => setToast(null)} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_370px]">
        <section className="overflow-hidden rounded-[2.25rem] border border-[#c99c38]/25 bg-[#11100b] text-white shadow-[0_24px_70px_rgba(0,0,0,0.16)]">
          <div className="relative p-6">
            <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-[#c99c38]/25 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 left-10 size-72 rounded-full bg-emerald-500/10 blur-3xl" />

            <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="inline-flex items-center gap-2 rounded-full border border-[#c99c38]/35 bg-white/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.22em] text-[#f1c66a]">
                  <ConciergeBell className="size-4" />
                  Guest Portal Catalog
                </p>

                <h2 className="mt-5 text-3xl font-black tracking-tight lg:text-4xl">
                  Services & Room Add-ons
                </h2>

                <p className="mt-3 max-w-2xl text-sm font-semibold leading-7 text-white/60">
                  Manage guest-facing services, paid add-ons, visibility, pricing,
                  and display order from one clean service catalog.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setCreatingService(true)}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#d6a738] px-5 py-3 text-sm font-black text-black shadow-[0_16px_35px_rgba(214,167,56,0.25)] transition hover:bg-[#f1c66a]"
              >
                <PackagePlus className="size-4" />
                Create Service / Add-on
              </button>
            </div>
          </div>

          <div className="grid border-t border-white/10 bg-black/20 sm:grid-cols-4">
            <div className="border-b border-white/10 p-5 sm:border-b-0 sm:border-r">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#d6a738]">
                Total Items
              </p>
              <p className="mt-1 text-3xl font-black">{serviceStats.total}</p>
              <p className="mt-1 text-xs font-semibold text-white/45">
                Full catalog
              </p>
            </div>

            <div className="border-b border-white/10 p-5 sm:border-b-0 sm:border-r">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#d6a738]">
                Active
              </p>
              <p className="mt-1 text-3xl font-black">{serviceStats.active}</p>
              <p className="mt-1 text-xs font-semibold text-white/45">
                Visible in portal
              </p>
            </div>

            <div className="border-b border-white/10 p-5 sm:border-b-0 sm:border-r">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#d6a738]">
                Hidden
              </p>
              <p className="mt-1 text-3xl font-black">{serviceStats.hidden}</p>
              <p className="mt-1 text-xs font-semibold text-white/45">
                Not guest-visible
              </p>
            </div>

            <div className="p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#d6a738]">
                Paid / Confirm
              </p>
              <p className="mt-1 text-3xl font-black">
                {serviceStats.paid + serviceStats.confirmation}
              </p>
              <p className="mt-1 text-xs font-semibold text-white/45">
                Billable services
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-[2.25rem] border border-[#c99c38]/25 bg-[#fffaf0] p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#d6a738] text-black">
              <Sparkles className="size-5" />
            </span>

            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#9a6b18]">
                Default Setup
              </p>
              <h2 className="mt-1 text-xl font-black text-[#11100b]">
                Recommended services
              </h2>
              <p className="mt-1 text-sm font-semibold leading-6 text-neutral-600">
                Add the standard room services and add-ons for the selected hotel.
              </p>
            </div>
          </div>

          <form action={handleSeedDefaultServices} className="mt-5 space-y-4">
            <div>
              <label className="mb-1 block text-xs font-black uppercase tracking-wide text-neutral-500">
                Hotel
              </label>
              <Select
                name="hotelId"
                defaultValue={defaultHotelId}
                disabled={!canChangeHotel}
              >
                {hotels.map((hotel) => (
                  <option key={hotel.id} value={hotel.id}>
                    {hotel.name}
                  </option>
                ))}
              </Select>
            </div>

            <Button className="w-full" disabled={pendingAction === 'seed' || isPending}>
              {pendingAction === 'seed' ? 'Adding defaults...' : 'Add Default Services'}
            </Button>
          </form>

          <p className="mt-4 rounded-2xl border border-[#c99c38]/20 bg-white/70 p-4 text-xs font-bold leading-5 text-[#8a641d]">
            Tip: run this once per hotel, then customize pricing, labels, and visibility below.
          </p>
        </section>
      </div>

      <section className="mt-5 rounded-[2.25rem] border border-neutral-200 bg-white shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
        <div className="border-b border-neutral-100 p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#b88938]">
                Service Catalog
              </p>
              <h2 className="mt-1 text-2xl font-black text-[#11100b]">
                Existing Services
              </h2>
              <p className="mt-1 text-sm font-medium text-neutral-500">
                Search, filter, edit, and control all services shown in the Guest Portal.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-neutral-100 px-4 py-2 text-xs font-black text-neutral-700">
                <ConciergeBell className="size-4 text-[#b88938]" />
                {filteredServices.length} shown
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-4 py-2 text-xs font-black text-emerald-700">
                {serviceStats.free} free
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-2 text-xs font-black text-amber-700">
                {serviceStats.confirmation} confirm price
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-neutral-100 px-4 py-2 text-xs font-black text-neutral-600">
                <EyeOff className="size-4" />
                {serviceStats.hidden} hidden
              </span>
            </div>
          </div>

          <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px_180px_210px]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search service, code, hotel, category, or description..."
                className="h-12 w-full rounded-2xl border border-neutral-200 bg-white pl-11 pr-4 text-sm font-bold outline-none transition focus:border-[#b88938] focus:ring-4 focus:ring-[#b88938]/10"
              />
            </label>

            <label className="grid gap-1">
              <span className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-wide text-neutral-500">
                <Filter className="size-3.5" />
                Category
              </span>
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="h-12 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-black outline-none transition focus:border-[#b88938] focus:ring-4 focus:ring-[#b88938]/10"
              >
                <option value="ALL">All Categories</option>
                {availableCategories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1">
              <span className="text-xs font-black uppercase tracking-wide text-neutral-500">
                Status
              </span>
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as 'ALL' | 'ACTIVE' | 'HIDDEN')
                }
                className="h-12 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-black outline-none transition focus:border-[#b88938] focus:ring-4 focus:ring-[#b88938]/10"
              >
                <option value="ALL">All Status</option>
                <option value="ACTIVE">Active</option>
                <option value="HIDDEN">Hidden</option>
              </select>
            </label>

            <label className="grid gap-1">
              <span className="text-xs font-black uppercase tracking-wide text-neutral-500">
                Billing
              </span>
              <select
                value={billingFilter}
                onChange={(event) =>
                  setBillingFilter(event.target.value as 'ALL' | ServiceBillingMode)
                }
                className="h-12 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-black outline-none transition focus:border-[#b88938] focus:ring-4 focus:ring-[#b88938]/10"
              >
                <option value="ALL">All Billing Modes</option>
                <option value="FREE">Free</option>
                <option value="FIXED_PRICE">Fixed Price</option>
                <option value="PRICE_ON_CONFIRMATION">Price on Confirmation</option>
              </select>
            </label>
          </div>
        </div>

        <div className="p-5">
          <div className="space-y-6">
            {groupedServices.map((group) => (
              <section key={group.groupName}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-black uppercase tracking-wide text-neutral-500">
                    {group.groupName}
                  </h3>

                  <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-black text-neutral-600">
                    {group.items.length} item{group.items.length === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="overflow-hidden rounded-[1.5rem] border border-neutral-200 bg-white">
                  <div className="hidden border-b border-neutral-100 bg-neutral-50 px-4 py-3 text-xs font-black uppercase tracking-wide text-neutral-500 xl:grid xl:grid-cols-[minmax(260px,1.3fr)_minmax(200px,0.9fr)_180px_130px_90px_220px] xl:items-center xl:gap-4">
                    <span>Service</span>
                    <span>Hotel / Category</span>
                    <span>Billing</span>
                    <span>Visibility</span>
                    <span>Sort</span>
                    <span className="text-right">Actions</span>
                  </div>

                  {group.items.map((service) => (
                    <div
                      key={service.id}
                      className="grid gap-4 border-t border-neutral-100 p-4 first:border-t-0 xl:grid-cols-[minmax(260px,1.3fr)_minmax(200px,0.9fr)_180px_130px_90px_220px] xl:items-center"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#fff8e7] text-[#9a6b18]">
                          <ConciergeBell className="size-5" />
                        </span>

                        <div className="min-w-0">
                          <p className="truncate text-base font-black text-[#11100b]">
                            {service.name}
                          </p>
                          <p className="mt-1 truncate text-xs font-black uppercase tracking-wide text-neutral-500">
                            {service.code}
                          </p>
                          <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-neutral-500">
                            {service.description || 'No description.'}
                          </p>
                        </div>
                      </div>

                      <div>
                        <p className="text-sm font-black text-[#11100b]">
                          {service.hotelName}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[10px] font-black uppercase text-neutral-600">
                            {service.category}
                          </span>
                          <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[10px] font-black text-neutral-600">
                            {service.iconKey}
                          </span>
                        </div>
                      </div>

                      <span
                        className={`w-fit rounded-full px-3 py-1.5 text-[11px] font-black ${getBillingBadgeClass(
                          service
                        )}`}
                      >
                        {getBillingLabel(service)}
                      </span>

                      <span
                        className={
                          service.isActive
                            ? 'w-fit rounded-full bg-emerald-100 px-3 py-1.5 text-[11px] font-black text-emerald-700'
                            : 'w-fit rounded-full bg-neutral-100 px-3 py-1.5 text-[11px] font-black text-neutral-500'
                        }
                      >
                        {service.isActive ? 'ACTIVE' : 'HIDDEN'}
                      </span>

                      <p className="text-sm font-black text-neutral-700">
                        {service.sortOrder}
                      </p>

                      <div className="grid gap-2 sm:grid-cols-2 xl:justify-end">
                        <button
                          type="button"
                          onClick={() => setEditingService(service)}
                          className="h-10 rounded-2xl border border-neutral-200 text-sm font-black text-neutral-700 transition hover:bg-neutral-50"
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          disabled={pendingAction === `delete:${service.id}` || isPending}
                          onClick={() => setDeleteService(service)}
                          className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-2xl bg-red-600 text-sm font-black text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {pendingAction === `delete:${service.id}` ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4" />
                          )}
                          {pendingAction === `delete:${service.id}` ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}

            {!filteredServices.length ? (
              <div className="rounded-[1.75rem] border border-dashed border-neutral-300 bg-neutral-50 p-10 text-center">
                <p className="text-lg font-black text-[#11100b]">
                  No matching services found.
                </p>
                <p className="mt-2 text-sm font-semibold text-neutral-500">
                  Adjust the search or filters, create a new service, or run the default setup.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {creatingService ? (
       <CreateServiceModal
            hotels={hotels}
            defaultHotelId={defaultHotelId}
            canChangeHotel={canChangeHotel}
            onClose={() => setCreatingService(false)}
            action={handleCreateService}
          />
      ) : null}

      {editingService ? (
        <EditServiceModal
              service={editingService}
              onClose={() => setEditingService(null)}
              action={handleUpdateService}
            />
      ) : null}

      {deleteService ? (
  <div className="fixed inset-0 z-[140] flex items-start justify-center overflow-y-auto overscroll-contain bg-black/55 px-3 py-3 backdrop-blur-sm sm:items-center sm:p-4">
    <div role="alertdialog" aria-modal="true" className="max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-[1.5rem] border border-neutral-200 bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:rounded-[2rem]">
      <div className="border-b border-red-100 bg-red-50 p-4 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-red-100 text-red-700">
            <Trash2 className="size-5" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-xl font-black text-neutral-950">
              Delete Service Item?
            </p>

            <p className="mt-2 text-sm font-semibold leading-6 text-neutral-600">
              This will remove <b>{deleteService.name}</b> from the services
              module and guest portal catalog.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setDeleteService(null)}
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
            Selected Service
          </p>

          <p className="mt-2 truncate text-lg font-black text-neutral-950">
            {deleteService.name}
          </p>

          <p className="mt-1 truncate text-sm font-bold text-neutral-500">
            {deleteService.code} · {deleteService.category}
          </p>
        </div>

        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setDeleteService(null)}
            className="h-11 rounded-2xl border border-neutral-200 bg-white text-sm font-black text-neutral-700 transition hover:bg-neutral-100"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleDeleteServiceConfirm}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-red-600 text-sm font-black text-white transition hover:bg-red-700"
          >
            <Trash2 className="size-4" />
            Delete
          </button>
        </div>
      </div>
    </div>
  </div>
) : null}

    </>
  );
}