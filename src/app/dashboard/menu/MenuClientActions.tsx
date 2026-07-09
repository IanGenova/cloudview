'use client';

import { type ChangeEvent, type ReactNode, useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Trash2, UploadCloud, X } from 'lucide-react';

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

type BulkMenuImportResult = {
  ok?: boolean;
  success?: string;
  summary?: {
    rows: number;
    created: number;
    updated: number;
    skipped: number;
    categoriesCreated: number;
    singleItems: number;
    bundleItems: number;
  };
};

type BulkPreview = {
  rows: number;
  singles: number;
  bundles: number;
  categories: number;
  errors: string[];
};

type BulkHotelOption = {
  id: string;
  name: string;
};

const BULK_MENU_TEMPLATE = `product_type,category,name,price,prep_time_minutes,description,image_url,is_available,components
SINGLE,Breakfast,Classic Pancakes,180,15,"Fluffy pancakes with syrup",https://example.com/pancakes.jpg,TRUE,
SINGLE,Drinks,Iced Tea,85,5,"Freshly brewed iced tea",https://example.com/iced-tea.jpg,TRUE,
BUNDLE,Combos,Breakfast Combo,240,18,"Pancakes with iced tea",https://example.com/breakfast-combo.jpg,TRUE,"Breakfast::Classic Pancakes::1|Drinks::Iced Tea::1"
`;

function parseCsvPreviewRows(csvText: string) {
  const text = csvText.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += character;
      }

      continue;
    }

    if (character === '"') {
      inQuotes = true;
      continue;
    }

    if (character === ',') {
      row.push(field);
      field = '';
      continue;
    }

    if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') {
        index += 1;
      }

      row.push(field);
      field = '';

      if (row.some((cell) => cell.trim())) {
        rows.push(row);
      }

      row = [];
      continue;
    }

    field += character;
  }

  row.push(field);

  if (row.some((cell) => cell.trim())) {
    rows.push(row);
  }

  return {
    rows,
    unclosedQuote: inQuotes,
  };
}

function normalizePreviewHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function createBulkPreview(csvText: string): BulkPreview {
  const parsed = parseCsvPreviewRows(csvText);
  const errors: string[] = [];

  if (parsed.unclosedQuote) {
    errors.push('The CSV contains an unclosed quoted field.');
  }

  if (parsed.rows.length < 2) {
    return {
      rows: 0,
      singles: 0,
      bundles: 0,
      categories: 0,
      errors: [
        ...errors,
        'Add a header row and at least one menu item row.',
      ],
    };
  }

  const aliases: Record<string, string> = {
    type: 'product_type',
    producttype: 'product_type',
    product_type: 'product_type',
    category: 'category',
    category_name: 'category',
    name: 'name',
    product_name: 'name',
    price: 'price',
    price_php: 'price',
    prep_time: 'prep_time_minutes',
    prep_time_minutes: 'prep_time_minutes',
    preparation_time: 'prep_time_minutes',
    description: 'description',
    image: 'image_url',
    image_url: 'image_url',
    available: 'is_available',
    availability: 'is_available',
    is_available: 'is_available',
    components: 'components',
    bundle_components: 'components',
  };

  const columnMap = new Map<string, number>();

  parsed.rows[0].forEach((header, index) => {
    const normalized = normalizePreviewHeader(header);
    const canonical = aliases[normalized] ?? normalized;

    if (!columnMap.has(canonical)) {
      columnMap.set(canonical, index);
    }
  });

  for (const required of ['product_type', 'category', 'name', 'price']) {
    if (!columnMap.has(required)) {
      errors.push(`Missing required column: ${required}`);
    }
  }

  function cell(row: string[], column: string) {
    const index = columnMap.get(column);
    return typeof index === 'number' ? String(row[index] ?? '').trim() : '';
  }

  let singles = 0;
  let bundles = 0;
  const categories = new Set<string>();
  const duplicateKeys = new Set<string>();
  const seenKeys = new Set<string>();

  parsed.rows.slice(1).forEach((row, index) => {
    const rowNumber = index + 2;

    if (!row.some((value) => value.trim())) {
      return;
    }

    const productType = cell(row, 'product_type').toUpperCase();
    const category = cell(row, 'category');
    const name = cell(row, 'name');
    const price = Number(cell(row, 'price').replace(/[₱,\s]/g, ''));
    const components = cell(row, 'components');

    if (['SINGLE', 'ITEM', 'SINGLE ITEM'].includes(productType)) {
      singles += 1;
    } else if (['BUNDLE', 'COMBO', 'BUNDLE / COMBO'].includes(productType)) {
      bundles += 1;

      if (!components) {
        errors.push(`Row ${rowNumber}: bundle components are required.`);
      }
    } else {
      errors.push(`Row ${rowNumber}: type must be SINGLE or BUNDLE.`);
    }

    if (!category) {
      errors.push(`Row ${rowNumber}: category is required.`);
    } else {
      categories.add(category.trim().toLowerCase());
    }

    if (!name) {
      errors.push(`Row ${rowNumber}: name is required.`);
    }

    if (!Number.isFinite(price) || price < 0) {
      errors.push(`Row ${rowNumber}: price is invalid.`);
    }

    const duplicateKey = `${category.trim().toLowerCase()}::${name
      .trim()
      .toLowerCase()}`;

    if (category && name && seenKeys.has(duplicateKey)) {
      duplicateKeys.add(duplicateKey);
    }

    seenKeys.add(duplicateKey);
  });

  if (duplicateKeys.size > 0) {
    errors.push(
      `${duplicateKeys.size} duplicate category/product combination${
        duplicateKeys.size === 1 ? '' : 's'
      } found.`
    );
  }

  return {
    rows: singles + bundles,
    singles,
    bundles,
    categories: categories.size,
    errors: errors.slice(0, 8),
  };
}

function downloadBulkMenuTemplate() {
  const blob = new Blob([BULK_MENU_TEMPLATE], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = 'cloudview-menu-bulk-template.csv';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function formatBulkImportSuccess(result: BulkMenuImportResult) {
  const summary = result.summary;

  if (!summary) {
    return 'Menu import completed successfully.';
  }

  const actionParts = [
    summary.created ? `${summary.created} created` : '',
    summary.updated ? `${summary.updated} updated` : '',
    summary.skipped ? `${summary.skipped} skipped` : '',
  ].filter(Boolean);

  return `${summary.rows} menu row${
    summary.rows === 1 ? '' : 's'
  } processed: ${actionParts.join(', ') || 'no changes'}. ${
    summary.categoriesCreated
      ? `${summary.categoriesCreated} categor${
          summary.categoriesCreated === 1 ? 'y' : 'ies'
        } created.`
      : ''
  }`.trim();
}

export function MenuBulkImportForm({
  action,
  hotels,
  defaultHotelId,
  canChangeHotel,
}: {
  action: MenuServerAction;
  hotels: BulkHotelOption[];
  defaultHotelId: string;
  canChangeHotel: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement | null>(null);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<BulkPreview | null>(null);
  const [clientError, setClientError] = useState('');
  const [isPending, startTransition] = useTransition();

  function closeParentDialog() {
    const dialog = formRef.current?.closest('dialog') as HTMLDialogElement | null;

    if (dialog?.open) {
      dialog.close();
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    setClientError('');
    setPreview(null);
    setFileName(file?.name ?? '');

    if (!file) {
      return;
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
      event.target.value = '';
      setFileName('');
      setClientError('Choose a CSV file.');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      event.target.value = '';
      setFileName('');
      setClientError('The CSV file must be 2 MB or smaller.');
      return;
    }

    try {
      const text = await file.text();
      const nextPreview = createBulkPreview(text);

      setPreview(nextPreview);

      if (nextPreview.rows > 1000) {
        setClientError('Upload no more than 1,000 menu rows at a time.');
      }
    } catch {
      setClientError('Unable to read the selected CSV file.');
    }
  }

  function handleAction(formData: FormData) {
    startTransition(() => {
      void (async () => {
        try {
          const result = (await action(formData)) as BulkMenuImportResult;

          window.dispatchEvent(
            new CustomEvent('cloudview-menu-toast', {
              detail: {
                type: 'success',
                text: formatBulkImportSuccess(result),
              },
            })
          );

          formRef.current?.reset();
          setFileName('');
          setPreview(null);
          setClientError('');
          closeParentDialog();
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

  const hasBlockingErrors = Boolean(
    clientError || !preview || preview.rows === 0 || preview.errors.length > 0
  );

  return (
    <form
      ref={formRef}
      action={handleAction}
      className="space-y-5"
    >
      <div className="rounded-[1.75rem] border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-black text-amber-400">
              <FileSpreadsheet className="size-5" />
            </span>

            <div>
              <h3 className="text-lg font-black text-neutral-950">
                CSV bulk menu importer
              </h3>
              <p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-neutral-600">
                Import up to 1,000 single items and bundles in one file.
                Single items are created first, then bundle components are
                connected automatically.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={downloadBulkMenuTemplate}
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-2xl border border-amber-300 bg-white px-4 py-2 text-xs font-black text-amber-900 transition hover:bg-amber-100"
          >
            <Download className="size-4" />
            Download Template
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="text-sm font-black text-neutral-800">
            Hotel / Property
          </span>

          {canChangeHotel ? (
            <select
              name="hotelId"
              defaultValue={defaultHotelId}
              required
              className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none transition focus:border-[#c99c38] focus:ring-4 focus:ring-[#c99c38]/10"
            >
              <option value="">Select a hotel</option>
              {hotels.map((hotel) => (
                <option key={hotel.id} value={hotel.id}>
                  {hotel.name}
                </option>
              ))}
            </select>
          ) : (
            <>
              <input type="hidden" name="hotelId" value={defaultHotelId} />
              <div className="flex h-11 items-center rounded-2xl border border-neutral-200 bg-neutral-50 px-4 text-sm font-black text-neutral-700">
                {hotels.find((hotel) => hotel.id === defaultHotelId)?.name ??
                  'Assigned hotel'}
              </div>
            </>
          )}

          <span className="text-xs font-medium text-neutral-500">
            Every row in this import will belong to this hotel.
          </span>
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-black text-neutral-800">
            Existing product behavior
          </span>

          <select
            name="duplicateMode"
            defaultValue="UPSERT"
            className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none transition focus:border-[#c99c38] focus:ring-4 focus:ring-[#c99c38]/10"
          >
            <option value="UPSERT">
              Update matching products, create new products
            </option>
            <option value="SKIP_EXISTING">
              Skip products that already exist
            </option>
            <option value="CREATE_ONLY">
              Stop if any product already exists
            </option>
          </select>

          <span className="text-xs font-medium text-neutral-500">
            Matching uses the category name and product name.
          </span>
        </label>
      </div>

      <label className="flex items-start gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
        <input
          type="checkbox"
          name="createMissingCategories"
          defaultChecked
          className="mt-0.5 size-4 accent-black"
        />

        <span>
          <span className="block text-sm font-black text-neutral-900">
            Create missing categories automatically
          </span>
          <span className="mt-1 block text-xs font-medium leading-5 text-neutral-500">
            When disabled, the import stops if a CSV category does not already
            exist for the selected hotel.
          </span>
        </span>
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-black text-neutral-800">
          Menu CSV file
        </span>

        <div className="rounded-[1.5rem] border-2 border-dashed border-neutral-300 bg-neutral-50 p-5 transition focus-within:border-[#c99c38] focus-within:bg-[#fffaf0]">
          <div className="flex flex-col items-center text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-black text-[#c99c38]">
              <UploadCloud className="size-5" />
            </span>

            <p className="mt-3 text-sm font-black text-neutral-900">
              {fileName || 'Choose your completed CSV template'}
            </p>
            <p className="mt-1 text-xs font-medium text-neutral-500">
              CSV only · maximum 2 MB · maximum 1,000 product rows
            </p>

            <input
              name="bulkMenuFile"
              type="file"
              accept=".csv,text/csv"
              required
              onChange={handleFileChange}
              className="mt-4 block w-full max-w-xl rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-bold file:mr-4 file:rounded-xl file:border-0 file:bg-black file:px-4 file:py-2 file:text-xs file:font-black file:text-white"
            />
          </div>
        </div>
      </label>

      {clientError ? (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <p className="text-sm font-black">{clientError}</p>
        </div>
      ) : null}

      {preview ? (
        <section className="overflow-hidden rounded-[1.75rem] border border-neutral-200 bg-white">
          <div className="border-b border-neutral-100 bg-neutral-50 px-5 py-4">
            <h4 className="font-black text-neutral-950">
              Import preview
            </h4>
            <p className="mt-1 text-xs font-semibold text-neutral-500">
              This preview checks the CSV structure. The server performs the
              final hotel, product, and bundle validation.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-px bg-neutral-200 sm:grid-cols-4">
            {[
              ['Rows', preview.rows],
              ['Single Items', preview.singles],
              ['Bundles', preview.bundles],
              ['Categories', preview.categories],
            ].map(([label, value]) => (
              <div key={String(label)} className="bg-white p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-neutral-400">
                  {label}
                </p>
                <p className="mt-1 text-2xl font-black text-neutral-950">
                  {value}
                </p>
              </div>
            ))}
          </div>

          {preview.errors.length ? (
            <div className="border-t border-red-100 bg-red-50 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-600" />
                <div>
                  <p className="text-sm font-black text-red-800">
                    Fix these CSV issues before importing
                  </p>
                  <ul className="mt-2 space-y-1 text-xs font-semibold leading-5 text-red-700">
                    {preview.errors.map((error) => (
                      <li key={error}>• {error}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <div className="border-t border-emerald-100 bg-emerald-50 p-4 text-sm font-black text-emerald-800">
              CSV structure looks ready for server validation.
            </div>
          )}
        </section>
      ) : null}

      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
          Bundle components format
        </p>
        <p className="mt-2 text-sm font-semibold leading-6 text-neutral-700">
          Separate components with <code className="rounded bg-white px-1.5 py-0.5">|</code>.
          Use{' '}
          <code className="rounded bg-white px-1.5 py-0.5">
            Category::Product Name::Quantity
          </code>.
        </p>
        <p className="mt-2 rounded-xl bg-white p-3 font-mono text-xs text-neutral-700">
          Breakfast::Classic Pancakes::1|Drinks::Iced Tea::1
        </p>
      </div>

      <button
        type="submit"
        disabled={isPending || hasBlockingErrors}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-black px-5 py-3 text-sm font-black text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <UploadCloud className="size-4 text-[#c99c38]" />
        )}
        {isPending ? 'Importing menu...' : 'Import Menu CSV'}
      </button>
    </form>
  );
}

