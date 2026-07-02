'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Loader2, X } from 'lucide-react';
import {
  MenuAvailabilityMovementType,
  MenuProductType,
  ServiceAvailabilityMovementType,
  ServiceBillingMode,
} from '@prisma/client';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import {
  controlMenuStockAction,
  controlServiceStockAction,
  disableServiceInventoryAction,
  enableServiceInventoryAction,
  initializeMenuStocksAction,
  initializeServiceStocksAction,
} from './actions';

type InventoryTab = 'menu' | 'services';

type BundleComponent = {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  isMenuActive: boolean;
  availableQty: number;
  soldQty: number;
  isSoldOut: boolean;
  canSellQty: number;
  updatedAt: string | Date | null;
};

type MenuItem = {
  id: string;
  hotelId: string;
  hotelName: string;
  name: string;
  productType: MenuProductType;
  isBundle: boolean;
  isDerivedStock: boolean;
  isMenuActive: boolean;
  stockId: string | null;
  availableQty: number;
  soldQty: number;
  isSoldOut: boolean;
  notes: string;
  updatedAt: string | Date | null;
  bundleComponents: BundleComponent[];
  limitingComponentName: string | null;
};

type ServiceItem = {
  id: string;
  hotelId: string;
  hotelName: string;
  code: string;
  name: string;
  category: string;
  description: string;
  iconKey: string;
  billingMode: ServiceBillingMode;
  unitPrice: number;
  unitLabel: string;
  isActive: boolean;
  inventoryTracked: boolean;
  stockId: string | null;
  availableQty: number;
  usedQty: number;
  isSoldOut: boolean;
  notes: string;
  updatedAt: string | Date | null;
};

type MenuMovement = {
  id: string;
  hotelName: string;
  productName: string;
  type: MenuAvailabilityMovementType;
  quantity: number;
  balanceAfter: number;
  reason: string;
  createdAt: string;
};

type ServiceMovement = {
  id: string;
  hotelName: string;
  serviceName: string;
  serviceCategory: string;
  type: ServiceAvailabilityMovementType;
  quantity: number;
  balanceAfter: number;
  reason: string;
  createdAt: string;
};

type Message =
  | {
      type: 'success' | 'error';
      text: string;
    }
  | null;

type InventoryServerAction = (formData: FormData) => Promise<unknown>;

type InventoryFormAction = (formData: FormData) => void | Promise<void>;

function getInventoryActionError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Something went wrong. Please try again.';
}

const INVENTORY_TOAST_STORAGE_KEY = 'cloudview-inventory-toast';

function isInventoryToast(value: unknown): value is Exclude<Message, null> {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const toast = value as { type?: unknown; text?: unknown };

  return (
    (toast.type === 'success' || toast.type === 'error') &&
    typeof toast.text === 'string' &&
    toast.text.trim().length > 0
  );
}

function readQueuedInventoryToast() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const rawToast = window.sessionStorage.getItem(INVENTORY_TOAST_STORAGE_KEY);

    if (!rawToast) {
      return null;
    }

    window.sessionStorage.removeItem(INVENTORY_TOAST_STORAGE_KEY);

    const parsedToast = JSON.parse(rawToast);

    return isInventoryToast(parsedToast) ? parsedToast : null;
  } catch {
    return null;
  }
}

function queueInventoryToast(toast: Exclude<Message, null>) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(
      INVENTORY_TOAST_STORAGE_KEY,
      JSON.stringify(toast)
    );
  } catch {
    // Ignore storage failures. The in-memory toast still works.
  }
}

function clearQueuedInventoryToast() {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.removeItem(INVENTORY_TOAST_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

type MenuSummary = {
  totalMenuItems: number;
  activeMenuItems: number;
  availableItems: number;
  soldOutItems: number;
  totalAvailableQty: number;
  totalSoldQty: number;
};

type ServiceSummary = {
  totalServices: number;
  activeServices: number;
  trackedServices: number;
  serviceAvailableItems: number;
  serviceSoldOutItems: number;
  serviceTotalAvailableQty: number;
  serviceTotalUsedQty: number;
};

type MenuFilterValue =
  | 'ALL'
  | 'AVAILABLE'
  | 'SOLD_OUT'
  | 'NOT_SET'
  | 'MENU_HIDDEN'
  | 'BUNDLE';

type ServiceFilterValue =
  | 'ALL'
  | 'TRACKED'
  | 'UNTRACKED'
  | 'AVAILABLE'
  | 'SOLD_OUT'
  | 'HIDDEN';


function Toast({
  message,
  onClose,
}: {
  message?: Message;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!message) {
      return;
    }

    const timeout = window.setTimeout(() => {
      onClose();
    }, 4500);

    return () => window.clearTimeout(timeout);
  }, [message?.text, message?.type]);

  if (!message) {
    return null;
  }

  return (
    <div className="fixed right-6 top-24 z-[9999] w-[calc(100vw-3rem)] max-w-md">
      <div
        className={
          message.type === 'success'
            ? 'flex items-start gap-3 rounded-3xl border border-emerald-200 bg-emerald-50/95 p-4 text-emerald-800 shadow-2xl backdrop-blur-xl'
            : 'flex items-start gap-3 rounded-3xl border border-red-200 bg-red-50/95 p-4 text-red-800 shadow-2xl backdrop-blur-xl'
        }
      >
        <div
          className={
            message.type === 'success'
              ? 'grid size-9 shrink-0 place-items-center rounded-full bg-emerald-600 text-white'
              : 'grid size-9 shrink-0 place-items-center rounded-full bg-red-600 text-white'
          }
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="size-5" />
          ) : (
            <X className="size-5" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-black">
            {message.type === 'success' ? 'Success' : 'Action failed'}
          </p>
          <p className="mt-1 text-sm font-bold leading-6">{message.text}</p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="grid size-8 shrink-0 place-items-center rounded-full bg-white/70 hover:bg-white"
          aria-label="Close notification"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

function formatDateTime(value: string | Date | null) {
  if (!value) {
    return 'Not updated yet';
  }

  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function money(value: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(value);
}

function getMenuStatusLabel(item: MenuItem) {
  if (!item.isMenuActive) {
    return 'MENU HIDDEN';
  }

  if (item.isDerivedStock && item.bundleComponents.length === 0) {
    return 'NOT SET';
  }

  if (!item.isDerivedStock && !item.stockId) {
    return 'NOT SET';
  }

  if (item.isSoldOut || item.availableQty <= 0) {
    return 'SOLD OUT';
  }

  return 'AVAILABLE';
}

function getServiceStatusLabel(item: ServiceItem) {
  if (!item.isActive) {
    return 'HIDDEN';
  }

  if (!item.inventoryTracked) {
    return 'NOT TRACKED';
  }

  if (!item.stockId) {
    return 'NOT SET';
  }

  if (item.isSoldOut || item.availableQty <= 0) {
    return 'SOLD OUT';
  }

  return 'AVAILABLE';
}

function getStatusClass(status: string) {
  if (status === 'AVAILABLE') {
    return 'bg-emerald-100 text-emerald-700';
  }

  if (status === 'SOLD OUT') {
    return 'bg-red-100 text-red-700';
  }

  if (status === 'MENU HIDDEN' || status === 'HIDDEN') {
    return 'bg-neutral-200 text-neutral-600';
  }

  if (status === 'NOT TRACKED') {
    return 'bg-blue-100 text-blue-700';
  }

  return 'bg-amber-100 text-amber-700';
}

function getProductTypeLabel(item: MenuItem) {
  return item.isDerivedStock ? 'Bundle / Derived Stock' : 'Single Item Stock';
}

function getProductTypeClass(item: MenuItem) {
  return item.isDerivedStock
    ? 'bg-amber-100 text-amber-800'
    : 'bg-neutral-100 text-neutral-600';
}

function getBillingLabel(value: ServiceBillingMode) {
  if (value === ServiceBillingMode.FREE) {
    return 'Free';
  }

  if (value === ServiceBillingMode.FIXED_PRICE) {
    return 'Paid Add-on';
  }

  return 'Confirm Price';
}

function getBillingClass(value: ServiceBillingMode) {
  if (value === ServiceBillingMode.FREE) {
    return 'bg-emerald-100 text-emerald-700';
  }

  if (value === ServiceBillingMode.FIXED_PRICE) {
    return 'bg-amber-100 text-amber-800';
  }

  return 'bg-blue-100 text-blue-700';
}

function Modal({
  title,
  description,
  children,
  onClose,
  maxWidth = 'max-w-xl',
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  onClose: () => void;
  maxWidth?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4">
      <div
        className={`max-h-[90vh] w-full ${maxWidth} overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl`}
      >
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
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  strong,
  small,
}: {
  label: string;
  value: string | number;
  strong?: boolean;
  small?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-neutral-50 p-3">
      <p className="text-[10px] font-black uppercase text-neutral-400">
        {label}
      </p>
      <p
        className={
          small
            ? 'mt-1 text-sm font-black text-neutral-700'
            : strong
              ? 'mt-1 text-lg font-black text-neutral-950'
              : 'mt-1 text-lg font-bold text-neutral-700'
        }
      >
        {value}
      </p>
    </div>
  );
}

function MovementMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl bg-neutral-50 p-3">
      <p className="text-[10px] font-black uppercase text-neutral-400">
        {label}
      </p>
      <p className="mt-1 text-sm font-black text-neutral-800">{value}</p>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'green' | 'red' | 'blue';
}) {
  return (
    <div
      className={
        tone === 'green'
          ? 'rounded-3xl border border-emerald-200 bg-emerald-50 p-5'
          : tone === 'red'
            ? 'rounded-3xl border border-red-200 bg-red-50 p-5'
            : tone === 'blue'
              ? 'rounded-3xl border border-blue-200 bg-blue-50 p-5'
              : 'rounded-3xl border border-neutral-200 bg-white p-5'
      }
    >
      <p
        className={
          tone === 'green'
            ? 'text-sm font-bold text-emerald-700'
            : tone === 'red'
              ? 'text-sm font-bold text-red-700'
              : tone === 'blue'
                ? 'text-sm font-bold text-blue-700'
                : 'text-sm font-bold text-neutral-500'
        }
      >
        {label}
      </p>
      <p className="mt-2 text-3xl font-black">{value}</p>
    </div>
  );
}

function BundleDerivedStockModal({
  item,
  onClose,
}: {
  item: MenuItem;
  onClose: () => void;
}) {
  return (
    <Modal
      title="Bundle Derived Stock"
      description="Bundle stock is calculated from component menu item stock."
      onClose={onClose}
      maxWidth="max-w-3xl"
    >
      <div className="mb-5 rounded-3xl bg-amber-50 p-4">
        <p className="text-xs font-black uppercase text-amber-700">
          Bundle Menu Item
        </p>
        <h3 className="mt-1 text-xl font-black text-neutral-950">
          {item.name}
        </h3>
        <p className="mt-1 text-sm font-semibold text-amber-800">
          {item.hotelName}
        </p>

        <div className="mt-4 grid gap-2 text-center md:grid-cols-4">
          <Metric label="Can Sell" value={item.availableQty} strong />
          <Metric label="Sold" value={item.soldQty} />
          <Metric label="Status" value={getMenuStatusLabel(item)} small />
          <Metric
            label="Limiting Item"
            value={item.limitingComponentName || 'None'}
            small
          />
        </div>
      </div>

      <div className="rounded-3xl border border-amber-200 bg-white p-4">
        <p className="font-black text-neutral-950">Bundle Components</p>
        <p className="mt-1 text-sm text-neutral-500">
          Each bundle sold deducts stock from these component items.
        </p>

        <div className="mt-4 space-y-3">
          {item.bundleComponents.map((component) => (
            <div
              key={component.id}
              className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-black text-neutral-950">
                    {component.name}
                  </p>
                  <p className="mt-1 text-sm text-neutral-500">
                    Requires {component.quantity} per bundle
                  </p>
                </div>

                <span
                  className={
                    component.isSoldOut
                      ? 'rounded-full bg-red-100 px-3 py-1 text-xs font-black text-red-700'
                      : 'rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700'
                  }
                >
                  {component.isSoldOut ? 'Limiting / Sold Out' : 'Available'}
                </span>
              </div>

              <div className="mt-3 grid gap-2 text-center md:grid-cols-4">
                <Metric
                  label="Available"
                  value={component.availableQty}
                  strong
                />
                <Metric label="Sold" value={component.soldQty} />
                <Metric label="Can Support" value={component.canSellQty} />
                <Metric
                  label="Updated"
                  value={component.updatedAt ? 'Yes' : 'No'}
                  small
                />
              </div>
            </div>
          ))}

          {!item.bundleComponents.length ? (
            <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-6 text-center">
              <p className="font-black text-amber-900">
                No bundle components yet.
              </p>
              <p className="mt-1 text-sm text-amber-800">
                Add components in Menu Management before this bundle can be
                sold.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

function ControlMenuStockModal({
  item,
  onClose,
  action,
  pending,
}: {
  item: MenuItem;
  onClose: () => void;
  action: InventoryFormAction;
  pending?: boolean;
}) {
  if (item.isDerivedStock) {
    return <BundleDerivedStockModal item={item} onClose={onClose} />;
  }

  return (
    <Modal
      title="Control Menu Stock"
      description="Set, add, remove, sell out, or reopen this menu item."
      onClose={onClose}
    >
      <div className="mb-5 rounded-3xl bg-neutral-50 p-4">
        <p className="text-xs font-black uppercase text-neutral-400">
          Menu Item
        </p>
        <h3 className="mt-1 text-xl font-black">{item.name}</h3>
        <p className="mt-1 text-sm text-neutral-500">{item.hotelName}</p>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Metric label="Available" value={item.availableQty} strong />
          <Metric label="Sold" value={item.soldQty} />
          <Metric label="Status" value={getMenuStatusLabel(item)} small />
        </div>
      </div>

      <form action={action} className="space-y-4">
        <input type="hidden" name="productId" value={item.id} />

        <div>
          <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
            Stock Operation
          </label>
          <Select
            name="operation"
            defaultValue={MenuAvailabilityMovementType.SET_STOCK}
          >
            <option value={MenuAvailabilityMovementType.SET_STOCK}>
              Set exact available stock
            </option>
            <option value={MenuAvailabilityMovementType.ADD_STOCK}>
              Add stock
            </option>
            <option value={MenuAvailabilityMovementType.REMOVE_STOCK}>
              Remove stock
            </option>
            <option value={MenuAvailabilityMovementType.SOLD_OUT}>
              Mark as sold out
            </option>
            <option value={MenuAvailabilityMovementType.REOPEN}>
              Reopen and add stock
            </option>
          </Select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
            Quantity
          </label>
          <Input
            name="quantity"
            type="number"
            min="0"
            step="1"
            placeholder="Example: 25"
          />
          <p className="mt-1 text-xs text-neutral-500">
            For “Sold Out,” quantity can be left blank.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
            Reason / Note for Movement
          </label>
          <Input
            name="reason"
            placeholder="Example: Added 20 servings for dinner"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
            Internal Stock Note
          </label>
          <Input
            name="notes"
            defaultValue={item.notes}
            placeholder="Optional note visible to staff"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-2xl border border-neutral-200 px-5 text-sm font-black hover:bg-neutral-50"
          >
            Cancel
          </button>

          <Button disabled={pending}>{pending ? 'Saving...' : 'Save Stock Control'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function ControlServiceStockModal({
  item,
  onClose,
  action,
  pending,
}: {
  item: ServiceItem;
  onClose: () => void;
  action: InventoryFormAction;
  pending?: boolean;
}) {
  return (
    <Modal
      title="Control Service Inventory"
      description="Set, add, remove, sell out, or reopen inventory for this service request item."
      onClose={onClose}
    >
      <div className="mb-5 rounded-3xl bg-neutral-50 p-4">
        <p className="text-xs font-black uppercase text-neutral-400">
          Service Item
        </p>
        <h3 className="mt-1 text-xl font-black">{item.name}</h3>
        <p className="mt-1 text-sm text-neutral-500">
          {item.hotelName} · {item.category}
        </p>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Metric label="Available" value={item.availableQty} strong />
          <Metric label="Used" value={item.usedQty} />
          <Metric label="Status" value={getServiceStatusLabel(item)} small />
        </div>
      </div>

      <form action={action} className="space-y-4">
        <input type="hidden" name="serviceId" value={item.id} />

        <div>
          <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
            Stock Operation
          </label>
          <Select
            name="operation"
            defaultValue={ServiceAvailabilityMovementType.SET_STOCK}
          >
            <option value={ServiceAvailabilityMovementType.SET_STOCK}>
              Set exact available stock
            </option>
            <option value={ServiceAvailabilityMovementType.ADD_STOCK}>
              Add stock
            </option>
            <option value={ServiceAvailabilityMovementType.REMOVE_STOCK}>
              Remove stock
            </option>
            <option value={ServiceAvailabilityMovementType.SOLD_OUT}>
              Mark as sold out
            </option>
            <option value={ServiceAvailabilityMovementType.REOPEN}>
              Reopen and add stock
            </option>
          </Select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
            Quantity
          </label>
          <Input
            name="quantity"
            type="number"
            min="0"
            step="1"
            placeholder="Example: 10"
          />
          <p className="mt-1 text-xs text-neutral-500">
            For “Sold Out,” quantity can be left blank.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
            Reason / Note for Movement
          </label>
          <Input
            name="reason"
            placeholder="Example: Added 10 extra towels"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
            Internal Stock Note
          </label>
          <Input
            name="notes"
            defaultValue={item.notes}
            placeholder="Optional note visible to staff"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-2xl border border-neutral-200 px-5 text-sm font-black hover:bg-neutral-50"
          >
            Cancel
          </button>

          <Button disabled={pending}>{pending ? 'Saving...' : 'Save Service Stock'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function MovementCard({
  title,
  subtitle,
  quantity,
  balanceAfter,
  createdAt,
  reason,
}: {
  title: string;
  subtitle: string;
  quantity: number;
  balanceAfter: number;
  createdAt: string;
  reason: string;
}) {
  return (
    <div className="rounded-3xl border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-black">{title}</p>
          <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>
        </div>

        <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-black text-neutral-700">
          Balance: {balanceAfter}
        </span>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <MovementMetric label="Quantity" value={quantity} />
        <MovementMetric label="Balance After" value={balanceAfter} />
        <MovementMetric label="Created" value={formatDateTime(createdAt)} />
      </div>

      {reason ? (
        <p className="mt-3 rounded-2xl bg-neutral-50 p-3 text-sm text-neutral-600">
          {reason}
        </p>
      ) : null}
    </div>
  );
}

function EmptyMovementState() {
  return (
    <div className="rounded-3xl border border-dashed border-neutral-300 p-8 text-center">
      <p className="font-black">No movements yet.</p>
      <p className="mt-1 text-sm text-neutral-500">
        Stock changes will appear here.
      </p>
    </div>
  );
}

function MenuMovementsModal({
  movements,
  onClose,
}: {
  movements: MenuMovement[];
  onClose: () => void;
}) {
  return (
    <Modal
      title="Recent Menu Stock Movements"
      description="Audit trail of menu stock changes."
      onClose={onClose}
      maxWidth="max-w-3xl"
    >
      <div className="space-y-3">
        {movements.map((movement) => (
          <MovementCard
            key={movement.id}
            title={movement.type.replaceAll('_', ' ')}
            subtitle={`${movement.hotelName} · ${movement.productName}`}
            quantity={movement.quantity}
            balanceAfter={movement.balanceAfter}
            createdAt={movement.createdAt}
            reason={movement.reason}
          />
        ))}

        {!movements.length ? <EmptyMovementState /> : null}
      </div>
    </Modal>
  );
}

function ServiceMovementsModal({
  movements,
  onClose,
}: {
  movements: ServiceMovement[];
  onClose: () => void;
}) {
  return (
    <Modal
      title="Recent Service Inventory Movements"
      description="Audit trail of service request inventory changes."
      onClose={onClose}
      maxWidth="max-w-3xl"
    >
      <div className="space-y-3">
        {movements.map((movement) => (
          <MovementCard
            key={movement.id}
            title={movement.type.replaceAll('_', ' ')}
            subtitle={`${movement.hotelName} · ${movement.serviceCategory} · ${movement.serviceName}`}
            quantity={movement.quantity}
            balanceAfter={movement.balanceAfter}
            createdAt={movement.createdAt}
            reason={movement.reason}
          />
        ))}

        {!movements.length ? <EmptyMovementState /> : null}
      </div>
    </Modal>
  );
}

export function InventoryClient({
  initialTab,
  menuItems,
  menuMovements,
  serviceItems,
  serviceMovements,
  message,
  menuSummary,
  serviceSummary,
}: {
  initialTab: InventoryTab;
  menuItems: MenuItem[];
  menuMovements: MenuMovement[];
  serviceItems: ServiceItem[];
  serviceMovements: ServiceMovement[];
  message: Message;
  menuSummary: MenuSummary;
  serviceSummary: ServiceSummary;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeTab = initialTab;

  const [localMenuItems, setLocalMenuItems] = useState<MenuItem[]>(menuItems);
  const [localServiceItems, setLocalServiceItems] =
    useState<ServiceItem[]>(serviceItems);
  const [clientToast, setClientToast] = useState<Message>(() => {
    if (typeof window === 'undefined') {
      return message;
    }

    return readQueuedInventoryToast() ?? message;
  });
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const [menuSearch, setMenuSearch] = useState('');
  const [menuFilter, setMenuFilter] = useState<MenuFilterValue>('ALL');
  const [controllingMenuItem, setControllingMenuItem] =
    useState<MenuItem | null>(null);
  const [showMenuMovements, setShowMenuMovements] = useState(false);

  const [serviceSearch, setServiceSearch] = useState('');
  const [serviceFilter, setServiceFilter] =
    useState<ServiceFilterValue>('ALL');
  const [controllingServiceItem, setControllingServiceItem] =
    useState<ServiceItem | null>(null);
  const [showServiceMovements, setShowServiceMovements] = useState(false);

  useEffect(() => {
    setLocalMenuItems(menuItems);
  }, [menuItems]);

  useEffect(() => {
    setLocalServiceItems(serviceItems);
  }, [serviceItems]);

  useEffect(() => {
    const queuedToast = readQueuedInventoryToast();

    if (queuedToast) {
      setClientToast(queuedToast);
    }
  }, []);

  useEffect(() => {
    if (!message) {
      return;
    }

    setClientToast(message);

    const params = new URLSearchParams(searchParams.toString());
    const hadMessageParam = params.has('success') || params.has('error');

    params.delete('success');
    params.delete('error');

    if (hadMessageParam) {
      router.replace(
        params.toString() ? `${pathname}?${params.toString()}` : pathname,
        { scroll: false }
      );
    }
  }, [message, pathname, router, searchParams]);

  function runInventoryAction({
    formData,
    action,
    successText,
    pendingKey,
    optimisticMenuUpdate,
    optimisticServiceUpdate,
    onSuccess,
  }: {
    formData: FormData;
    action: InventoryServerAction;
    successText: string;
    pendingKey: string;
    optimisticMenuUpdate?: (items: MenuItem[]) => MenuItem[];
    optimisticServiceUpdate?: (items: ServiceItem[]) => ServiceItem[];
    onSuccess?: () => void;
  }) {
    if (pendingAction) {
      return;
    }

    const previousMenuItems = localMenuItems;
    const previousServiceItems = localServiceItems;

    setClientToast(null);
    setPendingAction(pendingKey);

    if (optimisticMenuUpdate) {
      setLocalMenuItems((items) => optimisticMenuUpdate(items));
    }

    if (optimisticServiceUpdate) {
      setLocalServiceItems((items) => optimisticServiceUpdate(items));
    }

    startTransition(() => {
      void (async () => {
        try {
          await action(formData);

          onSuccess?.();

          const successToast = {
            type: 'success',
            text: successText,
          } as const;

          setClientToast(successToast);
          queueInventoryToast(successToast);

          router.refresh();
        } catch (error) {
          setLocalMenuItems(previousMenuItems);
          setLocalServiceItems(previousServiceItems);

          setClientToast({
            type: 'error',
            text: getInventoryActionError(error),
          });
        } finally {
          setPendingAction(null);
        }
      })();
    });
  }

  function handleInitializeMenuStocks(formData: FormData) {
    runInventoryAction({
      formData,
      action: initializeMenuStocksAction,
      successText: 'Missing menu stocks were initialized.',
      pendingKey: 'initialize-menu',
    });
  }

  function handleInitializeServiceStocks(formData: FormData) {
    runInventoryAction({
      formData,
      action: initializeServiceStocksAction,
      successText: 'Missing service stocks were initialized.',
      pendingKey: 'initialize-services',
    });
  }

  function handleControlMenuStock(formData: FormData) {
    const productId = String(formData.get('productId') || '');

    runInventoryAction({
      formData,
      action: controlMenuStockAction,
      successText: 'Menu stock was updated successfully.',
      pendingKey: `control-menu:${productId}`,
      onSuccess: () => setControllingMenuItem(null),
    });
  }

  function handleControlServiceStock(formData: FormData) {
    const serviceId = String(formData.get('serviceId') || '');

    runInventoryAction({
      formData,
      action: controlServiceStockAction,
      successText: 'Service inventory was updated successfully.',
      pendingKey: `control-service:${serviceId}`,
      onSuccess: () => setControllingServiceItem(null),
    });
  }

  function handleDisableServiceInventory(formData: FormData) {
    const serviceId = String(formData.get('serviceId') || '');

    runInventoryAction({
      formData,
      action: disableServiceInventoryAction,
      successText: 'Service inventory tracking was disabled.',
      pendingKey: `disable-service:${serviceId}`,
      optimisticServiceUpdate: (items) =>
        items.map((item) =>
          item.id === serviceId
            ? {
                ...item,
                inventoryTracked: false,
                stockId: null,
                availableQty: 0,
                usedQty: 0,
                isSoldOut: false,
                updatedAt: new Date().toISOString(),
              }
            : item
        ),
    });
  }

  function handleEnableServiceInventory(formData: FormData) {
    const serviceId = String(formData.get('serviceId') || '');

    runInventoryAction({
      formData,
      action: enableServiceInventoryAction,
      successText: 'Service inventory tracking was enabled.',
      pendingKey: `enable-service:${serviceId}`,
      optimisticServiceUpdate: (items) =>
        items.map((item) =>
          item.id === serviceId
            ? {
                ...item,
                inventoryTracked: true,
                isSoldOut: false,
                updatedAt: new Date().toISOString(),
              }
            : item
        ),
    });
  }

  const filteredMenuItems = useMemo(() => {
    const searchText = menuSearch.trim().toLowerCase();

    return localMenuItems.filter((item) => {
      const matchesSearch =
        !searchText ||
        item.name.toLowerCase().includes(searchText) ||
        item.hotelName.toLowerCase().includes(searchText) ||
        item.bundleComponents.some((component) =>
          component.name.toLowerCase().includes(searchText)
        ) ||
        String(item.limitingComponentName || '')
          .toLowerCase()
          .includes(searchText);

      const status = getMenuStatusLabel(item);

      const matchesFilter =
        menuFilter === 'ALL' ||
        (menuFilter === 'AVAILABLE' && status === 'AVAILABLE') ||
        (menuFilter === 'SOLD_OUT' && status === 'SOLD OUT') ||
        (menuFilter === 'NOT_SET' && status === 'NOT SET') ||
        (menuFilter === 'MENU_HIDDEN' && status === 'MENU HIDDEN') ||
        (menuFilter === 'BUNDLE' && item.isDerivedStock);

      return matchesSearch && matchesFilter;
    });
  }, [localMenuItems, menuSearch, menuFilter]);

  const filteredServiceItems = useMemo(() => {
    const searchText = serviceSearch.trim().toLowerCase();

    return localServiceItems.filter((item) => {
      const matchesSearch =
        !searchText ||
        item.name.toLowerCase().includes(searchText) ||
        item.hotelName.toLowerCase().includes(searchText) ||
        item.category.toLowerCase().includes(searchText) ||
        item.description.toLowerCase().includes(searchText) ||
        item.code.toLowerCase().includes(searchText);

      const status = getServiceStatusLabel(item);

      const matchesFilter =
        serviceFilter === 'ALL' ||
        (serviceFilter === 'TRACKED' && item.inventoryTracked) ||
        (serviceFilter === 'UNTRACKED' && !item.inventoryTracked) ||
        (serviceFilter === 'AVAILABLE' && status === 'AVAILABLE') ||
        (serviceFilter === 'SOLD_OUT' && status === 'SOLD OUT') ||
        (serviceFilter === 'HIDDEN' && status === 'HIDDEN');

      return matchesSearch && matchesFilter;
    });
  }, [localServiceItems, serviceFilter, serviceSearch]);

  return (
    <>
      <Toast
        message={clientToast}
        onClose={() => {
          clearQueuedInventoryToast();
          setClientToast(null);
        }}
      />

      <div className="mb-6 flex flex-col gap-3 rounded-[2rem] border border-neutral-200 bg-white p-3 shadow-sm md:flex-row">
        <Link
          href="/dashboard/inventory?tab=menu"
          replace
          scroll={false}
          className={
            activeTab === 'menu'
              ? 'inline-flex h-12 flex-1 items-center justify-center rounded-2xl bg-black px-5 text-sm font-black text-white'
              : 'inline-flex h-12 flex-1 items-center justify-center rounded-2xl border border-neutral-200 bg-white px-5 text-sm font-black text-neutral-700 hover:bg-neutral-50'
          }
        >
          Food Menu Inventory
        </Link>

        <Link
          href="/dashboard/inventory?tab=services"
          replace
          scroll={false}
          className={
            activeTab === 'services'
              ? 'inline-flex h-12 flex-1 items-center justify-center rounded-2xl bg-black px-5 text-sm font-black text-white'
              : 'inline-flex h-12 flex-1 items-center justify-center rounded-2xl border border-neutral-200 bg-white px-5 text-sm font-black text-neutral-700 hover:bg-neutral-50'
          }
        >
          Service Request Inventory
        </Link>
      </div>

      {activeTab === 'menu' ? (
        <>
          <div className="mb-6 grid gap-3 md:grid-cols-6">
            <SummaryCard label="Total Menu" value={menuSummary.totalMenuItems} />
            <SummaryCard
              label="Active Menu"
              value={menuSummary.activeMenuItems}
            />
            <SummaryCard
              label="Available"
              value={menuSummary.availableItems}
              tone="green"
            />
            <SummaryCard
              label="Sold Out"
              value={menuSummary.soldOutItems}
              tone="red"
            />
            <SummaryCard
              label="Available Qty"
              value={menuSummary.totalAvailableQty}
            />
            <SummaryCard label="Sold Qty" value={menuSummary.totalSoldQty} />
          </div>

          <Card>
            <CardContent>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black">
                    Food Menu Stock Availability
                  </h2>
                  <p className="mt-1 text-sm text-neutral-500">
                    Control stock for single menu items. Bundle stock is
                    calculated from its component items.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <form action={handleInitializeMenuStocks}>
                    <button
                      type="submit"
                      disabled={pendingAction === 'initialize-menu'}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-neutral-200 px-5 text-sm font-black hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {pendingAction === 'initialize-menu' ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : null}
                      {pendingAction === 'initialize-menu'
                        ? 'Initializing...'
                        : 'Initialize Missing Stocks'}
                    </button>
                  </form>

                  <button
                    type="button"
                    onClick={() => setShowMenuMovements(true)}
                    className="h-11 rounded-2xl bg-black px-5 text-sm font-black text-white hover:bg-neutral-800"
                  >
                    View Recent Movements
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-[1fr_220px]">
                <div>
                  <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
                    Search Menu
                  </label>
                  <Input
                    value={menuSearch}
                    onChange={(event) => setMenuSearch(event.target.value)}
                    placeholder="Search by menu name, hotel, component, or limiting item"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
                    Filter Status
                  </label>
                  <select
                    value={menuFilter}
                    onChange={(event) =>
                      setMenuFilter(event.target.value as MenuFilterValue)
                    }
                    className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400"
                  >
                    <option value="ALL">All Items</option>
                    <option value="AVAILABLE">Available</option>
                    <option value="SOLD_OUT">Sold Out</option>
                    <option value="NOT_SET">Not Set</option>
                    <option value="MENU_HIDDEN">Menu Hidden</option>
                    <option value="BUNDLE">Bundles Only</option>
                  </select>
                </div>
              </div>

              <div className="mt-5 overflow-hidden rounded-[1.75rem] border border-neutral-200 bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1120px] text-left">
                    <thead className="bg-neutral-50">
                      <tr>
                        <th className="px-4 py-3 text-xs font-black uppercase text-neutral-500">
                          Menu Item
                        </th>
                        <th className="px-4 py-3 text-xs font-black uppercase text-neutral-500">
                          Type / Status
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-black uppercase text-neutral-500">
                          Available
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-black uppercase text-neutral-500">
                          Sold
                        </th>
                        <th className="px-4 py-3 text-xs font-black uppercase text-neutral-500">
                          Stock Detail
                        </th>
                        <th className="px-4 py-3 text-xs font-black uppercase text-neutral-500">
                          Last Updated
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-black uppercase text-neutral-500">
                          Action
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-neutral-100">
                      {filteredMenuItems.map((item) => {
                        const status = getMenuStatusLabel(item);

                        return (
                          <tr
                            key={item.id}
                            className={
                              item.isDerivedStock
                                ? 'bg-amber-50/35 align-top transition hover:bg-amber-50'
                                : 'align-top transition hover:bg-neutral-50'
                            }
                          >
                            <td className="px-4 py-4">
                              <p className="font-black text-neutral-950">
                                {item.name}
                              </p>
                              <p className="mt-1 text-xs font-bold text-neutral-500">
                                {item.hotelName}
                              </p>
                            </td>

                            <td className="px-4 py-4">
                              <div className="flex flex-col items-start gap-2">
                                <span
                                  className={`inline-flex rounded-full px-3 py-1 text-[10px] font-black ${getProductTypeClass(
                                    item
                                  )}`}
                                >
                                  {getProductTypeLabel(item)}
                                </span>

                                <span
                                  className={`inline-flex rounded-full px-3 py-1 text-[10px] font-black ${getStatusClass(
                                    status
                                  )}`}
                                >
                                  {status}
                                </span>
                              </div>
                            </td>

                            <td className="px-4 py-4 text-center">
                              <p className="text-2xl font-black text-neutral-950">
                                {item.availableQty}
                              </p>
                              <p className="text-[10px] font-black uppercase text-neutral-400">
                                {item.isDerivedStock ? 'Can Sell' : 'Available'}
                              </p>
                            </td>

                            <td className="px-4 py-4 text-center">
                              <p className="text-2xl font-black text-neutral-800">
                                {item.soldQty}
                              </p>
                              <p className="text-[10px] font-black uppercase text-neutral-400">
                                Sold
                              </p>
                            </td>

                            <td className="max-w-sm px-4 py-4">
                              {item.isDerivedStock ? (
                                <div className="space-y-1">
                                  <p className="text-xs font-black uppercase text-amber-700">
                                    {item.bundleComponents.length} component
                                    {item.bundleComponents.length === 1
                                      ? ''
                                      : 's'}
                                  </p>

                                  {item.bundleComponents.length ? (
                                    <div className="space-y-1">
                                      {item.bundleComponents
                                        .slice(0, 3)
                                        .map((component) => (
                                          <p
                                            key={component.id}
                                            className="text-xs font-bold text-amber-900"
                                          >
                                            • {component.quantity}×{' '}
                                            {component.name} ·{' '}
                                            {component.availableQty} available
                                          </p>
                                        ))}

                                      {item.bundleComponents.length > 3 ? (
                                        <p className="text-xs font-bold text-amber-800">
                                          +{item.bundleComponents.length - 3}{' '}
                                          more
                                        </p>
                                      ) : null}
                                    </div>
                                  ) : (
                                    <p className="text-xs font-bold text-amber-800">
                                      No components yet.
                                    </p>
                                  )}

                                  {item.limitingComponentName ? (
                                    <p className="rounded-xl bg-white px-3 py-2 text-xs font-black text-amber-900">
                                      Limiting item:{' '}
                                      {item.limitingComponentName}
                                    </p>
                                  ) : null}
                                </div>
                              ) : item.notes ? (
                                <p className="line-clamp-2 text-xs font-semibold leading-5 text-neutral-500">
                                  {item.notes}
                                </p>
                              ) : (
                                <p className="text-xs font-semibold text-neutral-400">
                                  No stock note.
                                </p>
                              )}
                            </td>

                            <td className="px-4 py-4 text-sm font-bold text-neutral-600">
                              {formatDateTime(item.updatedAt)}
                            </td>

                            <td className="px-4 py-4 text-right">
                              <button
                                type="button"
                                onClick={() => setControllingMenuItem(item)}
                                className={
                                  item.isDerivedStock
                                    ? 'inline-flex h-9 items-center justify-center rounded-full bg-amber-500 px-4 text-xs font-black text-white hover:bg-amber-600'
                                    : 'inline-flex h-9 items-center justify-center rounded-full bg-black px-4 text-xs font-black text-white hover:bg-neutral-800'
                                }
                              >
                                {item.isDerivedStock
                                  ? 'View Components'
                                  : 'Control Stock'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}

                      {!filteredMenuItems.length ? (
                        <tr>
                          <td
                            colSpan={7}
                            className="px-5 py-12 text-center"
                          >
                            <p className="font-black">No menu items found.</p>
                            <p className="mt-1 text-sm text-neutral-500">
                              Try changing your search or filter.
                            </p>
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}

      {activeTab === 'services' ? (
        <>
          <div className="mb-6 grid gap-3 md:grid-cols-6">
            <SummaryCard
              label="Total Services"
              value={serviceSummary.totalServices}
            />
            <SummaryCard
              label="Active Services"
              value={serviceSummary.activeServices}
            />
            <SummaryCard
              label="Tracked"
              value={serviceSummary.trackedServices}
              tone="blue"
            />
            <SummaryCard
              label="Available"
              value={serviceSummary.serviceAvailableItems}
              tone="green"
            />
            <SummaryCard
              label="Sold Out"
              value={serviceSummary.serviceSoldOutItems}
              tone="red"
            />
            <SummaryCard
              label="Available Qty"
              value={serviceSummary.serviceTotalAvailableQty}
            />
          </div>

          <Card>
            <CardContent>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black">
                    Service Request Inventory
                  </h2>
                  <p className="mt-1 text-sm text-neutral-500">
                    Track physical service items such as towels, pillows,
                    amenities, toiletries, baby cots, and water refill.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <form action={handleInitializeServiceStocks}>
                    <button
                      type="submit"
                      disabled={pendingAction === 'initialize-services'}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-neutral-200 px-5 text-sm font-black hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {pendingAction === 'initialize-services' ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : null}
                      {pendingAction === 'initialize-services'
                        ? 'Initializing...'
                        : 'Initialize Service Stocks'}
                    </button>
                  </form>

                  <button
                    type="button"
                    onClick={() => setShowServiceMovements(true)}
                    className="h-11 rounded-2xl bg-black px-5 text-sm font-black text-white hover:bg-neutral-800"
                  >
                    View Service Movements
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-[1fr_220px]">
                <div>
                  <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
                    Search Services
                  </label>
                  <Input
                    value={serviceSearch}
                    onChange={(event) => setServiceSearch(event.target.value)}
                    placeholder="Search by service name, category, code, or description"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
                    Filter Status
                  </label>
                  <select
                    value={serviceFilter}
                    onChange={(event) =>
                      setServiceFilter(event.target.value as ServiceFilterValue)
                    }
                    className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400"
                  >
                    <option value="ALL">All Services</option>
                    <option value="TRACKED">Tracked Only</option>
                    <option value="UNTRACKED">Untracked Only</option>
                    <option value="AVAILABLE">Available</option>
                    <option value="SOLD_OUT">Sold Out</option>
                    <option value="HIDDEN">Hidden</option>
                  </select>
                </div>
              </div>

              <div className="mt-5 overflow-hidden rounded-[1.75rem] border border-neutral-200 bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1180px] text-left">
                    <thead className="bg-neutral-50">
                      <tr>
                        <th className="px-4 py-3 text-xs font-black uppercase text-neutral-500">
                          Service Item
                        </th>
                        <th className="px-4 py-3 text-xs font-black uppercase text-neutral-500">
                          Tracking / Billing
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-black uppercase text-neutral-500">
                          Available
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-black uppercase text-neutral-500">
                          Used
                        </th>
                        <th className="px-4 py-3 text-xs font-black uppercase text-neutral-500">
                          Detail
                        </th>
                        <th className="px-4 py-3 text-xs font-black uppercase text-neutral-500">
                          Last Updated
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-black uppercase text-neutral-500">
                          Actions
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-neutral-100">
                      {filteredServiceItems.map((item) => {
                        const status = getServiceStatusLabel(item);

                        return (
                          <tr
                            key={item.id}
                            className={
                              item.inventoryTracked
                                ? 'bg-blue-50/25 align-top transition hover:bg-blue-50'
                                : 'align-top transition hover:bg-neutral-50'
                            }
                          >
                            <td className="px-4 py-4">
                              <p className="font-black text-neutral-950">
                                {item.name}
                              </p>
                              <p className="mt-1 text-xs font-bold text-neutral-500">
                                {item.hotelName} · {item.category}
                              </p>
                              {item.code ? (
                                <p className="mt-1 text-[10px] font-black uppercase tracking-wide text-neutral-400">
                                  Code: {item.code}
                                </p>
                              ) : null}
                            </td>

                            <td className="px-4 py-4">
                              <div className="flex flex-col items-start gap-2">
                                <span
                                  className={
                                    item.inventoryTracked
                                      ? 'inline-flex rounded-full bg-blue-100 px-3 py-1 text-[10px] font-black text-blue-700'
                                      : 'inline-flex rounded-full bg-neutral-100 px-3 py-1 text-[10px] font-black text-neutral-600'
                                  }
                                >
                                  {item.inventoryTracked
                                    ? 'Inventory Tracked'
                                    : 'Not Tracked'}
                                </span>

                                <span
                                  className={`inline-flex rounded-full px-3 py-1 text-[10px] font-black ${getBillingClass(
                                    item.billingMode
                                  )}`}
                                >
                                  {getBillingLabel(item.billingMode)}
                                  {item.billingMode ===
                                  ServiceBillingMode.FIXED_PRICE
                                    ? ` · ${money(item.unitPrice)}`
                                    : ''}
                                </span>

                                <span
                                  className={`inline-flex rounded-full px-3 py-1 text-[10px] font-black ${getStatusClass(
                                    status
                                  )}`}
                                >
                                  {status}
                                </span>
                              </div>
                            </td>

                            <td className="px-4 py-4 text-center">
                              <p className="text-2xl font-black text-neutral-950">
                                {item.inventoryTracked
                                  ? item.availableQty
                                  : '—'}
                              </p>
                              <p className="text-[10px] font-black uppercase text-neutral-400">
                                Available
                              </p>
                            </td>

                            <td className="px-4 py-4 text-center">
                              <p className="text-2xl font-black text-neutral-800">
                                {item.inventoryTracked ? item.usedQty : '—'}
                              </p>
                              <p className="text-[10px] font-black uppercase text-neutral-400">
                                Used
                              </p>
                            </td>

                            <td className="max-w-sm px-4 py-4">
                              {item.description ? (
                                <p className="line-clamp-2 text-xs font-semibold leading-5 text-neutral-500">
                                  {item.description}
                                </p>
                              ) : item.notes ? (
                                <p className="line-clamp-2 text-xs font-semibold leading-5 text-neutral-500">
                                  {item.notes}
                                </p>
                              ) : (
                                <p className="text-xs font-semibold text-neutral-400">
                                  No description or stock note.
                                </p>
                              )}
                            </td>

                            <td className="px-4 py-4 text-sm font-bold text-neutral-600">
                              {formatDateTime(item.updatedAt)}
                            </td>

                            <td className="px-4 py-4">
                              <div className="flex flex-wrap justify-end gap-2">
                                {item.inventoryTracked ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setControllingServiceItem(item)
                                      }
                                      className="inline-flex h-9 items-center justify-center rounded-full bg-black px-4 text-xs font-black text-white hover:bg-neutral-800"
                                    >
                                      Control Stock
                                    </button>

                                    <form action={handleDisableServiceInventory}>
                                      <input
                                        type="hidden"
                                        name="serviceId"
                                        value={item.id}
                                      />
                                      <button
                                        type="submit"
                                        disabled={
                                          pendingAction ===
                                          `disable-service:${item.id}`
                                        }
                                        className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-neutral-200 bg-white px-4 text-xs font-black text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        {pendingAction ===
                                        `disable-service:${item.id}` ? (
                                          <Loader2 className="size-3.5 animate-spin" />
                                        ) : null}
                                        {pendingAction ===
                                        `disable-service:${item.id}`
                                          ? 'Disabling...'
                                          : 'Disable'}
                                      </button>
                                    </form>
                                  </>
                                ) : (
                                  <form action={handleEnableServiceInventory}>
                                    <input
                                      type="hidden"
                                      name="serviceId"
                                      value={item.id}
                                    />
                                    <button
                                      type="submit"
                                      disabled={
                                        pendingAction ===
                                        `enable-service:${item.id}`
                                      }
                                      className="inline-flex h-9 items-center justify-center gap-2 rounded-full bg-blue-600 px-4 text-xs font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      {pendingAction ===
                                      `enable-service:${item.id}` ? (
                                        <Loader2 className="size-3.5 animate-spin" />
                                      ) : null}
                                      {pendingAction ===
                                      `enable-service:${item.id}`
                                        ? 'Enabling...'
                                        : 'Enable Inventory'}
                                    </button>
                                  </form>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}

                      {!filteredServiceItems.length ? (
                        <tr>
                          <td
                            colSpan={7}
                            className="px-5 py-12 text-center"
                          >
                            <p className="font-black">No service items found.</p>
                            <p className="mt-1 text-sm text-neutral-500">
                              Try changing your search or filter.
                            </p>
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}

      {controllingMenuItem ? (
        <ControlMenuStockModal
          item={controllingMenuItem}
          onClose={() => setControllingMenuItem(null)}
          action={handleControlMenuStock}
          pending={pendingAction === `control-menu:${controllingMenuItem.id}`}
        />
      ) : null}

      {controllingServiceItem ? (
        <ControlServiceStockModal
          item={controllingServiceItem}
          onClose={() => setControllingServiceItem(null)}
          action={handleControlServiceStock}
          pending={pendingAction === `control-service:${controllingServiceItem.id}`}
        />
      ) : null}

      {showMenuMovements ? (
        <MenuMovementsModal
          movements={menuMovements}
          onClose={() => setShowMenuMovements(false)}
        />
      ) : null}

      {showServiceMovements ? (
        <ServiceMovementsModal
          movements={serviceMovements}
          onClose={() => setShowServiceMovements(false)}
        />
      ) : null}
    </>
  );
}