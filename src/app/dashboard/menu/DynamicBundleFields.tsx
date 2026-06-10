'use client';

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { PackagePlus, Plus, Trash2 } from 'lucide-react';

type ProductTypeValue = 'SINGLE' | 'BUNDLE';

type BundleComponentOption = {
  id: string;
  hotelId: string;
  name: string;
  priceCents: number;
  isAvailable: boolean;
  productType: ProductTypeValue;
  hotel: {
    name: string;
  };
  category: {
    name: string;
  };
};

type BundleComponentValue = {
  componentProductId: string;
  quantity: number;
};

type BundleRow = {
  rowKey: string;
  componentProductId: string;
  quantity: number;
};

type BundleContextValue = {
  productType: ProductTypeValue;
  setProductType: (value: ProductTypeValue) => void;
};

const BundleContext = createContext<BundleContextValue | null>(null);

function useBundleContext() {
  const context = useContext(BundleContext);

  if (!context) {
    throw new Error(
      'ProductTypeField and DynamicBundleComponentFields must be used inside ProductBundleProvider.'
    );
  }

  return context;
}

function createEmptyRow(): BundleRow {
  return {
    rowKey:
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`,
    componentProductId: '',
    quantity: 1,
  };
}

function formatMoney(priceCents: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(priceCents / 100);
}

export function ProductBundleProvider({
  defaultProductType = 'SINGLE',
  children,
}: {
  defaultProductType?: ProductTypeValue;
  children: ReactNode;
}) {
  const [productType, setProductType] =
    useState<ProductTypeValue>(defaultProductType);

  return (
    <BundleContext.Provider value={{ productType, setProductType }}>
      {children}
    </BundleContext.Provider>
  );
}

export function ProductTypeField({
  helper = 'Choose Single Item or Bundle / Combo.',
}: {
  helper?: string;
}) {
  const { productType, setProductType } = useBundleContext();

  return (
    <label className="grid gap-2">
      <span className="text-sm font-black text-neutral-800">
        Product Type
      </span>

      <select
        name="productType"
        required
        value={productType}
        onChange={(event) =>
          setProductType(event.target.value as ProductTypeValue)
        }
        className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none transition focus:border-[#c99c38] focus:ring-4 focus:ring-[#c99c38]/10"
      >
        <option value="SINGLE">Single Item</option>
        <option value="BUNDLE">Bundle / Combo</option>
      </select>

      <span className="text-xs font-medium leading-relaxed text-neutral-500">
        {helper}
      </span>
    </label>
  );
}

export function DynamicBundleComponentFields({
  componentOptions,
  defaultComponents = [],
  currentProductId,
}: {
  componentOptions: BundleComponentOption[];
  defaultComponents?: BundleComponentValue[];
  currentProductId?: string;
}) {
  const { productType } = useBundleContext();

  const availableComponentOptions = useMemo(() => {
    return componentOptions.filter(
      (option) =>
        option.productType === 'SINGLE' && option.id !== currentProductId
    );
  }, [componentOptions, currentProductId]);

  const [rows, setRows] = useState<BundleRow[]>(() => {
    if (defaultComponents.length) {
      return defaultComponents.map((component, index) => ({
        rowKey: `${component.componentProductId || 'component'}-${index}`,
        componentProductId: component.componentProductId,
        quantity: component.quantity || 1,
      }));
    }

    return [createEmptyRow()];
  });

  const selectedSummary = useMemo(() => {
    return rows
      .map((row) => {
        const option = availableComponentOptions.find(
          (currentOption) => currentOption.id === row.componentProductId
        );

        if (!option) {
          return null;
        }

        return {
          ...option,
          quantity: Math.max(1, Number(row.quantity || 1)),
          subtotalCents:
            Math.max(1, Number(row.quantity || 1)) * option.priceCents,
        };
      })
      .filter(Boolean) as Array<
      BundleComponentOption & {
        quantity: number;
        subtotalCents: number;
      }
    >;
  }, [availableComponentOptions, rows]);

  const normalTotalCents = selectedSummary.reduce(
    (sum, item) => sum + item.subtotalCents,
    0
  );

  function addRow() {
    setRows((currentRows) => [...currentRows, createEmptyRow()]);
  }

  function removeRow(rowKey: string) {
    setRows((currentRows) => {
      const nextRows = currentRows.filter((row) => row.rowKey !== rowKey);

      if (!nextRows.length) {
        return [createEmptyRow()];
      }

      return nextRows;
    });
  }

  function updateRow(
    rowKey: string,
    field: 'componentProductId' | 'quantity',
    value: string
  ) {
    setRows((currentRows) =>
      currentRows.map((row) => {
        if (row.rowKey !== rowKey) {
          return row;
        }

        if (field === 'quantity') {
          return {
            ...row,
            quantity: Math.max(1, Number(value || 1)),
          };
        }

        return {
          ...row,
          componentProductId: value,
        };
      })
    );
  }

  if (productType !== 'BUNDLE') {
    return null;
  }

  return (
    <section className="md:col-span-2">
      <div className="overflow-hidden rounded-[1.75rem] border border-[#c99c38]/35 bg-[#fff8e7] shadow-sm">
        <div className="border-b border-[#c99c38]/20 bg-gradient-to-r from-[#fff3cf] to-white px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#11100b] text-[#c99c38]">
                <PackagePlus className="size-5" />
              </span>

              <div>
                <p className="text-sm font-black text-neutral-950">
                  Bundle Components
                </p>
                <p className="mt-1 text-xs font-bold leading-relaxed text-neutral-600">
                  Add only the single menu items included in this bundle/combo.
                  Components are dynamic now, because apparently we are civilized.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={addRow}
              className="inline-flex h-10 items-center gap-2 rounded-2xl bg-[#11100b] px-4 text-xs font-black text-white transition hover:bg-black"
            >
              <Plus className="size-4 text-[#c99c38]" />
              Add Component
            </button>
          </div>
        </div>

        <div className="p-5">
          {availableComponentOptions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#c99c38]/40 bg-white p-5 text-sm font-bold text-neutral-700">
              Create single menu items first before creating a bundle.
            </div>
          ) : (
            <div className="space-y-3">
              {rows.map((row, index) => (
                <div
                  key={row.rowKey}
                  className="grid gap-3 rounded-2xl border border-[#c99c38]/20 bg-white p-3 md:grid-cols-[minmax(0,1fr)_120px_44px] md:items-end"
                >
                  <label className="grid gap-1">
                    <span className="text-xs font-black uppercase tracking-[0.14em] text-[#9d741f]">
                      Component Item {index + 1}
                    </span>

                    <select
                      name="bundleComponentProductId"
                      value={row.componentProductId}
                      onChange={(event) =>
                        updateRow(
                          row.rowKey,
                          'componentProductId',
                          event.target.value
                        )
                      }
                      className="h-11 min-w-0 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none transition focus:border-[#c99c38] focus:ring-4 focus:ring-[#c99c38]/10"
                    >
                      <option value="">Select component</option>
                      {availableComponentOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.hotel.name} · {option.category.name} ·{' '}
                          {option.name} · {formatMoney(option.priceCents)}
                          {!option.isAvailable ? ' (Hidden)' : ''}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-1">
                    <span className="text-xs font-black uppercase tracking-[0.14em] text-[#9d741f]">
                      Qty
                    </span>

                    <input
                      name="bundleComponentQuantity"
                      type="number"
                      min="1"
                      step="1"
                      value={row.quantity}
                      onChange={(event) =>
                        updateRow(row.rowKey, 'quantity', event.target.value)
                      }
                      className="h-11 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none transition focus:border-[#c99c38] focus:ring-4 focus:ring-[#c99c38]/10"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => removeRow(row.rowKey)}
                    className="grid size-11 place-items-center rounded-2xl border border-red-100 bg-red-50 text-red-600 transition hover:bg-red-100"
                    aria-label={`Remove component ${index + 1}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 grid gap-3 rounded-2xl bg-white p-4 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#9d741f]">
                Bundle Preview
              </p>

              {selectedSummary.length ? (
                <div className="mt-2 space-y-1">
                  {selectedSummary.map((item) => (
                    <p
                      key={item.id}
                      className="text-sm font-bold text-neutral-700"
                    >
                      {item.quantity}× {item.name}{' '}
                      <span className="text-neutral-400">
                        ({formatMoney(item.subtotalCents)})
                      </span>
                    </p>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm font-bold text-neutral-400">
                  No bundle components selected yet.
                </p>
              )}
            </div>

            <div className="rounded-2xl bg-[#11100b] px-5 py-3 text-right">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#c99c38]">
                Normal Total
              </p>
              <p className="mt-1 text-lg font-black text-white">
                {formatMoney(normalTotalCents)}
              </p>
            </div>
          </div>

          <p className="mt-3 rounded-2xl border border-[#c99c38]/20 bg-white/70 p-3 text-xs font-bold leading-relaxed text-neutral-600">
            Example: Breakfast Combo can include 1 Breakfast Pancakes and 1
            Iced Tea. When a guest orders 2 combos, the system can deduct 2
            Pancakes and 2 Iced Tea in inventory.
          </p>
        </div>
      </div>
    </section>
  );
}