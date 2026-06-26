'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2, Trash2, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
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
    </div>
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
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl">
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

  const groupedServices = useMemo(() => {
    const groups = new Map<string, ServiceItem[]>();

    for (const service of localServices) {
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
  }, [localServices, canChangeHotel]);

  return (
    <>
      <FloatingToast toast={toast} onClose={() => setToast(null)} />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-xl font-black">Services & Room Add-ons</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Create, edit, hide, or delete the items shown in the Guest Portal.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setCreatingService(true)}
          className="h-11 rounded-2xl bg-black px-5 text-sm font-black text-white hover:bg-neutral-800"
        >
          Create Service / Add-on
        </button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
        <Card>
          <CardContent>
            <h2 className="text-xl font-black">Default Setup</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Add the recommended default hotel services and add-ons.
            </p>

            <form action={handleSeedDefaultServices} className="mt-5 space-y-4">
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

              <Button className="w-full" disabled={pendingAction === 'seed' || isPending}>
                {pendingAction === 'seed' ? 'Adding...' : 'Add Default Services'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black">Existing Services</h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Small-card view of services used dynamically by the Guest
                  Portal.
                </p>
              </div>

              <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-black text-neutral-700">
                {localServices.length} item{localServices.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="mt-5 space-y-6">
              {groupedServices.map((group) => (
                <section key={group.groupName}>
                  <h3 className="mb-3 text-sm font-black uppercase tracking-wide text-neutral-500">
                    {group.groupName}
                  </h3>

                  <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                    {group.items.map((service) => (
                      <div
                        key={service.id}
                        className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-base font-black text-neutral-950">
                              {service.name}
                            </p>

                            <p className="mt-1 truncate text-xs font-bold text-neutral-500">
                              {service.code}
                            </p>
                          </div>

                          <span
                            className={
                              service.isActive
                                ? 'shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black text-emerald-700'
                                : 'shrink-0 rounded-full bg-neutral-100 px-2.5 py-1 text-[10px] font-black text-neutral-500'
                            }
                          >
                            {service.isActive ? 'ACTIVE' : 'HIDDEN'}
                          </span>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <span
                            className={`rounded-full px-2.5 py-1 text-[10px] font-black ${getBillingBadgeClass(
                              service
                            )}`}
                          >
                            {getBillingLabel(service)}
                          </span>

                          <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[10px] font-black text-neutral-600">
                            {service.iconKey}
                          </span>

                          <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[10px] font-black text-neutral-600">
                            Sort {service.sortOrder}
                          </span>
                        </div>

                        {service.description ? (
                          <p className="mt-3 line-clamp-2 text-xs font-medium leading-relaxed text-neutral-500">
                            {service.description}
                          </p>
                        ) : (
                          <p className="mt-3 text-xs font-medium text-neutral-400">
                            No description.
                          </p>
                        )}

                        <div className="mt-4 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingService(service)}
                            className="h-10 rounded-2xl border border-neutral-200 text-sm font-black text-neutral-700 hover:bg-neutral-50"
                          >
                            Edit
                          </button>

                          <button
                              type="button"
                              disabled={pendingAction === `delete:${service.id}` || isPending}
                              onClick={() => setDeleteService(service)}
                              className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-2xl bg-red-600 text-sm font-black text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
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

              {!localServices.length ? (
                <div className="rounded-3xl border border-dashed border-neutral-300 p-8 text-center">
                  <p className="font-black">No services yet.</p>
                  <p className="mt-1 text-sm text-neutral-500">
                    Create a service item or use the default setup button.
                  </p>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>

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
  <div className="fixed inset-0 z-[140] grid place-items-center bg-black/55 p-4 backdrop-blur-sm">
    <div className="w-full max-w-md overflow-hidden rounded-[2rem] border border-neutral-200 bg-white shadow-2xl">
      <div className="border-b border-red-100 bg-red-50 p-6">
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

      <div className="p-6">
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