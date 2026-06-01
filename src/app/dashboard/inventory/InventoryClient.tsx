'use client';

import { useMemo, useState } from 'react';
import {
  MenuAvailabilityMovementType,
  MenuProductType,
} from '@prisma/client';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import {
  controlMenuStockAction,
  initializeMenuStocksAction,
} from './actions';

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

type Movement = {
  id: string;
  hotelName: string;
  productName: string;
  type: MenuAvailabilityMovementType;
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

type Summary = {
  totalMenuItems: number;
  activeMenuItems: number;
  availableItems: number;
  soldOutItems: number;
  totalAvailableQty: number;
  totalSoldQty: number;
};

type FilterValue =
  | 'ALL'
  | 'AVAILABLE'
  | 'SOLD_OUT'
  | 'NOT_SET'
  | 'MENU_HIDDEN'
  | 'BUNDLE';

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

function getStatusLabel(item: MenuItem) {
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

function getStatusClass(item: MenuItem) {
  const status = getStatusLabel(item);

  if (status === 'AVAILABLE') {
    return 'bg-emerald-100 text-emerald-700';
  }

  if (status === 'SOLD OUT') {
    return 'bg-red-100 text-red-700';
  }

  if (status === 'MENU HIDDEN') {
    return 'bg-neutral-200 text-neutral-600';
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
      description="Bundle stock is calculated from component menu item stock. Update the component items to change how many bundles can be sold."
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
          <Metric
            label="Status"
            value={getStatusLabel(item)}
            small
          />
          <Metric
            label="Limiting Item"
            value={item.limitingComponentName || 'None'}
            small
          />
        </div>
      </div>

      <div className="rounded-3xl border border-amber-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-black text-neutral-950">Bundle Components</p>
            <p className="mt-1 text-sm text-neutral-500">
              Each bundle sold deducts stock from these component items.
            </p>
          </div>

          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">
            {item.bundleComponents.length}{' '}
            {item.bundleComponents.length === 1 ? 'component' : 'components'}
          </span>
        </div>

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

              <p className="mt-3 text-xs font-bold text-neutral-400">
                Last updated: {formatDateTime(component.updatedAt)}
              </p>
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

      <div className="mt-5 rounded-3xl bg-neutral-50 p-4">
        <p className="text-sm font-black text-neutral-900">How this works</p>
        <p className="mt-2 text-sm leading-6 text-neutral-600">
          A bundle does not have manual stock. Its available quantity is based
          on the lowest component stock after dividing by the required component
          quantity.
        </p>
      </div>

      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="h-11 rounded-2xl bg-black px-5 text-sm font-black text-white hover:bg-neutral-800"
        >
          Close
        </button>
      </div>
    </Modal>
  );
}

function ControlStockModal({
  item,
  onClose,
}: {
  item: MenuItem;
  onClose: () => void;
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
          <Metric label="Status" value={getStatusLabel(item)} small />
        </div>
      </div>

      <form action={controlMenuStockAction} className="space-y-4">
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

          <Button>Save Stock Control</Button>
        </div>
      </form>
    </Modal>
  );
}

function RecentMovementsModal({
  movements,
  onClose,
}: {
  movements: Movement[];
  onClose: () => void;
}) {
  return (
    <Modal
      title="Recent Stock Movements"
      description="Audit trail of menu stock changes."
      onClose={onClose}
      maxWidth="max-w-3xl"
    >
      <div className="space-y-3">
        {movements.map((movement) => (
          <div
            key={movement.id}
            className="rounded-3xl border border-neutral-200 bg-white p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-black">
                  {movement.type.replaceAll('_', ' ')}
                </p>
                <p className="mt-1 text-sm text-neutral-500">
                  {movement.hotelName} · {movement.productName}
                </p>
              </div>

              <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-black text-neutral-700">
                Balance: {movement.balanceAfter}
              </span>
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <MovementMetric label="Quantity" value={movement.quantity} />
              <MovementMetric
                label="Balance After"
                value={movement.balanceAfter}
              />
              <MovementMetric
                label="Created"
                value={formatDateTime(movement.createdAt)}
              />
            </div>

            {movement.reason ? (
              <p className="mt-3 rounded-2xl bg-neutral-50 p-3 text-sm text-neutral-600">
                {movement.reason}
              </p>
            ) : null}
          </div>
        ))}

        {!movements.length ? (
          <div className="rounded-3xl border border-dashed border-neutral-300 p-8 text-center">
            <p className="font-black">No movements yet.</p>
            <p className="mt-1 text-sm text-neutral-500">
              Stock changes will appear here.
            </p>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

export function InventoryClient({
  menuItems,
  movements,
  message,
  summary,
}: {
  menuItems: MenuItem[];
  movements: Movement[];
  message: Message;
  summary: Summary;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterValue>('ALL');
  const [controllingItem, setControllingItem] = useState<MenuItem | null>(null);
  const [showMovements, setShowMovements] = useState(false);

  const filteredItems = useMemo(() => {
    const searchText = search.trim().toLowerCase();

    return menuItems.filter((item) => {
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

      const status = getStatusLabel(item);

      const matchesFilter =
        filter === 'ALL' ||
        (filter === 'AVAILABLE' && status === 'AVAILABLE') ||
        (filter === 'SOLD_OUT' && status === 'SOLD OUT') ||
        (filter === 'NOT_SET' && status === 'NOT SET') ||
        (filter === 'MENU_HIDDEN' && status === 'MENU HIDDEN') ||
        (filter === 'BUNDLE' && item.isDerivedStock);

      return matchesSearch && matchesFilter;
    });
  }, [menuItems, search, filter]);

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

      <div className="mb-6 grid gap-3 md:grid-cols-6">
        <SummaryCard label="Total Menu" value={summary.totalMenuItems} />
        <SummaryCard label="Active Menu" value={summary.activeMenuItems} />
        <SummaryCard
          label="Available"
          value={summary.availableItems}
          tone="green"
        />
        <SummaryCard
          label="Sold Out"
          value={summary.soldOutItems}
          tone="red"
        />
        <SummaryCard label="Available Qty" value={summary.totalAvailableQty} />
        <SummaryCard label="Sold Qty" value={summary.totalSoldQty} />
      </div>

      <Card>
        <CardContent>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black">Menu Stock Availability</h2>
              <p className="mt-1 text-sm text-neutral-500">
                Control stock for single menu items. Bundle stock is calculated
                from its component items.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <form action={initializeMenuStocksAction}>
                <button
                  type="submit"
                  className="h-11 rounded-2xl border border-neutral-200 px-5 text-sm font-black hover:bg-neutral-50"
                >
                  Initialize Missing Stocks
                </button>
              </form>

              <button
                type="button"
                onClick={() => setShowMovements(true)}
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
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by menu name, hotel, component, or limiting item"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
                Filter Status
              </label>
              <select
                value={filter}
                onChange={(event) =>
                  setFilter(event.target.value as FilterValue)
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

          <div className="mt-5 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className={
                  item.isDerivedStock
                    ? 'rounded-3xl border border-amber-200 bg-white p-4 shadow-sm'
                    : 'rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm'
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-black text-neutral-950">
                      {item.name}
                    </p>
                    <p className="mt-1 truncate text-xs font-bold text-neutral-500">
                      {item.hotelName}
                    </p>

                    <span
                      className={`mt-2 inline-flex rounded-full px-3 py-1 text-[10px] font-black ${getProductTypeClass(
                        item
                      )}`}
                    >
                      {getProductTypeLabel(item)}
                    </span>
                  </div>

                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-black ${getStatusClass(
                      item
                    )}`}
                  >
                    {getStatusLabel(item)}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <Metric
                    label={item.isDerivedStock ? 'Can Sell' : 'Available'}
                    value={item.availableQty}
                    strong
                  />
                  <Metric label="Sold" value={item.soldQty} />
                  <Metric
                    label={item.isDerivedStock ? 'Components' : 'Updated'}
                    value={
                      item.isDerivedStock
                        ? item.bundleComponents.length
                        : item.updatedAt
                          ? 'Yes'
                          : 'No'
                    }
                    small
                  />
                </div>

                {item.isDerivedStock ? (
                  <div className="mt-3 rounded-2xl bg-amber-50 p-3">
                    <p className="text-xs font-black uppercase text-amber-700">
                      Bundle Components
                    </p>

                    {item.bundleComponents.length ? (
                      <div className="mt-2 space-y-1">
                        {item.bundleComponents.slice(0, 4).map((component) => (
                          <p
                            key={component.id}
                            className="text-xs font-bold text-amber-900"
                          >
                            {component.quantity}× {component.name} ·{' '}
                            {component.availableQty} available
                          </p>
                        ))}

                        {item.bundleComponents.length > 4 ? (
                          <p className="text-xs font-bold text-amber-800">
                            +{item.bundleComponents.length - 4} more component
                            {item.bundleComponents.length - 4 === 1
                              ? ''
                              : 's'}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs font-bold text-amber-800">
                        No components yet.
                      </p>
                    )}

                    {item.limitingComponentName ? (
                      <p className="mt-3 rounded-xl bg-white/80 p-2 text-xs font-black text-amber-900">
                        Limiting item: {item.limitingComponentName}
                      </p>
                    ) : null}
                  </div>
                ) : item.notes ? (
                  <p className="mt-3 line-clamp-2 rounded-2xl bg-neutral-50 p-3 text-xs text-neutral-500">
                    {item.notes}
                  </p>
                ) : (
                  <p className="mt-3 rounded-2xl bg-neutral-50 p-3 text-xs text-neutral-400">
                    No stock note.
                  </p>
                )}

                <p className="mt-3 text-xs font-bold text-neutral-400">
                  Last updated: {formatDateTime(item.updatedAt)}
                </p>

                <button
                  type="button"
                  onClick={() => setControllingItem(item)}
                  className={
                    item.isDerivedStock
                      ? 'mt-4 h-10 w-full rounded-2xl bg-amber-500 text-sm font-black text-white hover:bg-amber-600'
                      : 'mt-4 h-10 w-full rounded-2xl bg-black text-sm font-black text-white hover:bg-neutral-800'
                  }
                >
                  {item.isDerivedStock ? 'View Components' : 'Control Stock'}
                </button>
              </div>
            ))}

            {!filteredItems.length ? (
              <div className="rounded-3xl border border-dashed border-neutral-300 p-8 text-center">
                <p className="font-black">No menu items found.</p>
                <p className="mt-1 text-sm text-neutral-500">
                  Try changing your search or filter.
                </p>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {controllingItem ? (
        <ControlStockModal
          item={controllingItem}
          onClose={() => setControllingItem(null)}
        />
      ) : null}

      {showMovements ? (
        <RecentMovementsModal
          movements={movements}
          onClose={() => setShowMovements(false)}
        />
      ) : null}
    </>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'green' | 'red';
}) {
  return (
    <div
      className={
        tone === 'green'
          ? 'rounded-3xl border border-emerald-200 bg-emerald-50 p-5'
          : tone === 'red'
            ? 'rounded-3xl border border-red-200 bg-red-50 p-5'
            : 'rounded-3xl border border-neutral-200 bg-white p-5'
      }
    >
      <p
        className={
          tone === 'green'
            ? 'text-sm font-bold text-emerald-700'
            : tone === 'red'
              ? 'text-sm font-bold text-red-700'
              : 'text-sm font-bold text-neutral-500'
        }
      >
        {label}
      </p>
      <p className="mt-2 text-3xl font-black">{value}</p>
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