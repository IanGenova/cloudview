'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Boxes,
  CheckCircle2,
  CheckSquare2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  Square,
  X,
} from 'lucide-react';
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
  bulkControlMenuStockAction,
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
  categoryName: string;
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

type SortDirection = 'asc' | 'desc';

type MenuSortKey =
  | 'menuItem'
  | 'typeStatus'
  | 'available'
  | 'sold'
  | 'stockDetail'
  | 'updatedAt';

type ServiceSortKey =
  | 'serviceItem'
  | 'trackingBilling'
  | 'available'
  | 'used'
  | 'detail'
  | 'updatedAt';

function compareText(left: string, right: string) {
  return left.localeCompare(right, 'en', {
    sensitivity: 'base',
    numeric: true,
  });
}

function compareDateValues(
  left: string | Date | null,
  right: string | Date | null
) {
  const leftTime = left ? new Date(left).getTime() : 0;
  const rightTime = right ? new Date(right).getTime() : 0;

  return leftTime - rightTime;
}

function SortableTableHeader({
  label,
  sortKey,
  activeSortKey,
  direction,
  onSort,
  align = 'left',
}: {
  label: string;
  sortKey: string;
  activeSortKey: string;
  direction: SortDirection;
  onSort: (sortKey: string) => void;
  align?: 'left' | 'center' | 'right';
}) {
  const isActive = activeSortKey === sortKey;
  const alignmentClass =
    align === 'center'
      ? 'justify-center text-center'
      : align === 'right'
        ? 'justify-end text-right'
        : 'justify-start text-left';

  return (
    <th
      className="px-4 py-3 text-xs font-black uppercase text-neutral-500"
      aria-sort={
        isActive
          ? direction === 'asc'
            ? 'ascending'
            : 'descending'
          : 'none'
      }
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`group inline-flex w-full items-center gap-1.5 rounded-lg py-1 transition hover:text-neutral-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d4a62a]/50 ${alignmentClass}`}
        title={`Sort by ${label}`}
      >
        <span>{label}</span>

        {isActive ? (
          direction === 'asc' ? (
            <ArrowUp className="size-3.5 text-[#b68510]" />
          ) : (
            <ArrowDown className="size-3.5 text-[#b68510]" />
          )
        ) : (
          <ArrowUpDown className="size-3.5 text-neutral-300 transition group-hover:text-neutral-500" />
        )}
      </button>
    </th>
  );
}

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

type InventoryPageSize = 10 | 20 | 50 | 100;

function PaginationControls({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: InventoryPageSize;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: InventoryPageSize) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const startItem = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endItem = Math.min(safePage * pageSize, totalItems);

  return (
    <div className="flex flex-col gap-3 border-t border-neutral-200 bg-neutral-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs font-bold text-neutral-600">
          Showing <span className="font-black text-neutral-950">{startItem}</span>
          {'–'}
          <span className="font-black text-neutral-950">{endItem}</span> of{' '}
          <span className="font-black text-neutral-950">{totalItems}</span> items
        </p>

        <label className="flex items-center gap-2 text-xs font-bold text-neutral-600">
          Rows
          <select
            value={pageSize}
            onChange={(event) =>
              onPageSizeChange(Number(event.target.value) as InventoryPageSize)
            }
            className="h-9 rounded-xl border border-neutral-200 bg-white px-3 text-xs font-black text-neutral-800 outline-none focus:border-neutral-400"
            aria-label="Rows per page"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>
      </div>

      <div className="flex items-center justify-between gap-2 sm:justify-end">
        <span className="mr-1 text-xs font-black text-neutral-600">
          Page {safePage} of {totalPages}
        </span>

        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={safePage <= 1}
          className="grid size-9 place-items-center rounded-xl border border-neutral-200 bg-white text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="First page"
        >
          <ChevronsLeft className="size-4" />
        </button>

        <button
          type="button"
          onClick={() => onPageChange(safePage - 1)}
          disabled={safePage <= 1}
          className="grid size-9 place-items-center rounded-xl border border-neutral-200 bg-white text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" />
        </button>

        <button
          type="button"
          onClick={() => onPageChange(safePage + 1)}
          disabled={safePage >= totalPages}
          className="grid size-9 place-items-center rounded-xl border border-neutral-200 bg-white text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Next page"
        >
          <ChevronRight className="size-4" />
        </button>

        <button
          type="button"
          onClick={() => onPageChange(totalPages)}
          disabled={safePage >= totalPages}
          className="grid size-9 place-items-center rounded-xl border border-neutral-200 bg-white text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Last page"
        >
          <ChevronsRight className="size-4" />
        </button>
      </div>
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
      description="Set, add, remove, sell out, or reopen this menu item. The database transaction rolls back automatically when saving fails."
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


function BulkControlMenuStockModal({
  items,
  onClose,
  action,
  pending,
}: {
  items: MenuItem[];
  onClose: () => void;
  action: InventoryFormAction;
  pending?: boolean;
}) {
  const [operation, setOperation] = useState<MenuAvailabilityMovementType>(
    MenuAvailabilityMovementType.SET_STOCK
  );

  const quantityRequired =
    operation === MenuAvailabilityMovementType.SET_STOCK ||
    operation === MenuAvailabilityMovementType.ADD_STOCK ||
    operation === MenuAvailabilityMovementType.REMOVE_STOCK ||
    operation === MenuAvailabilityMovementType.REOPEN;

  const positiveQuantityRequired =
    operation === MenuAvailabilityMovementType.ADD_STOCK ||
    operation === MenuAvailabilityMovementType.REMOVE_STOCK ||
    operation === MenuAvailabilityMovementType.REOPEN;

  return (
    <Modal
      title="Bulk Menu Stock Control"
      description="Apply one stock operation to every selected single menu item."
      onClose={onClose}
      maxWidth="max-w-3xl"
    >
      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-700">
              Selected Menu Items
            </p>
            <p className="mt-1 text-2xl font-black text-neutral-950">
              {items.length} item{items.length === 1 ? '' : 's'}
            </p>
          </div>

          <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-amber-800">
            Single items only
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {items.slice(0, 8).map((item) => (
            <span
              key={item.id}
              className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-bold text-neutral-700"
            >
              {item.name}
            </span>
          ))}

          {items.length > 8 ? (
            <span className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-black text-amber-800">
              +{items.length - 8} more
            </span>
          ) : null}
        </div>
      </div>

      <form action={action} className="mt-5 space-y-4">
        {items.map((item) => (
          <input
            key={item.id}
            type="hidden"
            name="productId"
            value={item.id}
          />
        ))}

        <div>
          <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
            Bulk Operation
          </label>
          <Select
            name="operation"
            value={operation}
            onChange={(event) =>
              setOperation(
                event.target.value as MenuAvailabilityMovementType
              )
            }
          >
            <option value={MenuAvailabilityMovementType.SET_STOCK}>
              Set the same exact stock for all selected items
            </option>
            <option value={MenuAvailabilityMovementType.ADD_STOCK}>
              Add the same quantity to all selected items
            </option>
            <option value={MenuAvailabilityMovementType.REMOVE_STOCK}>
              Remove the same quantity from all selected items
            </option>
            <option value={MenuAvailabilityMovementType.SOLD_OUT}>
              Mark all selected items as sold out
            </option>
            <option value={MenuAvailabilityMovementType.REOPEN}>
              Reopen all selected items and add stock
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
            min={positiveQuantityRequired ? 1 : 0}
            step="1"
            required={quantityRequired}
            disabled={!quantityRequired}
            placeholder={
              operation === MenuAvailabilityMovementType.SET_STOCK
                ? 'Example: 25'
                : operation === MenuAvailabilityMovementType.SOLD_OUT
                  ? 'Not required'
                  : 'Example: 10'
            }
          />
          <p className="mt-1 text-xs font-semibold text-neutral-500">
            {operation === MenuAvailabilityMovementType.SET_STOCK
              ? 'Every selected item will receive this exact available quantity.'
              : operation === MenuAvailabilityMovementType.ADD_STOCK
                ? 'This quantity will be added to every selected item.'
                : operation === MenuAvailabilityMovementType.REMOVE_STOCK
                  ? 'This quantity will be removed from every selected item, without going below zero.'
                  : operation === MenuAvailabilityMovementType.REOPEN
                    ? 'Every selected item will reopen and receive this additional quantity.'
                    : 'Every selected item will be set to zero and marked sold out.'}
          </p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
            Movement Reason
          </label>
          <Input
            name="reason"
            placeholder="Example: Party tray inventory reset for today"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
            Internal Stock Note
          </label>
          <Input
            name="notes"
            placeholder="Optional. Leave blank to keep existing notes."
          />
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm font-semibold leading-6 text-neutral-600">
          Bundle quantities are not directly edited because they are calculated
          from their component items. Updating the selected single items will
          automatically recalculate any related bundles.
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="h-11 rounded-2xl border border-neutral-200 px-5 text-sm font-black hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>

          <Button
            disabled={pending || items.length === 0}
            className={
              operation === MenuAvailabilityMovementType.SOLD_OUT
                ? 'bg-red-600 text-white hover:bg-red-700'
                : ''
            }
          >
            {pending
              ? 'Updating inventory...'
              : `Update ${items.length} item${items.length === 1 ? '' : 's'}`}
          </Button>
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
      description="Set, add, remove, sell out, or reopen this service item. Failed saves are rolled back automatically."
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
      description="Audit trail of manual changes, order deductions, cancellation restores, and automatic rollback movements."
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
      description="Audit trail of manual changes, request deductions, and cancellation restores."
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
  const [menuCategoryFilter, setMenuCategoryFilter] = useState('ALL');
  const [menuPage, setMenuPage] = useState(1);
  const [menuPageSize, setMenuPageSize] =
    useState<InventoryPageSize>(20);
  const [menuSort, setMenuSort] = useState<{
    key: MenuSortKey;
    direction: SortDirection;
  }>({
    key: 'menuItem',
    direction: 'asc',
  });
  const [selectedMenuIds, setSelectedMenuIds] = useState<Set<string>>(
    () => new Set()
  );
  const [showBulkMenuControl, setShowBulkMenuControl] = useState(false);
  const [controllingMenuItem, setControllingMenuItem] =
    useState<MenuItem | null>(null);
  const [showMenuMovements, setShowMenuMovements] = useState(false);

  const [serviceSearch, setServiceSearch] = useState('');
  const [serviceFilter, setServiceFilter] =
    useState<ServiceFilterValue>('ALL');
  const [servicePage, setServicePage] = useState(1);
  const [servicePageSize, setServicePageSize] =
    useState<InventoryPageSize>(20);
  const [serviceSort, setServiceSort] = useState<{
    key: ServiceSortKey;
    direction: SortDirection;
  }>({
    key: 'serviceItem',
    direction: 'asc',
  });
  const [controllingServiceItem, setControllingServiceItem] =
    useState<ServiceItem | null>(null);
  const [showServiceMovements, setShowServiceMovements] = useState(false);

  useEffect(() => {
    setLocalMenuItems(menuItems);

    const selectableIds = new Set(
      menuItems
        .filter((item) => !item.isDerivedStock)
        .map((item) => item.id)
    );

    setSelectedMenuIds((current) => {
      const next = new Set(
        Array.from(current).filter((id) => selectableIds.has(id))
      );

      return next.size === current.size ? current : next;
    });
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

  function handleBulkControlMenuStock(formData: FormData) {
    const selectedCount = formData.getAll('productId').length;

    runInventoryAction({
      formData,
      action: bulkControlMenuStockAction,
      successText: `${selectedCount} menu item${
        selectedCount === 1 ? '' : 's'
      } updated successfully.`,
      pendingKey: 'bulk-control-menu',
      onSuccess: () => {
        setShowBulkMenuControl(false);
        setSelectedMenuIds(new Set<string>());
      },
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

  const menuCategories = useMemo(
    () =>
      Array.from(
        new Set(
          localMenuItems
            .map((item) => item.categoryName)
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b)),
    [localMenuItems]
  );

  const filteredMenuItems = useMemo(() => {
    const searchText = menuSearch.trim().toLowerCase();

    return localMenuItems.filter((item) => {
      const matchesSearch =
        !searchText ||
        item.name.toLowerCase().includes(searchText) ||
        item.hotelName.toLowerCase().includes(searchText) ||
        item.categoryName.toLowerCase().includes(searchText) ||
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

      const matchesCategory =
        menuCategoryFilter === 'ALL' ||
        item.categoryName === menuCategoryFilter;

      return matchesSearch && matchesFilter && matchesCategory;
    });
  }, [
    localMenuItems,
    menuCategoryFilter,
    menuFilter,
    menuSearch,
  ]);

  const sortedMenuItems = useMemo(() => {
    const directionMultiplier = menuSort.direction === 'asc' ? 1 : -1;

    return [...filteredMenuItems].sort((left, right) => {
      let comparison = 0;

      if (menuSort.key === 'menuItem') {
        comparison = compareText(left.name, right.name);

        if (comparison === 0) {
          comparison = compareText(left.hotelName, right.hotelName);
        }

        if (comparison === 0) {
          comparison = compareText(left.categoryName, right.categoryName);
        }
      } else if (menuSort.key === 'typeStatus') {
        comparison = compareText(
          `${getProductTypeLabel(left)} ${getMenuStatusLabel(left)}`,
          `${getProductTypeLabel(right)} ${getMenuStatusLabel(right)}`
        );
      } else if (menuSort.key === 'available') {
        comparison = left.availableQty - right.availableQty;
      } else if (menuSort.key === 'sold') {
        comparison = left.soldQty - right.soldQty;
      } else if (menuSort.key === 'stockDetail') {
        comparison = compareText(
          left.isDerivedStock
            ? `${left.limitingComponentName ?? ''} ${left.notes}`
            : left.notes,
          right.isDerivedStock
            ? `${right.limitingComponentName ?? ''} ${right.notes}`
            : right.notes
        );
      } else if (menuSort.key === 'updatedAt') {
        comparison = compareDateValues(left.updatedAt, right.updatedAt);
      }

      if (comparison === 0) {
        comparison = compareText(left.name, right.name);
      }

      return comparison * directionMultiplier;
    });
  }, [filteredMenuItems, menuSort]);

  function handleMenuSort(sortKey: string) {
    const nextKey = sortKey as MenuSortKey;

    setMenuSort((current) => ({
      key: nextKey,
      direction:
        current.key === nextKey
          ? current.direction === 'asc'
            ? 'desc'
            : 'asc'
          : nextKey === 'available' ||
              nextKey === 'sold' ||
              nextKey === 'updatedAt'
            ? 'desc'
            : 'asc',
    }));

    setMenuPage(1);
  }

  const menuTotalPages = Math.max(
    1,
    Math.ceil(sortedMenuItems.length / menuPageSize)
  );

  useEffect(() => {
    setMenuPage(1);
  }, [
    menuCategoryFilter,
    menuFilter,
    menuPageSize,
    menuSearch,
    menuSort.direction,
    menuSort.key,
  ]);

  useEffect(() => {
    setMenuPage((current) => Math.min(current, menuTotalPages));
  }, [menuTotalPages]);

  const paginatedMenuItems = useMemo(() => {
    const startIndex = (menuPage - 1) * menuPageSize;
    return sortedMenuItems.slice(startIndex, startIndex + menuPageSize);
  }, [menuPage, menuPageSize, sortedMenuItems]);

  const selectableFilteredMenuItems = useMemo(
    () => sortedMenuItems.filter((item) => !item.isDerivedStock),
    [sortedMenuItems]
  );

  const selectableCurrentMenuPageItems = useMemo(
    () => paginatedMenuItems.filter((item) => !item.isDerivedStock),
    [paginatedMenuItems]
  );

  const selectedMenuItems = useMemo(
    () =>
      localMenuItems.filter(
        (item) => !item.isDerivedStock && selectedMenuIds.has(item.id)
      ),
    [localMenuItems, selectedMenuIds]
  );

  const allFilteredMenuItemsSelected =
    selectableFilteredMenuItems.length > 0 &&
    selectableFilteredMenuItems.every((item) =>
      selectedMenuIds.has(item.id)
    );


  const allCurrentMenuPageItemsSelected =
    selectableCurrentMenuPageItems.length > 0 &&
    selectableCurrentMenuPageItems.every((item) =>
      selectedMenuIds.has(item.id)
    );

  function toggleMenuSelection(productId: string) {
    setSelectedMenuIds((current) => {
      const next = new Set(current);

      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }

      return next;
    });
  }

  function toggleAllFilteredMenuItems() {
    setSelectedMenuIds((current) => {
      const next = new Set(current);

      if (allFilteredMenuItemsSelected) {
        selectableFilteredMenuItems.forEach((item) => next.delete(item.id));
      } else {
        selectableFilteredMenuItems.forEach((item) => next.add(item.id));
      }

      return next;
    });
  }


  function toggleCurrentMenuPageItems() {
    setSelectedMenuIds((current) => {
      const next = new Set(current);

      if (allCurrentMenuPageItemsSelected) {
        selectableCurrentMenuPageItems.forEach((item) => next.delete(item.id));
      } else {
        selectableCurrentMenuPageItems.forEach((item) => next.add(item.id));
      }

      return next;
    });
  }

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

  const sortedServiceItems = useMemo(() => {
    const directionMultiplier = serviceSort.direction === 'asc' ? 1 : -1;

    return [...filteredServiceItems].sort((left, right) => {
      let comparison = 0;

      if (serviceSort.key === 'serviceItem') {
        comparison = compareText(left.name, right.name);

        if (comparison === 0) {
          comparison = compareText(left.hotelName, right.hotelName);
        }

        if (comparison === 0) {
          comparison = compareText(left.category, right.category);
        }
      } else if (serviceSort.key === 'trackingBilling') {
        comparison = compareText(
          `${left.inventoryTracked ? 'Tracked' : 'Not Tracked'} ${getBillingLabel(
            left.billingMode
          )} ${getServiceStatusLabel(left)}`,
          `${right.inventoryTracked ? 'Tracked' : 'Not Tracked'} ${getBillingLabel(
            right.billingMode
          )} ${getServiceStatusLabel(right)}`
        );
      } else if (serviceSort.key === 'available') {
        comparison = left.availableQty - right.availableQty;
      } else if (serviceSort.key === 'used') {
        comparison = left.usedQty - right.usedQty;
      } else if (serviceSort.key === 'detail') {
        comparison = compareText(
          left.description || left.notes,
          right.description || right.notes
        );
      } else if (serviceSort.key === 'updatedAt') {
        comparison = compareDateValues(left.updatedAt, right.updatedAt);
      }

      if (comparison === 0) {
        comparison = compareText(left.name, right.name);
      }

      return comparison * directionMultiplier;
    });
  }, [filteredServiceItems, serviceSort]);

  function handleServiceSort(sortKey: string) {
    const nextKey = sortKey as ServiceSortKey;

    setServiceSort((current) => ({
      key: nextKey,
      direction:
        current.key === nextKey
          ? current.direction === 'asc'
            ? 'desc'
            : 'asc'
          : nextKey === 'available' ||
              nextKey === 'used' ||
              nextKey === 'updatedAt'
            ? 'desc'
            : 'asc',
    }));

    setServicePage(1);
  }

  const serviceTotalPages = Math.max(
    1,
    Math.ceil(sortedServiceItems.length / servicePageSize)
  );

  useEffect(() => {
    setServicePage(1);
  }, [
    serviceFilter,
    servicePageSize,
    serviceSearch,
    serviceSort.direction,
    serviceSort.key,
  ]);

  useEffect(() => {
    setServicePage((current) => Math.min(current, serviceTotalPages));
  }, [serviceTotalPages]);

  const paginatedServiceItems = useMemo(() => {
    const startIndex = (servicePage - 1) * servicePageSize;
    return sortedServiceItems.slice(startIndex, startIndex + servicePageSize);
  }, [servicePage, servicePageSize, sortedServiceItems]);

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
                    onClick={() => setShowBulkMenuControl(true)}
                    disabled={
                      selectedMenuItems.length === 0 ||
                      pendingAction === 'bulk-control-menu'
                    }
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[#d4a62a] px-5 text-sm font-black text-black transition hover:bg-[#e3b83d] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {pendingAction === 'bulk-control-menu' ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Boxes className="size-4" />
                    )}
                    Bulk Control ({selectedMenuItems.length})
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowMenuMovements(true)}
                    className="h-11 rounded-2xl bg-black px-5 text-sm font-black text-white hover:bg-neutral-800"
                  >
                    View Recent Movements
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_220px]">
                <div>
                  <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
                    Search Menu
                  </label>
                  <Input
                    value={menuSearch}
                    onChange={(event) => setMenuSearch(event.target.value)}
                    placeholder="Search name, category, hotel, or component"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
                    Category
                  </label>
                  <select
                    value={menuCategoryFilter}
                    onChange={(event) =>
                      setMenuCategoryFilter(event.target.value)
                    }
                    className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400"
                  >
                    <option value="ALL">All Categories</option>
                    {menuCategories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
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

              <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-[#d4a62a]/30 bg-[#fff8e5] p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={toggleAllFilteredMenuItems}
                    disabled={selectableFilteredMenuItems.length === 0}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#d4a62a]/35 bg-white px-4 text-xs font-black text-neutral-800 transition hover:bg-[#fff2c9] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {allFilteredMenuItemsSelected ? (
                      <CheckSquare2 className="size-4 text-[#b68510]" />
                    ) : (
                      <Square className="size-4 text-[#b68510]" />
                    )}
                    {allFilteredMenuItemsSelected
                      ? 'Unselect filtered items'
                      : `Select all ${selectableFilteredMenuItems.length} filtered single items`}
                  </button>

                  <div>
                    <p className="text-sm font-black text-neutral-900">
                      {selectedMenuItems.length} selected
                    </p>
                    <p className="text-xs font-semibold text-neutral-500">
                      Bundles are excluded because their stock is derived.
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  {selectedMenuItems.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setSelectedMenuIds(new Set<string>())}
                      className="h-10 rounded-xl border border-neutral-200 bg-white px-4 text-xs font-black text-neutral-700 hover:bg-neutral-50"
                    >
                      Clear Selection
                    </button>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => setShowBulkMenuControl(true)}
                    disabled={selectedMenuItems.length === 0}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-black px-4 text-xs font-black text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Boxes className="size-4 text-[#d4a62a]" />
                    Update Selected
                  </button>
                </div>
              </div>

              <div className="mt-5 overflow-hidden rounded-[1.75rem] border border-neutral-200 bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1180px] text-left">
                    <thead className="bg-neutral-50">
                      <tr>
                        <th className="w-14 px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={toggleCurrentMenuPageItems}
                            disabled={selectableCurrentMenuPageItems.length === 0}
                            className="inline-grid size-8 place-items-center rounded-xl text-[#b68510] transition hover:bg-[#fff2c9] disabled:cursor-not-allowed disabled:opacity-35"
                            aria-label={
                              allCurrentMenuPageItemsSelected
                                ? 'Unselect single items on this page'
                                : 'Select single items on this page'
                            }
                          >
                            {allCurrentMenuPageItemsSelected ? (
                              <CheckSquare2 className="size-5" />
                            ) : (
                              <Square className="size-5" />
                            )}
                          </button>
                        </th>
                        <SortableTableHeader
                          label="Menu Item"
                          sortKey="menuItem"
                          activeSortKey={menuSort.key}
                          direction={menuSort.direction}
                          onSort={handleMenuSort}
                        />
                        <SortableTableHeader
                          label="Type / Status"
                          sortKey="typeStatus"
                          activeSortKey={menuSort.key}
                          direction={menuSort.direction}
                          onSort={handleMenuSort}
                        />
                        <SortableTableHeader
                          label="Available"
                          sortKey="available"
                          activeSortKey={menuSort.key}
                          direction={menuSort.direction}
                          onSort={handleMenuSort}
                          align="center"
                        />
                        <SortableTableHeader
                          label="Sold"
                          sortKey="sold"
                          activeSortKey={menuSort.key}
                          direction={menuSort.direction}
                          onSort={handleMenuSort}
                          align="center"
                        />
                        <SortableTableHeader
                          label="Stock Detail"
                          sortKey="stockDetail"
                          activeSortKey={menuSort.key}
                          direction={menuSort.direction}
                          onSort={handleMenuSort}
                        />
                        <SortableTableHeader
                          label="Last Updated"
                          sortKey="updatedAt"
                          activeSortKey={menuSort.key}
                          direction={menuSort.direction}
                          onSort={handleMenuSort}
                        />
                        <th className="px-4 py-3 text-right text-xs font-black uppercase text-neutral-500">
                          Action
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-neutral-100">
                      {paginatedMenuItems.map((item) => {
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
                            <td className="px-4 py-4 text-center">
                              {item.isDerivedStock ? (
                                <span
                                  className="inline-grid size-8 place-items-center rounded-xl bg-amber-100 text-[10px] font-black text-amber-700"
                                  title="Bundle stock is derived from component items"
                                >
                                  —
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => toggleMenuSelection(item.id)}
                                  className="inline-grid size-8 place-items-center rounded-xl text-[#b68510] transition hover:bg-[#fff2c9]"
                                  aria-label={
                                    selectedMenuIds.has(item.id)
                                      ? `Unselect ${item.name}`
                                      : `Select ${item.name}`
                                  }
                                >
                                  {selectedMenuIds.has(item.id) ? (
                                    <CheckSquare2 className="size-5" />
                                  ) : (
                                    <Square className="size-5" />
                                  )}
                                </button>
                              )}
                            </td>

                            <td className="px-4 py-4">
                              <p className="font-black text-neutral-950">
                                {item.name}
                              </p>
                              <p className="mt-1 text-xs font-bold text-neutral-500">
                                {item.hotelName} · {item.categoryName}
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
                            colSpan={8}
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

                <PaginationControls
                  page={menuPage}
                  pageSize={menuPageSize}
                  totalItems={filteredMenuItems.length}
                  onPageChange={setMenuPage}
                  onPageSizeChange={(nextPageSize) => {
                    setMenuPageSize(nextPageSize);
                    setMenuPage(1);
                  }}
                />
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
                        <SortableTableHeader
                          label="Service Item"
                          sortKey="serviceItem"
                          activeSortKey={serviceSort.key}
                          direction={serviceSort.direction}
                          onSort={handleServiceSort}
                        />
                        <SortableTableHeader
                          label="Tracking / Billing"
                          sortKey="trackingBilling"
                          activeSortKey={serviceSort.key}
                          direction={serviceSort.direction}
                          onSort={handleServiceSort}
                        />
                        <SortableTableHeader
                          label="Available"
                          sortKey="available"
                          activeSortKey={serviceSort.key}
                          direction={serviceSort.direction}
                          onSort={handleServiceSort}
                          align="center"
                        />
                        <SortableTableHeader
                          label="Used"
                          sortKey="used"
                          activeSortKey={serviceSort.key}
                          direction={serviceSort.direction}
                          onSort={handleServiceSort}
                          align="center"
                        />
                        <SortableTableHeader
                          label="Detail"
                          sortKey="detail"
                          activeSortKey={serviceSort.key}
                          direction={serviceSort.direction}
                          onSort={handleServiceSort}
                        />
                        <SortableTableHeader
                          label="Last Updated"
                          sortKey="updatedAt"
                          activeSortKey={serviceSort.key}
                          direction={serviceSort.direction}
                          onSort={handleServiceSort}
                        />
                        <th className="px-4 py-3 text-right text-xs font-black uppercase text-neutral-500">
                          Actions
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-neutral-100">
                      {paginatedServiceItems.map((item) => {
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

                <PaginationControls
                  page={servicePage}
                  pageSize={servicePageSize}
                  totalItems={filteredServiceItems.length}
                  onPageChange={setServicePage}
                  onPageSizeChange={(nextPageSize) => {
                    setServicePageSize(nextPageSize);
                    setServicePage(1);
                  }}
                />
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}

      {showBulkMenuControl && selectedMenuItems.length > 0 ? (
        <BulkControlMenuStockModal
          items={selectedMenuItems}
          onClose={() => setShowBulkMenuControl(false)}
          action={handleBulkControlMenuStock}
          pending={pendingAction === 'bulk-control-menu'}
        />
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