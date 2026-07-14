'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ConciergeBell,
  Minus,
  Plus,
  ReceiptText,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react';
import { ServiceBillingMode } from '@prisma/client';
import { cn } from '@/lib/utils';
import { createPOSOrder } from './actions';
import {
  createXenditPOSCheckout,
  finalizeXenditPOSCheckout,
  getXenditPOSStatus,
} from './xendit-actions';

type POSHotel = {
  id: string;
  name: string;
};

type POSRoom = {
  id: string;
  number: string;
  name?: string | null;
};

type POSProductType = 'SINGLE' | 'BUNDLE';

type POSBundleComponent = {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  availableQty: number;
  soldQty: number;
  canSellQty: number;
  isSoldOut: boolean;
};

type POSProduct = {
  id: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  categoryName: string;
  priceCents: number;

  productType: POSProductType;
  isBundle: boolean;
  isDerivedStock: boolean;

  stockId: string | null;
  availableQty: number;
  soldQty: number;
  isSoldOut: boolean;
  isMenuActive: boolean;

  limitingComponentName: string | null;
  normalBundlePriceCents: number;
  bundleSavingsCents: number;
  bundleComponents: POSBundleComponent[];
};

type POSService = {
  id: string;
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
};

type FoodCartItem = {
  productId: string;
  quantity: number;
};

type ServiceCartItem = {
  serviceId: string;
  quantity: number;
};

type ProductAvailabilityFilter =
  | 'ALL'
  | 'AVAILABLE'
  | 'SOLD_OUT'
  | 'NOT_SET'
  | 'BUNDLE';

type ServiceAvailabilityFilter =
  | 'ALL'
  | 'AVAILABLE'
  | 'SOLD_OUT'
  | 'TRACKED'
  | 'UNTRACKED';

type POSMode = 'food' | 'services';

type POSToast =
  | {
      type: 'success' | 'error';
      text: string;
    }
  | null;

const POS_TOAST_STORAGE_KEY = 'cloudview-pos-toast';
const POS_XENDIT_PENDING_STORAGE_KEY = 'cloudview-pos-xendit-pending';
const POS_XENDIT_PENDING_TTL_MS = 2 * 60 * 60 * 1000;

type StoredPendingPOSXendit = {
  sessionId: string;
  hotelId: string;
  result?: 'success' | 'cancelled';
  createdAt: number;
};

function savePendingPOSXendit(input: StoredPendingPOSXendit) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(
      POS_XENDIT_PENDING_STORAGE_KEY,
      JSON.stringify(input)
    );
  } catch {
    // The URL query remains the primary recovery mechanism.
  }
}

function readPendingPOSXendit(
  selectedHotelId: string
): StoredPendingPOSXendit | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(
      POS_XENDIT_PENDING_STORAGE_KEY
    );

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<StoredPendingPOSXendit>;
    const valid =
      typeof parsed.sessionId === 'string' &&
      parsed.sessionId.trim().length > 0 &&
      parsed.hotelId === selectedHotelId &&
      (typeof parsed.result === 'undefined' ||
        parsed.result === 'success' ||
        parsed.result === 'cancelled') &&
      typeof parsed.createdAt === 'number' &&
      Date.now() - parsed.createdAt <= POS_XENDIT_PENDING_TTL_MS;

    if (!valid) {
      window.sessionStorage.removeItem(
        POS_XENDIT_PENDING_STORAGE_KEY
      );
      return null;
    }

    return parsed as StoredPendingPOSXendit;
  } catch {
    return null;
  }
}

function clearPendingPOSXendit() {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.removeItem(POS_XENDIT_PENDING_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

function readQueuedPOSToast() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const rawToast = window.sessionStorage.getItem(POS_TOAST_STORAGE_KEY);

    if (!rawToast) {
      return null;
    }

    window.sessionStorage.removeItem(POS_TOAST_STORAGE_KEY);

    const parsed = JSON.parse(rawToast) as POSToast;

    if (!parsed || !['success', 'error'].includes(parsed.type)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function queuePOSToast(toast: Exclude<POSToast, null>) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(POS_TOAST_STORAGE_KEY, JSON.stringify(toast));
  } catch {
    // Ignore storage failures. The in-memory toast will still show.
  }
}

function clearQueuedPOSToast() {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.removeItem(POS_TOAST_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

function money(cents: number, currency = 'PHP') {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

function moneyAmount(value: number, currency = 'PHP') {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency,
  }).format(value);
}

function getServiceUnitPriceCents(service: POSService) {
  return Math.round(Number(service.unitPrice || 0) * 100);
}

function isBundleProduct(product: POSProduct) {
  return product.isBundle || product.productType === 'BUNDLE';
}

function getStockStatus(product: POSProduct) {
  if (!product.isMenuActive) {
    return 'MENU_HIDDEN';
  }

  if (product.isDerivedStock && product.bundleComponents.length === 0) {
    return 'NOT_SET';
  }

  if (!product.stockId) {
    return 'NOT_SET';
  }

  if (product.isSoldOut || product.availableQty <= 0) {
    return 'SOLD_OUT';
  }

  return 'AVAILABLE';
}

function getProductStockLabel(product: POSProduct) {
  const status = getStockStatus(product);

  if (status === 'AVAILABLE') {
    return product.isDerivedStock
      ? `${product.availableQty} bundles`
      : `${product.availableQty} left`;
  }

  if (status === 'SOLD_OUT') {
    return product.limitingComponentName
      ? `Sold out: ${product.limitingComponentName}`
      : 'Sold out';
  }

  if (status === 'NOT_SET') {
    return product.isDerivedStock ? 'No components' : 'Stock not set';
  }

  return 'Menu hidden';
}

function getProductStockBadgeClass(product: POSProduct) {
  const status = getStockStatus(product);

  if (status === 'AVAILABLE') {
    return 'bg-emerald-100 text-emerald-700';
  }

  if (status === 'SOLD_OUT') {
    return 'bg-red-100 text-red-700';
  }

  if (status === 'NOT_SET') {
    return 'bg-amber-100 text-amber-700';
  }

  return 'bg-neutral-200 text-neutral-600';
}

function canSellProduct(product: POSProduct) {
  return (
    product.isMenuActive &&
    Boolean(product.stockId) &&
    !product.isSoldOut &&
    product.availableQty > 0 &&
    (!product.isDerivedStock || product.bundleComponents.length > 0)
  );
}

function getServiceStatus(service: POSService) {
  if (!service.isActive) {
    return 'HIDDEN';
  }

  if (!service.inventoryTracked) {
    return 'AVAILABLE';
  }

  if (!service.stockId) {
    return 'NOT_SET';
  }

  if (service.isSoldOut || service.availableQty <= 0) {
    return 'SOLD_OUT';
  }

  return 'AVAILABLE';
}

function canSellService(service: POSService) {
  if (!service.isActive) {
    return false;
  }

  if (!service.inventoryTracked) {
    return true;
  }

  return Boolean(service.stockId) && !service.isSoldOut && service.availableQty > 0;
}

function getServiceStockLabel(service: POSService) {
  const status = getServiceStatus(service);

  if (!service.inventoryTracked) {
    return 'Not tracked';
  }

  if (status === 'AVAILABLE') {
    return `${service.availableQty} left`;
  }

  if (status === 'SOLD_OUT') {
    return 'Sold out';
  }

  if (status === 'NOT_SET') {
    return 'Stock not set';
  }

  return 'Hidden';
}

function getServiceStockBadgeClass(service: POSService) {
  const status = getServiceStatus(service);

  if (!service.inventoryTracked) {
    return 'bg-blue-100 text-blue-700';
  }

  if (status === 'AVAILABLE') {
    return 'bg-emerald-100 text-emerald-700';
  }

  if (status === 'SOLD_OUT') {
    return 'bg-red-100 text-red-700';
  }

  if (status === 'NOT_SET') {
    return 'bg-amber-100 text-amber-700';
  }

  return 'bg-neutral-200 text-neutral-600';
}

function getBillingLabel(service: POSService) {
  if (service.billingMode === ServiceBillingMode.FREE) {
    return 'Free';
  }

  if (service.billingMode === ServiceBillingMode.FIXED_PRICE) {
    return `${moneyAmount(service.unitPrice)}`;
  }

  return 'Confirm price';
}

function getBillingBadgeClass(service: POSService) {
  if (service.billingMode === ServiceBillingMode.FREE) {
    return 'bg-emerald-100 text-emerald-700';
  }

  if (service.billingMode === ServiceBillingMode.FIXED_PRICE) {
    return 'bg-amber-100 text-amber-800';
  }

  return 'bg-blue-100 text-blue-700';
}

function BundleBadge({ product }: { product: POSProduct }) {
  if (!isBundleProduct(product)) {
    return null;
  }

  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800">
      Bundle
    </span>
  );
}

function BundleIncludes({
  product,
  compact = false,
}: {
  product: POSProduct;
  compact?: boolean;
}) {
  if (!isBundleProduct(product)) {
    return null;
  }

  if (!product.bundleComponents.length) {
    return (
      <p className="mt-2 rounded-xl bg-amber-50 p-2 text-xs font-bold text-amber-800">
        No bundle components yet.
      </p>
    );
  }

  const visibleComponents = product.bundleComponents.slice(
    0,
    compact ? 3 : 6
  );

  return (
    <div className="mt-2 rounded-xl bg-amber-50 p-2">
      <p className="text-[10px] font-black uppercase text-amber-700">
        Includes
      </p>

      <div className="mt-1 space-y-0.5">
        {visibleComponents.map((component) => (
          <p key={component.id} className="text-xs font-bold text-amber-900">
            {component.quantity}× {component.name}
          </p>
        ))}

        {product.bundleComponents.length > visibleComponents.length ? (
          <p className="text-xs font-bold text-amber-700">
            +{product.bundleComponents.length - visibleComponents.length} more
          </p>
        ) : null}
      </div>
    </div>
  );
}

function BundleSavings({
  product,
  currency,
}: {
  product: POSProduct;
  currency: string;
}) {
  if (!isBundleProduct(product)) {
    return null;
  }

  if (product.normalBundlePriceCents <= 0 && product.bundleSavingsCents <= 0) {
    return null;
  }

  return (
    <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-black">
      {product.normalBundlePriceCents > 0 ? (
        <span className="rounded-full bg-neutral-100 px-2 py-1 text-neutral-500">
          Normal: {money(product.normalBundlePriceCents, currency)}
        </span>
      ) : null}

      {product.bundleSavingsCents > 0 ? (
        <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-700">
          Save {money(product.bundleSavingsCents, currency)}
        </span>
      ) : null}
    </div>
  );
}

function FloatingPOSToast({
  toast,
  onClose,
}: {
  toast: POSToast;
  onClose: () => void;
}) {
  if (!toast) {
    return null;
  }

  const isSuccess = toast.type === 'success';

  return (
    <div className="fixed right-6 top-24 z-[9999] w-[calc(100%-3rem)] max-w-sm">
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
              <AlertCircle className="size-5" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-[0.18em] opacity-70">
              {isSuccess ? 'Success' : 'Action failed'}
            </p>

            <p className="mt-1 text-sm font-black leading-5">{toast.text}</p>
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

export function POSClient({
  selectedHotelId,
  hotels,
  rooms,
  products,
  services,
  currency,
  returnedXenditSessionId = null,
  returnedXenditResult = null,
}: {
  selectedHotelId: string;
  hotels: POSHotel[];
  rooms: POSRoom[];
  products: POSProduct[];
  services: POSService[];
  currency: string;
  returnedXenditSessionId?: string | null;
  returnedXenditResult?: 'success' | 'cancelled' | null;
}) {
  const router = useRouter();
  const [recoveredXendit, setRecoveredXendit] =
    useState<StoredPendingPOSXendit | null>(null);

  const [mobileView, setMobileView] = useState<'products' | 'cart'>('products');
  const [activeMode, setActiveMode] = useState<POSMode>('food');

  const [foodCart, setFoodCart] = useState<FoodCartItem[]>([]);
  const [serviceCart, setServiceCart] = useState<ServiceCartItem[]>([]);

  const [productQuery, setProductQuery] = useState('');
  const [productCategory, setProductCategory] = useState('All');
  const [productAvailabilityFilter, setProductAvailabilityFilter] =
    useState<ProductAvailabilityFilter>('ALL');

  const [serviceQuery, setServiceQuery] = useState('');
  const [serviceCategory, setServiceCategory] = useState('All');
  const [serviceAvailabilityFilter, setServiceAvailabilityFilter] =
    useState<ServiceAvailabilityFilter>('ALL');

  const [guestName, setGuestName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<
    'CASH' | 'POS' | 'XENDIT' | 'ROOM_CHARGE' | 'PAY_AT_COUNTER'
  >('CASH');
  const [cashTendered, setCashTendered] = useState('');
  const [lastReceiptLabel, setLastReceiptLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<POSToast>(null);

  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const queuedToast = readQueuedPOSToast();

    if (queuedToast) {
      setToast(queuedToast);
    }
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setToast(null);
      clearQueuedPOSToast();
    }, 4500);

    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (returnedXenditSessionId) {
      setRecoveredXendit(null);
      return;
    }

    setRecoveredXendit(readPendingPOSXendit(selectedHotelId));
  }, [returnedXenditSessionId, selectedHotelId]);

  const activeXenditSessionId =
    returnedXenditSessionId || recoveredXendit?.sessionId || null;
  const activeXenditResult =
    returnedXenditResult || recoveredXendit?.result || null;

  useEffect(() => {
    if (!activeXenditSessionId) {
      return;
    }

    const paymentSessionId = activeXenditSessionId;

    let cancelled = false;
    let timer: number | null = null;

    function cleanXenditQuery() {
      const url = new URL(window.location.href);
      url.searchParams.delete('xendit');
      url.searchParams.delete('xenditResult');
      router.replace(`${url.pathname}${url.search}`, { scroll: false });
    }

    if (activeXenditResult === 'cancelled') {
      clearPendingPOSXendit();
      setRecoveredXendit(null);
      showError('Xendit checkout was cancelled. No sale was created.');
      cleanXenditQuery();
      return;
    }

    async function waitForPaymentConfirmation(attempt = 0) {
      try {
        const status = await getXenditPOSStatus(paymentSessionId);

        if (cancelled) return;

        if (!status.ok) {
          showError(status.error);
          cleanXenditQuery();
          return;
        }

        if (status.status === 'COMPLETED') {
          const parts = [
            status.orderCode ? `Order ${status.orderCode}` : null,
            status.serviceRequestCodes.length
              ? `Requests ${status.serviceRequestCodes.join(', ')}`
              : null,
          ].filter(Boolean);

          clearPendingPOSXendit();
          setRecoveredXendit(null);
          clearCart();
          setLastReceiptLabel(parts.join(' · ') || 'Sale completed');
          showSuccessAfterRefresh('Xendit payment confirmed and POS sale completed.');
          cleanXenditQuery();
          router.refresh();
          return;
        }

        if (status.status === 'PAID') {
          const result = await finalizeXenditPOSCheckout(paymentSessionId);

          if (cancelled) return;

          if (result.ok) {
            const parts = [
              result.orderCode ? `Order ${result.orderCode}` : null,
              result.serviceRequestCodes.length
                ? `Requests ${result.serviceRequestCodes.join(', ')}`
                : null,
            ].filter(Boolean);

            clearPendingPOSXendit();
            setRecoveredXendit(null);
            clearCart();
            setLastReceiptLabel(parts.join(' · ') || 'Sale completed');
            showSuccessAfterRefresh(
              'Xendit payment confirmed and POS sale completed.'
            );
            cleanXenditQuery();
            router.refresh();
            return;
          }

          if (!result.waiting) {
            showError(result.error);
            cleanXenditQuery();
            return;
          }
        }

        if (
          status.status === 'FAILED' ||
          status.status === 'PAID_REVIEW_REQUIRED'
        ) {
          clearPendingPOSXendit();
          setRecoveredXendit(null);
          showError(
            status.errorMessage ||
              'The Xendit payment needs manual review.'
          );
          cleanXenditQuery();
          return;
        }

        if (attempt >= 39) {
          showError(
            'Payment is still being confirmed. Open this POS session again in a moment.'
          );
          cleanXenditQuery();
          return;
        }

        timer = window.setTimeout(
          () => waitForPaymentConfirmation(attempt + 1),
          1500
        );
      } catch (err) {
        if (cancelled) return;

        showError(
          err instanceof Error
            ? err.message
            : 'Unable to confirm the Xendit payment.'
        );
        cleanXenditQuery();
      }
    }

    void waitForPaymentConfirmation();

    return () => {
      cancelled = true;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
    // The return identifiers should be handled only once per page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeXenditSessionId,
    activeXenditResult,
    router,
  ]);

  function showToast(nextToast: Exclude<POSToast, null>) {
    clearQueuedPOSToast();
    setToast(nextToast);
  }

  function showError(message: string) {
    setError(message);
    showToast({
      type: 'error',
      text: message,
    });
  }

  function showSuccessAfterRefresh(message: string) {
    const nextToast = {
      type: 'success' as const,
      text: message,
    };

    setToast(nextToast);
    queuePOSToast(nextToast);
  }

  const productMap = useMemo(() => {
    return new Map(products.map((product) => [product.id, product]));
  }, [products]);

  const serviceMap = useMemo(() => {
    return new Map(services.map((service) => [service.id, service]));
  }, [services]);

  const productCategories = useMemo(() => {
    return [
      'All',
      ...Array.from(new Set(products.map((product) => product.categoryName))),
    ];
  }, [products]);

  const serviceCategories = useMemo(() => {
    return [
      'All',
      ...Array.from(new Set(services.map((service) => service.category))),
    ];
  }, [services]);

  const filteredProducts = useMemo(() => {
    const lowerQuery = productQuery.trim().toLowerCase();

    return products.filter((product) => {
      const stockStatus = getStockStatus(product);

      const matchesCategory =
        productCategory === 'All' || product.categoryName === productCategory;

      const matchesAvailability =
        productAvailabilityFilter === 'ALL' ||
        (productAvailabilityFilter === 'AVAILABLE' &&
          stockStatus === 'AVAILABLE') ||
        (productAvailabilityFilter === 'SOLD_OUT' &&
          stockStatus === 'SOLD_OUT') ||
        (productAvailabilityFilter === 'NOT_SET' &&
          stockStatus === 'NOT_SET') ||
        (productAvailabilityFilter === 'BUNDLE' && product.isDerivedStock);

      const componentText = product.bundleComponents
        .map((component) => component.name)
        .join(' ');

      const matchesSearch =
        !lowerQuery ||
        `${product.name} ${product.description || ''} ${
          product.categoryName
        } ${componentText} ${product.limitingComponentName || ''}`
          .toLowerCase()
          .includes(lowerQuery);

      return matchesCategory && matchesAvailability && matchesSearch;
    });
  }, [
    productAvailabilityFilter,
    productCategory,
    products,
    productQuery,
  ]);

  const filteredServices = useMemo(() => {
    const lowerQuery = serviceQuery.trim().toLowerCase();

    return services.filter((service) => {
      const status = getServiceStatus(service);

      const matchesCategory =
        serviceCategory === 'All' || service.category === serviceCategory;

      const matchesAvailability =
        serviceAvailabilityFilter === 'ALL' ||
        (serviceAvailabilityFilter === 'AVAILABLE' &&
          status === 'AVAILABLE') ||
        (serviceAvailabilityFilter === 'SOLD_OUT' &&
          status === 'SOLD_OUT') ||
        (serviceAvailabilityFilter === 'TRACKED' &&
          service.inventoryTracked) ||
        (serviceAvailabilityFilter === 'UNTRACKED' &&
          !service.inventoryTracked);

      const matchesSearch =
        !lowerQuery ||
        `${service.name} ${service.description || ''} ${service.category} ${
          service.code
        }`
          .toLowerCase()
          .includes(lowerQuery);

      return matchesCategory && matchesAvailability && matchesSearch;
    });
  }, [serviceAvailabilityFilter, serviceCategory, services, serviceQuery]);

  const foodSubtotal = foodCart.reduce((sum, item) => {
    const product = productMap.get(item.productId);

    return sum + (product?.priceCents || 0) * item.quantity;
  }, 0);

  const serviceSubtotal = serviceCart.reduce((sum, item) => {
    const service = serviceMap.get(item.serviceId);

    if (!service || service.billingMode !== ServiceBillingMode.FIXED_PRICE) {
      return sum;
    }

    return sum + getServiceUnitPriceCents(service) * item.quantity;
  }, 0);

  const total = foodSubtotal + serviceSubtotal;
  const foodItemCount = foodCart.reduce((sum, item) => sum + item.quantity, 0);
  const serviceItemCount = serviceCart.reduce(
    (sum, item) => sum + item.quantity,
    0
  );
  const itemCount = foodItemCount + serviceItemCount;

  const cashValue = Number(cashTendered || 0) * 100;
  const change = paymentMethod === 'CASH' ? Math.max(0, cashValue - total) : 0;

  function addFoodItem(productId: string) {
    setLastReceiptLabel(null);
    setError(null);

    const product = productMap.get(productId);

    if (!product) {
      setError('Menu item was not found.');
      return;
    }

    if (!canSellProduct(product)) {
      setError(`${product.name} is not available for sale.`);
      return;
    }

    setFoodCart((current) => {
      const existing = current.find((item) => item.productId === productId);
      const existingQty = existing?.quantity ?? 0;

      if (existingQty + 1 > product.availableQty) {
        setError(
          `${product.name} only has ${product.availableQty} available.`
        );
        return current;
      }

      if (existing) {
        return current.map((item) =>
          item.productId === productId
            ? {
                ...item,
                quantity: item.quantity + 1,
              }
            : item
        );
      }

      return [
        ...current,
        {
          productId,
          quantity: 1,
        },
      ];
    });
  }

  function addServiceItem(serviceId: string) {
    setLastReceiptLabel(null);
    setError(null);

    const service = serviceMap.get(serviceId);

    if (!service) {
      setError('Service item was not found.');
      return;
    }

    if (!canSellService(service)) {
      setError(`${service.name} is not available.`);
      return;
    }

    setServiceCart((current) => {
      const existing = current.find((item) => item.serviceId === serviceId);
      const existingQty = existing?.quantity ?? 0;
      const maxQty = service.inventoryTracked ? service.availableQty : 20;

      if (existingQty + 1 > maxQty) {
        setError(`${service.name} only has ${maxQty} available.`);
        return current;
      }

      if (existing) {
        return current.map((item) =>
          item.serviceId === serviceId
            ? {
                ...item,
                quantity: item.quantity + 1,
              }
            : item
        );
      }

      return [
        ...current,
        {
          serviceId,
          quantity: 1,
        },
      ];
    });
  }

  function updateFoodQty(productId: string, quantity: number) {
    setError(null);

    const product = productMap.get(productId);

    if (!product) {
      return;
    }

    if (quantity > product.availableQty) {
      setError(`${product.name} only has ${product.availableQty} available.`);
      return;
    }

    setFoodCart((current) =>
      current
        .map((item) =>
          item.productId === productId
            ? {
                ...item,
                quantity,
              }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  function updateServiceQty(serviceId: string, quantity: number) {
    setError(null);

    const service = serviceMap.get(serviceId);

    if (!service) {
      return;
    }

    const maxQty = service.inventoryTracked ? service.availableQty : 20;

    if (quantity > maxQty) {
      setError(`${service.name} only has ${maxQty} available.`);
      return;
    }

    setServiceCart((current) =>
      current
        .map((item) =>
          item.serviceId === serviceId
            ? {
                ...item,
                quantity,
              }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  function clearCart() {
    setFoodCart([]);
    setServiceCart([]);
    setGuestName('');
    setRoomId('');
    setNotes('');
    setCashTendered('');
    setError(null);
  }

  function validateCartAgainstStock() {
    for (const item of foodCart) {
      const product = productMap.get(item.productId);

      if (!product) {
        return 'One or more food cart items no longer exist.';
      }

      if (!canSellProduct(product)) {
        return `${product.name} is no longer available.`;
      }

      if (item.quantity > product.availableQty) {
        return `${product.name} only has ${product.availableQty} available.`;
      }
    }

    for (const item of serviceCart) {
      const service = serviceMap.get(item.serviceId);

      if (!service) {
        return 'One or more service cart items no longer exist.';
      }

      if (!canSellService(service)) {
        return `${service.name} is no longer available.`;
      }

      const maxQty = service.inventoryTracked ? service.availableQty : 20;

      if (item.quantity > maxQty) {
        return `${service.name} only has ${maxQty} available.`;
      }
    }

    return null;
  }

  function completeSale() {
    setError(null);

    if (foodCart.length === 0 && serviceCart.length === 0) {
      showError('Please add at least one food item or service item.');
      return;
    }

    const stockError = validateCartAgainstStock();

    if (stockError) {
      showError(stockError);
      return;
    }

    if (paymentMethod === 'CASH' && cashValue < total) {
      showError('Cash tendered is lower than the total amount.');
      return;
    }

    startTransition(async () => {
      try {
        if (paymentMethod === 'XENDIT') {
          const checkout = await createXenditPOSCheckout({
            hotelId: selectedHotelId,
            roomId: roomId || null,
            guestName,
            notes,
            items: foodCart,
            services: serviceCart,
          });

          if (!checkout.ok) {
            showError(checkout.error);
            return;
          }

          savePendingPOSXendit({
            sessionId: checkout.sessionId,
            hotelId: selectedHotelId,
            createdAt: Date.now(),
          });

          queuePOSToast({
            type: 'success',
            text: 'Opening secure Xendit checkout...',
          });
          window.location.assign(checkout.checkoutUrl);
          return;
        }

        const response = await createPOSOrder({
          hotelId: selectedHotelId,
          roomId: roomId || null,
          guestName,
          notes,
          paymentMethod,
          items: foodCart,
          services: serviceCart,
        });

        if (response.ok) {
          const parts = [
            response.orderCode ? `Order ${response.orderCode}` : null,
            response.serviceRequestCodes?.length
              ? `Requests ${response.serviceRequestCodes.join(', ')}`
              : null,
          ].filter(Boolean);

          const receiptLabel = parts.join(' · ') || 'Sale completed';

          setLastReceiptLabel(receiptLabel);
          clearCart();
          setMobileView('products');

          showSuccessAfterRefresh(`POS sale completed. Food orders were sent to Preparing. ${receiptLabel}`);

          window.setTimeout(() => {
            router.refresh();
          }, 350);
        }
      } catch (err) {
        showError(
          err instanceof Error ? err.message : 'Unable to complete POS sale.'
        );
      }
    });
  }

  return (
    <div className="relative pb-20 text-[13px] lg:pb-0">
      <FloatingPOSToast
        toast={toast}
        onClose={() => {
          setToast(null);
          clearQueuedPOSToast();
        }}
      />

      <div className="mb-3 grid grid-cols-2 gap-2 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileView('products')}
          className={cn(
            'min-h-12 rounded-2xl border px-4 py-3 text-sm font-black',
            mobileView === 'products'
              ? 'border-black bg-black text-white'
              : 'border-neutral-200 bg-white text-black'
          )}
        >
          Products
        </button>

        <button
          type="button"
          onClick={() => setMobileView('cart')}
          className={cn(
            'relative min-h-12 rounded-2xl border px-4 py-3 text-sm font-black',
            mobileView === 'cart'
              ? 'border-black bg-black text-white'
              : 'border-neutral-200 bg-white text-black'
          )}
        >
          Cart

          {itemCount > 0 ? (
            <span className="ml-2 rounded-full bg-gold px-2 py-0.5 text-xs text-black">
              {itemCount}
            </span>
          ) : null}
        </button>
      </div>

      <div className="mb-3 flex flex-col gap-2 rounded-[1.5rem] border border-neutral-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#b88938]">
            POS Terminal
          </p>
          <h1 className="mt-0.5 text-xl font-black text-[#11100b]">
            Quick Sale
          </h1>
        </div>

        <div className="flex flex-wrap gap-2 text-[11px] font-black">
          <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-600">
            {itemCount} item{itemCount === 1 ? '' : 's'}
          </span>
          <span className="rounded-full bg-[#fff8e7] px-3 py-1 text-[#9a6b18]">
            {money(total, currency)}
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <section
          className={cn(
            'min-w-0',
            mobileView === 'cart' ? 'hidden lg:block' : 'block'
          )}
        >
          <div className="mb-3 rounded-[1.5rem] border border-neutral-200 bg-white p-3 shadow-sm">
            <div className="mb-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setActiveMode('food')}
                className={
                  activeMode === 'food'
                    ? 'h-10 rounded-xl bg-black px-3 text-xs font-black text-white'
                    : 'h-10 rounded-xl border border-neutral-200 bg-white px-3 text-xs font-black text-neutral-700 hover:bg-neutral-50'
                }
              >
                Food Menu
              </button>

              <button
                type="button"
                onClick={() => setActiveMode('services')}
                className={
                  activeMode === 'services'
                    ? 'h-10 rounded-xl bg-black px-3 text-xs font-black text-white'
                    : 'h-10 rounded-xl border border-neutral-200 bg-white px-3 text-xs font-black text-neutral-700 hover:bg-neutral-50'
                }
              >
                Services
              </button>
            </div>

            <div className="grid gap-2 md:grid-cols-[220px_1fr_200px]">
              <div>
                <label className="mb-1 block text-[10px] font-black uppercase tracking-wide text-neutral-500">
                  Hotel
                </label>
                <select
                  value={selectedHotelId}
                  onChange={(event) => {
                    router.replace(`/dashboard/pos?hotelId=${event.target.value}`, { scroll: false });
                  }}
                  className="h-10 w-full rounded-xl border border-neutral-200 bg-white px-3 text-xs font-bold outline-none"
                >
                  {hotels.map((hotel) => (
                    <option key={hotel.id} value={hotel.id}>
                      {hotel.name}
                    </option>
                  ))}
                </select>
              </div>

              {activeMode === 'food' ? (
                <>
                  <div>
                    <label className="mb-1 block text-[10px] font-black uppercase tracking-wide text-neutral-500">
                      Search Food Product
                    </label>
                    <div className="flex h-10 items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3">
                      <Search className="size-4 shrink-0 text-neutral-400" />
                      <input
                        value={productQuery}
                        onChange={(event) => setProductQuery(event.target.value)}
                        placeholder="Search product, bundle, or component..."
                        className="w-full bg-transparent text-xs font-semibold outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-[10px] font-black uppercase tracking-wide text-neutral-500">
                      Food Stock Filter
                    </label>
                    <select
                      value={productAvailabilityFilter}
                      onChange={(event) =>
                        setProductAvailabilityFilter(
                          event.target.value as ProductAvailabilityFilter
                        )
                      }
                      className="h-10 w-full rounded-xl border border-neutral-200 bg-white px-3 text-xs font-bold outline-none"
                    >
                      <option value="ALL">All Products</option>
                      <option value="AVAILABLE">Available</option>
                      <option value="SOLD_OUT">Sold Out</option>
                      <option value="NOT_SET">Stock Not Set</option>
                      <option value="BUNDLE">Bundles Only</option>
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="mb-1 block text-[10px] font-black uppercase tracking-wide text-neutral-500">
                      Search Service
                    </label>
                    <div className="flex h-10 items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3">
                      <Search className="size-4 shrink-0 text-neutral-400" />
                      <input
                        value={serviceQuery}
                        onChange={(event) => setServiceQuery(event.target.value)}
                        placeholder="Search service request item..."
                        className="w-full bg-transparent text-xs font-semibold outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-[10px] font-black uppercase tracking-wide text-neutral-500">
                      Service Filter
                    </label>
                    <select
                      value={serviceAvailabilityFilter}
                      onChange={(event) =>
                        setServiceAvailabilityFilter(
                          event.target.value as ServiceAvailabilityFilter
                        )
                      }
                      className="h-10 w-full rounded-xl border border-neutral-200 bg-white px-3 text-xs font-bold outline-none"
                    >
                      <option value="ALL">All Services</option>
                      <option value="AVAILABLE">Available</option>
                      <option value="SOLD_OUT">Sold Out</option>
                      <option value="TRACKED">Inventory Tracked</option>
                      <option value="UNTRACKED">Not Tracked</option>
                    </select>
                  </div>
                </>
              )}
            </div>

            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {(activeMode === 'food' ? productCategories : serviceCategories).map(
                (item) => {
                  const active =
                    activeMode === 'food'
                      ? productCategory === item
                      : serviceCategory === item;

                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => {
                        if (activeMode === 'food') {
                          setProductCategory(item);
                        } else {
                          setServiceCategory(item);
                        }
                      }}
                      className={cn(
                        'shrink-0 touch-manipulation rounded-full border px-3 py-1.5 text-xs font-black transition active:scale-95',
                        active
                          ? 'border-black bg-black text-white'
                          : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100'
                      )}
                    >
                      {item}
                    </button>
                  );
                }
              )}
            </div>
          </div>

          {activeMode === 'food' ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {filteredProducts.map((product) => {
                const sellable = canSellProduct(product);

                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => addFoodItem(product.id)}
                    disabled={!sellable}
                    className={cn(
                      'touch-manipulation overflow-hidden rounded-[1.25rem] border border-neutral-200 bg-white text-left shadow-sm transition active:scale-[0.99]',
                      sellable
                        ? 'hover:-translate-y-0.5 hover:shadow-lg'
                        : 'cursor-not-allowed opacity-60'
                    )}
                  >
                    <div
                      className="relative h-24 bg-neutral-100 bg-cover bg-center sm:h-28"
                      style={{
                        backgroundImage: product.imageUrl
                          ? `url(${product.imageUrl})`
                          : undefined,
                      }}
                    >
                      <span
                        className={`absolute left-2 top-2 max-w-[calc(100%-1rem)] truncate rounded-full px-2 py-0.5 text-[9px] font-black ${getProductStockBadgeClass(
                          product
                        )}`}
                      >
                        {getProductStockLabel(product)}
                      </span>

                      {!sellable ? (
                        <div className="absolute inset-0 grid place-items-center bg-white/70">
                          <span className="rounded-full bg-black px-3 py-1.5 text-[11px] font-black text-white">
                            Not Available
                          </span>
                        </div>
                      ) : null}
                    </div>

                    <div className="p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-sm font-black">
                              {product.name}
                            </h3>
                            <BundleBadge product={product} />
                          </div>

                          <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-neutral-500">
                            {product.description || 'No description'}
                          </p>

                          <BundleSavings
                            product={product}
                            currency={currency}
                          />
                          <BundleIncludes product={product} compact />
                        </div>

                        <span
                          className={cn(
                            'grid size-8 shrink-0 place-items-center rounded-full',
                            sellable
                              ? 'bg-black text-white'
                              : 'bg-neutral-200 text-neutral-400'
                          )}
                        >
                          <Plus className="size-4" />
                        </span>
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <p className="text-sm font-black text-gold">
                          {money(product.priceCents, currency)}
                        </p>

                        <p className="text-[11px] font-bold text-neutral-400">
                          Sold: {product.soldQty}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}

              {filteredProducts.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-neutral-200 bg-white p-8 text-center sm:col-span-2 xl:col-span-3 2xl:col-span-4">
                  <p className="font-black text-neutral-600">
                    No food products found
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    Try another keyword, category, or stock filter.
                  </p>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {filteredServices.map((service) => {
                const sellable = canSellService(service);

                return (
                  <button
                    key={service.id}
                    type="button"
                    onClick={() => addServiceItem(service.id)}
                    disabled={!sellable}
                    className={cn(
                      'touch-manipulation overflow-hidden rounded-2xl border border-neutral-200 bg-white p-2.5 text-left shadow-sm transition active:scale-[0.99]',
                      sellable
                        ? 'hover:-translate-y-0.5 hover:shadow-lg'
                        : 'cursor-not-allowed opacity-60'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="grid size-9 place-items-center rounded-xl bg-blue-50 text-blue-700">
                            <ConciergeBell className="size-4" />
                          </div>

                          <div className="min-w-0">
                            <h3 className="truncate text-sm font-black">
                              {service.name}
                            </h3>
                            <p className="text-[11px] font-bold text-neutral-400">
                              {service.category}
                            </p>
                          </div>
                        </div>

                        <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-neutral-500">
                          {service.description || 'No description'}
                        </p>

                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[9px] font-black ${getServiceStockBadgeClass(
                              service
                            )}`}
                          >
                            {getServiceStockLabel(service)}
                          </span>

                          <span
                            className={`rounded-full px-2 py-0.5 text-[9px] font-black ${getBillingBadgeClass(
                              service
                            )}`}
                          >
                            {getBillingLabel(service)}
                          </span>
                        </div>
                      </div>

                      <span
                        className={cn(
                          'grid size-8 shrink-0 place-items-center rounded-full',
                          sellable
                            ? 'bg-black text-white'
                            : 'bg-neutral-200 text-neutral-400'
                        )}
                      >
                        <Plus className="size-4" />
                      </span>
                    </div>
                  </button>
                );
              })}

              {filteredServices.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-neutral-200 bg-white p-8 text-center sm:col-span-2 xl:col-span-3 2xl:col-span-4">
                  <p className="font-black text-neutral-600">
                    No service items found
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    Try another keyword, category, or service filter.
                  </p>
                </div>
              ) : null}
            </div>
          )}
        </section>

        <aside
          className={cn(
            'lg:sticky lg:top-20 lg:h-[calc(100vh-6rem)]',
            mobileView === 'products' ? 'hidden lg:block' : 'block'
          )}
        >
          <section className="flex min-h-[70vh] flex-col overflow-hidden rounded-[1.5rem] border border-neutral-200 bg-white shadow-sm lg:h-full">
            <div className="border-b border-neutral-100 bg-black p-4 text-white">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setMobileView('products')}
                    className="grid size-9 place-items-center rounded-full bg-white/10 lg:hidden"
                    aria-label="Back to products"
                  >
                    <ArrowLeft className="size-4" />
                  </button>

                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gold">
                      Cloud View POS
                    </p>
                    <h2 className="mt-0.5 text-xl font-black">Current Sale</h2>
                  </div>
                </div>

                <div className="relative">
                  <ShoppingCart className="size-6 text-gold" />

                  {itemCount > 0 ? (
                    <span className="absolute -right-2 -top-2 grid size-5 place-items-center rounded-full bg-gold text-[10px] font-black text-black">
                      {itemCount}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {lastReceiptLabel ? (
                <div className="mb-3 rounded-[1.25rem] border border-green-200 bg-green-50 p-3 text-green-800">
                  <p className="font-black">Sale completed</p>
                  <p className="mt-1 text-sm font-semibold">
                    {lastReceiptLabel}
                  </p>
                </div>
              ) : null}

              {foodCart.length === 0 && serviceCart.length === 0 ? (
                <div className="grid min-h-40 place-items-center rounded-[1.25rem] border border-dashed border-neutral-200 bg-neutral-50 p-5 text-center">
                  <div>
                    <ReceiptText className="mx-auto size-7 text-neutral-400" />
                    <p className="mt-2 font-black text-neutral-600">
                      Cart is empty
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">
                      Tap available food or service items to add them.
                    </p>
                  </div>
                </div>
              ) : null}

              {foodCart.length > 0 ? (
                <div className="mb-3">
                  <p className="mb-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-neutral-400">
                    Food Menu
                  </p>

                  <div className="space-y-2">
                    {foodCart.map((item) => {
                      const product = productMap.get(item.productId);

                      if (!product) return null;

                      return (
                        <div
                          key={item.productId}
                          className="rounded-2xl border border-neutral-200 bg-white p-2.5"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="truncate font-black">
                                  {product.name}
                                </h3>
                                <BundleBadge product={product} />
                              </div>

                              <p className="mt-1 text-sm font-bold text-neutral-500">
                                {money(product.priceCents, currency)}
                              </p>

                              <p className="mt-1 text-[11px] font-bold text-neutral-400">
                                {product.isDerivedStock
                                  ? `Can sell: ${product.availableQty}`
                                  : `Stock left: ${product.availableQty}`}
                              </p>

                              <BundleIncludes product={product} compact />
                            </div>

                            <button
                              type="button"
                              onClick={() => updateFoodQty(item.productId, 0)}
                              className="grid size-8 touch-manipulation place-items-center rounded-full bg-red-50 text-red-600 active:scale-95"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>

                          <div className="mt-3 flex items-center justify-between">
                            <QuantityControls
                              quantity={item.quantity}
                              onDecrease={() =>
                                updateFoodQty(item.productId, item.quantity - 1)
                              }
                              onIncrease={() =>
                                updateFoodQty(item.productId, item.quantity + 1)
                              }
                              disableIncrease={
                                item.quantity >= product.availableQty
                              }
                            />

                            <p className="font-black">
                              {money(
                                product.priceCents * item.quantity,
                                currency
                              )}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {serviceCart.length > 0 ? (
                <div className="mb-3">
                  <p className="mb-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-neutral-400">
                    Services
                  </p>

                  <div className="space-y-2">
                    {serviceCart.map((item) => {
                      const service = serviceMap.get(item.serviceId);

                      if (!service) return null;

                      const serviceLineTotal =
                        service.billingMode === ServiceBillingMode.FIXED_PRICE
                          ? getServiceUnitPriceCents(service) * item.quantity
                          : 0;

                      const maxQty = service.inventoryTracked
                        ? service.availableQty
                        : 20;

                      return (
                        <div
                          key={item.serviceId}
                          className="rounded-2xl border border-blue-100 bg-white p-2.5"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="truncate font-black">
                                  {service.name}
                                </h3>

                                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-black text-blue-700">
                                  Service
                                </span>
                              </div>

                              <p className="mt-1 text-sm font-bold text-neutral-500">
                                {getBillingLabel(service)}
                              </p>

                              <p className="mt-1 text-[11px] font-bold text-neutral-400">
                                {service.inventoryTracked
                                  ? `Stock left: ${service.availableQty}`
                                  : 'Inventory not tracked'}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => updateServiceQty(item.serviceId, 0)}
                              className="grid size-8 touch-manipulation place-items-center rounded-full bg-red-50 text-red-600 active:scale-95"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>

                          <div className="mt-3 flex items-center justify-between">
                            <QuantityControls
                              quantity={item.quantity}
                              onDecrease={() =>
                                updateServiceQty(
                                  item.serviceId,
                                  item.quantity - 1
                                )
                              }
                              onIncrease={() =>
                                updateServiceQty(
                                  item.serviceId,
                                  item.quantity + 1
                                )
                              }
                              disableIncrease={item.quantity >= maxQty}
                            />

                            <p className="font-black">
                              {service.billingMode ===
                              ServiceBillingMode.FIXED_PRICE
                                ? money(serviceLineTotal, currency)
                                : '—'}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="mt-5 space-y-2">
                <div>
                  <label className="mb-1 block text-[10px] font-black uppercase tracking-wide text-neutral-500">
                    Customer / Guest Name
                  </label>
                  <input
                    value={guestName}
                    onChange={(event) => setGuestName(event.target.value)}
                    placeholder="Customer / guest name"
                    className="h-10 w-full rounded-xl border border-neutral-200 px-3 text-xs font-semibold outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[10px] font-black uppercase tracking-wide text-neutral-500">
                    Room / Customer Type
                  </label>
                  <select
                    value={roomId}
                    onChange={(event) => setRoomId(event.target.value)}
                    className="h-10 w-full rounded-xl border border-neutral-200 bg-white px-3 text-xs font-semibold outline-none"
                  >
                    <option value="">No room / walk-in customer</option>
                    {rooms.map((room) => (
                      <option key={room.id} value={room.id}>
                        Room {room.number} {room.name ? `- ${room.name}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-[10px] font-black uppercase tracking-wide text-neutral-500">
                    Payment Method
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(event) =>
                      setPaymentMethod(
                        event.target.value as typeof paymentMethod
                      )
                    }
                    className="h-10 w-full rounded-xl border border-neutral-200 bg-white px-3 text-xs font-semibold outline-none"
                  >
                    <option value="CASH">Cash</option>
                    <option value="XENDIT">Card / E-wallet / QR Ph (Xendit)</option>
                    <option value="ROOM_CHARGE">Room Charge</option>
                    <option value="PAY_AT_COUNTER">Pay Later</option>
                  </select>
                  <p className="mt-1 text-[11px] font-bold text-neutral-500">
                    Cash, room charge, and pay-later sales follow the hotel workflow. Card, e-wallet, and QR payments open Xendit's secure checkout and create the POS sale only after payment confirmation.
                  </p>
                </div>

                {paymentMethod === 'CASH' ? (
                  <div>
                    <label className="mb-1 block text-[10px] font-black uppercase tracking-wide text-neutral-500">
                      Cash Tendered
                    </label>
                    <input
                      value={cashTendered}
                      onChange={(event) => setCashTendered(event.target.value)}
                      placeholder="Cash tendered"
                      type="number"
                      min="0"
                      step="0.01"
                      className="h-10 w-full rounded-xl border border-neutral-200 px-3 text-xs font-semibold outline-none"
                    />
                  </div>
                ) : null}

                <div>
                  <label className="mb-1 block text-[10px] font-black uppercase tracking-wide text-neutral-500">
                    Order / Service Notes
                  </label>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Order notes"
                    className="min-h-16 w-full resize-none rounded-xl border border-neutral-200 p-3 text-xs font-semibold outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-neutral-100 bg-neutral-50 p-3">
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="font-bold text-neutral-500">Food</span>
                  <span className="font-black">
                    {money(foodSubtotal, currency)}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="font-bold text-neutral-500">Services</span>
                  <span className="font-black">
                    {money(serviceSubtotal, currency)}
                  </span>
                </div>

                <div className="flex justify-between text-base">
                  <span className="font-black">Total</span>
                  <span className="font-black">{money(total, currency)}</span>
                </div>

                {paymentMethod === 'CASH' ? (
                  <div className="flex justify-between">
                    <span className="font-bold text-neutral-500">Change</span>
                    <span className="font-black">
                      {money(change, currency)}
                    </span>
                  </div>
                ) : null}
              </div>

              {error ? (
                <p className="mt-2 flex items-start gap-2 rounded-xl bg-red-50 p-2.5 text-xs font-bold text-red-700">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  {error}
                </p>
              ) : null}

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={clearCart}
                  className="min-h-10 touch-manipulation rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-black hover:bg-neutral-100 active:scale-[0.98]"
                >
                  Clear
                </button>

                <button
                  type="button"
                  onClick={completeSale}
                  disabled={pending || itemCount === 0}
                  className="min-h-10 touch-manipulation rounded-xl bg-black px-3 py-2 text-xs font-black text-white hover:bg-neutral-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pending
                    ? paymentMethod === 'XENDIT'
                      ? 'Opening Xendit...'
                      : 'Processing...'
                    : paymentMethod === 'XENDIT'
                      ? 'Open Secure Checkout'
                      : 'Complete Sale'}
                </button>
              </div>
            </div>
          </section>
        </aside>
      </div>

      {mobileView === 'products' && itemCount > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-neutral-200 bg-white/95 p-3 backdrop-blur-xl lg:hidden">
          <button
            type="button"
            onClick={() => setMobileView('cart')}
            className="flex min-h-12 w-full touch-manipulation items-center justify-between rounded-xl bg-black px-4 py-3 text-sm font-black text-white active:scale-[0.98]"
          >
            <span>View Cart ({itemCount})</span>
            <span>{money(total, currency)}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

function QuantityControls({
  quantity,
  onDecrease,
  onIncrease,
  disableIncrease,
}: {
  quantity: number;
  onDecrease: () => void;
  onIncrease: () => void;
  disableIncrease?: boolean;
}) {
  return (
    <div className="inline-flex items-center rounded-full bg-neutral-50 p-0.5">
      <button
        type="button"
        onClick={onDecrease}
        className="grid size-8 touch-manipulation place-items-center rounded-full bg-white active:scale-95"
      >
        <Minus className="size-3.5" />
      </button>

      <span className="min-w-8 text-center text-xs font-black">
        {quantity}
      </span>

      <button
        type="button"
        onClick={onIncrease}
        disabled={disableIncrease}
        className="grid size-8 touch-manipulation place-items-center rounded-full bg-white active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}