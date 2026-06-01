'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  ConciergeBell,
  Minus,
  Plus,
  ReceiptText,
  Search,
  ShoppingCart,
  Trash2,
} from 'lucide-react';
import { ServiceBillingMode } from '@prisma/client';
import { cn } from '@/lib/utils';
import { createPOSOrder } from './actions';

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

export function POSClient({
  selectedHotelId,
  hotels,
  rooms,
  products,
  services,
  currency,
}: {
  selectedHotelId: string;
  hotels: POSHotel[];
  rooms: POSRoom[];
  products: POSProduct[];
  services: POSService[];
  currency: string;
}) {
  const router = useRouter();

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
    'CASH' | 'POS' | 'ROOM_CHARGE' | 'PAY_AT_COUNTER'
  >('CASH');
  const [cashTendered, setCashTendered] = useState('');
  const [lastReceiptLabel, setLastReceiptLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [pending, startTransition] = useTransition();

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
      setError('Please add at least one food item or service item.');
      return;
    }

    const stockError = validateCartAgainstStock();

    if (stockError) {
      setError(stockError);
      return;
    }

    if (paymentMethod === 'CASH' && cashValue < total) {
      setError('Cash tendered is lower than the total amount.');
      return;
    }

    startTransition(async () => {
      try {
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

          setLastReceiptLabel(parts.join(' · ') || 'Sale completed');
          clearCart();
          setMobileView('products');
          router.refresh();
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Unable to complete POS sale.'
        );
      }
    });
  }

  return (
    <div className="relative pb-24 lg:pb-0">
      <div className="mb-4 grid grid-cols-2 gap-2 lg:hidden">
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <section
          className={cn(
            'min-w-0',
            mobileView === 'cart' ? 'hidden lg:block' : 'block'
          )}
        >
          <div className="mb-5 rounded-[2rem] border border-neutral-200 bg-white p-4 shadow-soft">
            <div className="mb-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setActiveMode('food')}
                className={
                  activeMode === 'food'
                    ? 'h-12 rounded-2xl bg-black px-4 text-sm font-black text-white'
                    : 'h-12 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-black text-neutral-700 hover:bg-neutral-50'
                }
              >
                Food Menu
              </button>

              <button
                type="button"
                onClick={() => setActiveMode('services')}
                className={
                  activeMode === 'services'
                    ? 'h-12 rounded-2xl bg-black px-4 text-sm font-black text-white'
                    : 'h-12 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-black text-neutral-700 hover:bg-neutral-50'
                }
              >
                Services
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-[240px_1fr_220px]">
              <div>
                <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
                  Hotel
                </label>
                <select
                  value={selectedHotelId}
                  onChange={(event) => {
                    router.push(`/dashboard/pos?hotelId=${event.target.value}`);
                  }}
                  className="h-12 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none"
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
                    <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
                      Search Food Product
                    </label>
                    <div className="flex h-12 items-center gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 px-4">
                      <Search className="size-4 shrink-0 text-neutral-400" />
                      <input
                        value={productQuery}
                        onChange={(event) => setProductQuery(event.target.value)}
                        placeholder="Search product, bundle, or component..."
                        className="w-full bg-transparent text-sm font-semibold outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
                      Food Stock Filter
                    </label>
                    <select
                      value={productAvailabilityFilter}
                      onChange={(event) =>
                        setProductAvailabilityFilter(
                          event.target.value as ProductAvailabilityFilter
                        )
                      }
                      className="h-12 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none"
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
                    <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
                      Search Service
                    </label>
                    <div className="flex h-12 items-center gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 px-4">
                      <Search className="size-4 shrink-0 text-neutral-400" />
                      <input
                        value={serviceQuery}
                        onChange={(event) => setServiceQuery(event.target.value)}
                        placeholder="Search service request item..."
                        className="w-full bg-transparent text-sm font-semibold outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
                      Service Filter
                    </label>
                    <select
                      value={serviceAvailabilityFilter}
                      onChange={(event) =>
                        setServiceAvailabilityFilter(
                          event.target.value as ServiceAvailabilityFilter
                        )
                      }
                      className="h-12 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none"
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

            <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
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
                        'shrink-0 touch-manipulation rounded-full border px-4 py-2 text-sm font-black transition active:scale-95',
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
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {filteredProducts.map((product) => {
                const sellable = canSellProduct(product);

                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => addFoodItem(product.id)}
                    disabled={!sellable}
                    className={cn(
                      'touch-manipulation overflow-hidden rounded-[1.5rem] border border-neutral-200 bg-white text-left shadow-soft transition active:scale-[0.99]',
                      sellable
                        ? 'hover:-translate-y-0.5 hover:shadow-lg'
                        : 'cursor-not-allowed opacity-60'
                    )}
                  >
                    <div
                      className="relative h-28 bg-neutral-100 bg-cover bg-center sm:h-36"
                      style={{
                        backgroundImage: product.imageUrl
                          ? `url(${product.imageUrl})`
                          : undefined,
                      }}
                    >
                      <span
                        className={`absolute left-3 top-3 max-w-[calc(100%-1.5rem)] truncate rounded-full px-3 py-1 text-[10px] font-black ${getProductStockBadgeClass(
                          product
                        )}`}
                      >
                        {getProductStockLabel(product)}
                      </span>

                      {!sellable ? (
                        <div className="absolute inset-0 grid place-items-center bg-white/70">
                          <span className="rounded-full bg-black px-4 py-2 text-xs font-black text-white">
                            Not Available
                          </span>
                        </div>
                      ) : null}
                    </div>

                    <div className="p-3 sm:p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-base font-black sm:text-lg">
                              {product.name}
                            </h3>
                            <BundleBadge product={product} />
                          </div>

                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-neutral-500">
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
                            'grid size-10 shrink-0 place-items-center rounded-full',
                            sellable
                              ? 'bg-black text-white'
                              : 'bg-neutral-200 text-neutral-400'
                          )}
                        >
                          <Plus className="size-5" />
                        </span>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-3">
                        <p className="text-base font-black text-gold sm:text-lg">
                          {money(product.priceCents, currency)}
                        </p>

                        <p className="text-xs font-bold text-neutral-400">
                          Sold: {product.soldQty}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}

              {filteredProducts.length === 0 ? (
                <div className="rounded-[2rem] border border-dashed border-neutral-200 bg-white p-10 text-center sm:col-span-2 xl:col-span-3 2xl:col-span-4">
                  <p className="font-black text-neutral-600">
                    No food products found
                  </p>
                  <p className="mt-1 text-sm text-neutral-500">
                    Try another keyword, category, or stock filter.
                  </p>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {filteredServices.map((service) => {
                const sellable = canSellService(service);

                return (
                  <button
                    key={service.id}
                    type="button"
                    onClick={() => addServiceItem(service.id)}
                    disabled={!sellable}
                    className={cn(
                      'touch-manipulation overflow-hidden rounded-[1.5rem] border border-neutral-200 bg-white p-4 text-left shadow-soft transition active:scale-[0.99]',
                      sellable
                        ? 'hover:-translate-y-0.5 hover:shadow-lg'
                        : 'cursor-not-allowed opacity-60'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="grid size-11 place-items-center rounded-2xl bg-blue-50 text-blue-700">
                            <ConciergeBell className="size-5" />
                          </div>

                          <div className="min-w-0">
                            <h3 className="truncate text-base font-black">
                              {service.name}
                            </h3>
                            <p className="text-xs font-bold text-neutral-400">
                              {service.category}
                            </p>
                          </div>
                        </div>

                        <p className="mt-3 line-clamp-3 text-xs leading-5 text-neutral-500">
                          {service.description || 'No description'}
                        </p>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <span
                            className={`rounded-full px-3 py-1 text-[10px] font-black ${getServiceStockBadgeClass(
                              service
                            )}`}
                          >
                            {getServiceStockLabel(service)}
                          </span>

                          <span
                            className={`rounded-full px-3 py-1 text-[10px] font-black ${getBillingBadgeClass(
                              service
                            )}`}
                          >
                            {getBillingLabel(service)}
                          </span>
                        </div>
                      </div>

                      <span
                        className={cn(
                          'grid size-10 shrink-0 place-items-center rounded-full',
                          sellable
                            ? 'bg-black text-white'
                            : 'bg-neutral-200 text-neutral-400'
                        )}
                      >
                        <Plus className="size-5" />
                      </span>
                    </div>
                  </button>
                );
              })}

              {filteredServices.length === 0 ? (
                <div className="rounded-[2rem] border border-dashed border-neutral-200 bg-white p-10 text-center sm:col-span-2 xl:col-span-3 2xl:col-span-4">
                  <p className="font-black text-neutral-600">
                    No service items found
                  </p>
                  <p className="mt-1 text-sm text-neutral-500">
                    Try another keyword, category, or service filter.
                  </p>
                </div>
              ) : null}
            </div>
          )}
        </section>

        <aside
          className={cn(
            'lg:sticky lg:top-24 lg:h-[calc(100vh-8rem)]',
            mobileView === 'products' ? 'hidden lg:block' : 'block'
          )}
        >
          <section className="flex min-h-[75vh] flex-col overflow-hidden rounded-[2rem] border border-neutral-200 bg-white shadow-soft lg:h-full">
            <div className="border-b border-neutral-100 bg-black p-5 text-white">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setMobileView('products')}
                    className="grid size-10 place-items-center rounded-full bg-white/10 lg:hidden"
                    aria-label="Back to products"
                  >
                    <ArrowLeft className="size-5" />
                  </button>

                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.25em] text-gold">
                      Cloud View POS
                    </p>
                    <h2 className="mt-1 text-2xl font-black">Current Sale</h2>
                  </div>
                </div>

                <div className="relative">
                  <ShoppingCart className="size-7 text-gold" />

                  {itemCount > 0 ? (
                    <span className="absolute -right-2 -top-2 grid size-5 place-items-center rounded-full bg-gold text-[10px] font-black text-black">
                      {itemCount}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {lastReceiptLabel ? (
                <div className="mb-4 rounded-[1.5rem] border border-green-200 bg-green-50 p-4 text-green-800">
                  <p className="font-black">Sale completed</p>
                  <p className="mt-1 text-sm font-semibold">
                    {lastReceiptLabel}
                  </p>
                </div>
              ) : null}

              {foodCart.length === 0 && serviceCart.length === 0 ? (
                <div className="grid min-h-52 place-items-center rounded-[1.5rem] border border-dashed border-neutral-200 bg-neutral-50 p-6 text-center">
                  <div>
                    <ReceiptText className="mx-auto size-9 text-neutral-400" />
                    <p className="mt-3 font-black text-neutral-600">
                      Cart is empty
                    </p>
                    <p className="mt-1 text-sm text-neutral-500">
                      Tap available food or service items to add them.
                    </p>
                  </div>
                </div>
              ) : null}

              {foodCart.length > 0 ? (
                <div className="mb-4">
                  <p className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-neutral-400">
                    Food Menu
                  </p>

                  <div className="space-y-3">
                    {foodCart.map((item) => {
                      const product = productMap.get(item.productId);

                      if (!product) return null;

                      return (
                        <div
                          key={item.productId}
                          className="rounded-[1.25rem] border border-neutral-200 bg-white p-3"
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

                              <p className="mt-1 text-xs font-bold text-neutral-400">
                                {product.isDerivedStock
                                  ? `Can sell: ${product.availableQty}`
                                  : `Stock left: ${product.availableQty}`}
                              </p>

                              <BundleIncludes product={product} compact />
                            </div>

                            <button
                              type="button"
                              onClick={() => updateFoodQty(item.productId, 0)}
                              className="grid size-10 touch-manipulation place-items-center rounded-full bg-red-50 text-red-600 active:scale-95"
                            >
                              <Trash2 className="size-4" />
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
                <div className="mb-4">
                  <p className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-neutral-400">
                    Services
                  </p>

                  <div className="space-y-3">
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
                          className="rounded-[1.25rem] border border-blue-100 bg-white p-3"
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

                              <p className="mt-1 text-xs font-bold text-neutral-400">
                                {service.inventoryTracked
                                  ? `Stock left: ${service.availableQty}`
                                  : 'Inventory not tracked'}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => updateServiceQty(item.serviceId, 0)}
                              className="grid size-10 touch-manipulation place-items-center rounded-full bg-red-50 text-red-600 active:scale-95"
                            >
                              <Trash2 className="size-4" />
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

              <div className="mt-5 space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
                    Customer / Guest Name
                  </label>
                  <input
                    value={guestName}
                    onChange={(event) => setGuestName(event.target.value)}
                    placeholder="Customer / guest name"
                    className="h-12 w-full rounded-2xl border border-neutral-200 px-4 text-sm font-semibold outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
                    Room / Customer Type
                  </label>
                  <select
                    value={roomId}
                    onChange={(event) => setRoomId(event.target.value)}
                    className="h-12 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-semibold outline-none"
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
                  <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
                    Payment Method
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(event) =>
                      setPaymentMethod(
                        event.target.value as typeof paymentMethod
                      )
                    }
                    className="h-12 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-semibold outline-none"
                  >
                    <option value="CASH">Cash</option>
                    <option value="POS">Card / E-wallet</option>
                    <option value="ROOM_CHARGE">Room Charge</option>
                    <option value="PAY_AT_COUNTER">Pay Later</option>
                  </select>
                </div>

                {paymentMethod === 'CASH' ? (
                  <div>
                    <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
                      Cash Tendered
                    </label>
                    <input
                      value={cashTendered}
                      onChange={(event) => setCashTendered(event.target.value)}
                      placeholder="Cash tendered"
                      type="number"
                      min="0"
                      step="0.01"
                      className="h-12 w-full rounded-2xl border border-neutral-200 px-4 text-sm font-semibold outline-none"
                    />
                  </div>
                ) : null}

                <div>
                  <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
                    Order / Service Notes
                  </label>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Order notes"
                    className="min-h-24 w-full resize-none rounded-2xl border border-neutral-200 p-4 text-sm font-semibold outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-neutral-100 bg-neutral-50 p-4">
              <div className="space-y-2 text-sm">
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

                <div className="flex justify-between text-lg">
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
                <p className="mt-3 flex items-start gap-2 rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  {error}
                </p>
              ) : null}

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={clearCart}
                  className="min-h-12 touch-manipulation rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-black hover:bg-neutral-100 active:scale-[0.98]"
                >
                  Clear
                </button>

                <button
                  type="button"
                  onClick={completeSale}
                  disabled={pending || itemCount === 0}
                  className="min-h-12 touch-manipulation rounded-2xl bg-black px-4 py-3 text-sm font-black text-white hover:bg-neutral-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pending ? 'Processing...' : 'Complete Sale'}
                </button>
              </div>
            </div>
          </section>
        </aside>
      </div>

      {mobileView === 'products' && itemCount > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-neutral-200 bg-white/95 p-4 backdrop-blur-xl lg:hidden">
          <button
            type="button"
            onClick={() => setMobileView('cart')}
            className="flex min-h-14 w-full touch-manipulation items-center justify-between rounded-2xl bg-black px-5 py-4 text-sm font-black text-white active:scale-[0.98]"
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
    <div className="inline-flex items-center rounded-full bg-neutral-50 p-1">
      <button
        type="button"
        onClick={onDecrease}
        className="grid size-10 touch-manipulation place-items-center rounded-full bg-white active:scale-95"
      >
        <Minus className="size-4" />
      </button>

      <span className="min-w-10 text-center text-sm font-black">
        {quantity}
      </span>

      <button
        type="button"
        onClick={onIncrease}
        disabled={disableIncrease}
        className="grid size-10 touch-manipulation place-items-center rounded-full bg-white active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}