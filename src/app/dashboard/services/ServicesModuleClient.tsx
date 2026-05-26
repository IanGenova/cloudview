'use client';

import { useMemo, useState } from 'react';
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
}: {
  hotels: HotelOption[];
  defaultHotelId: string;
  canChangeHotel: boolean;
  onClose: () => void;
}) {
  return (
    <Modal
      title="Create Service / Add-on"
      description="Add a service or paid room add-on that guests can request from the Guest Portal."
      onClose={onClose}
    >
      <form action={createServiceCatalogItemAction} className="space-y-4">
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
}: {
  service: ServiceItem;
  onClose: () => void;
}) {
  return (
    <Modal
      title="Edit Service Item"
      description="Update how this service appears in the Guest Portal."
      onClose={onClose}
    >
      <form action={updateServiceCatalogItemAction} className="space-y-4">
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
  const [creatingService, setCreatingService] = useState(false);
  const [editingService, setEditingService] = useState<ServiceItem | null>(
    null
  );

  const groupedServices = useMemo(() => {
    const groups = new Map<string, ServiceItem[]>();

    for (const service of services) {
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
  }, [services, canChangeHotel]);

  return (
    <>
      {message ? (
        <div
          className={
            message.type === 'success'
              ? 'mb-5 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700'
              : 'mb-5 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700'
          }
        >
          {message.text}
        </div>
      ) : null}

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

            <form action={seedDefaultServicesAction} className="mt-5 space-y-4">
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

              <Button className="w-full">Add Default Services</Button>
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
                {services.length} item{services.length === 1 ? '' : 's'}
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

                          <form action={deleteServiceCatalogItemAction}>
                            <input
                              type="hidden"
                              name="itemId"
                              value={service.id}
                            />
                            <button
                              type="submit"
                              className="h-10 w-full rounded-2xl bg-red-600 text-sm font-black text-white hover:bg-red-700"
                            >
                              Delete
                            </button>
                          </form>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}

              {!services.length ? (
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
        />
      ) : null}

      {editingService ? (
        <EditServiceModal
          service={editingService}
          onClose={() => setEditingService(null)}
        />
      ) : null}
    </>
  );
}