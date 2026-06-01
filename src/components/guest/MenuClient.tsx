'use client';

import {
  type ButtonHTMLAttributes,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Utensils,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { money } from '@/lib/money';
import { cn } from '@/lib/utils';
import { createGuestOrder } from '@/app/t/[tagCode]/actions';

type MenuProductTypeValue = 'SINGLE' | 'BUNDLE';

type BundleComponent = {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  availableQty: number;
  soldQty: number;
  canSellQty: number;
  isSoldOut: boolean;
};

type Product = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  imageUrl: string | null;
  categoryName: string;

  productType?: MenuProductTypeValue;
  isBundle?: boolean;
  availableQty?: number;
  soldQty?: number;
  isSoldOut?: boolean;
  limitingComponentName?: string | null;
  normalBundlePriceCents?: number;
  bundleSavingsCents?: number;
  bundleComponents?: BundleComponent[];
};

type CartItem = {
  productId: string;
  quantity: number;
  notes?: string;
};

type OrderType = 'ROOM_SERVICE' | 'DINE_IN' | 'TAKE_OUT' | 'PICK_UP';

const orderTypeLabels: Record<OrderType, string> = {
  ROOM_SERVICE: 'Room Service / Deliver to Room',
  DINE_IN: 'Dine In',
  TAKE_OUT: 'Take Out',
  PICK_UP: 'Pick Up at Counter',
};

function TapButton({
  onTap,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { onTap: () => void }) {
  const lastPointerTap = useRef(0);

  return (
    <button
      {...props}
      type="button"
      disabled={disabled}
      onPointerUp={(event) => {
        if (disabled) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        lastPointerTap.current = Date.now();
        onTap();
      }}
      onClick={(event) => {
        event.stopPropagation();

        if (disabled) {
          return;
        }

        if (Date.now() - lastPointerTap.current < 450) {
          return;
        }

        onTap();
      }}
      className={cn(
        'relative z-20 pointer-events-auto touch-manipulation select-none active:scale-95 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40',
        className
      )}
    >
      {children}
    </button>
  );
}

function simpleMoney(cents: number, currency: string) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function isBundleProduct(product: Product) {
  return product.isBundle || product.productType === 'BUNDLE';
}

function getProductAvailableQty(product: Product) {
  return Math.max(Number(product.availableQty ?? 0), 0);
}

function isProductSoldOut(product: Product) {
  return Boolean(product.isSoldOut) || getProductAvailableQty(product) <= 0;
}

function getSoldOutReason(product: Product) {
  if (!isProductSoldOut(product)) {
    return null;
  }

  if (isBundleProduct(product) && product.limitingComponentName) {
    return `Sold out because ${product.limitingComponentName} is unavailable.`;
  }

  if (isBundleProduct(product) && !product.bundleComponents?.length) {
    return 'Sold out because this bundle has no components yet.';
  }

  return 'Sold out';
}

function ProductImage({
  product,
  className,
}: {
  product: Product;
  className?: string;
}) {
  if (!product.imageUrl) {
    return (
      <div
        className={cn(
          'grid place-items-center bg-neutral-900 text-white/40',
          className
        )}
      >
        <Utensils className="size-8" />
      </div>
    );
  }

  return (
    <div
      className={cn('bg-cover bg-center', className)}
      style={{
        backgroundImage: `url(${product.imageUrl})`,
      }}
      aria-label={product.name}
    />
  );
}

function ProductBadges({
  product,
  light = false,
}: {
  product: Product;
  light?: boolean;
}) {
  const isBundle = isBundleProduct(product);
  const soldOut = isProductSoldOut(product);

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <span
        className={
          isBundle
            ? light
              ? 'rounded-full bg-amber-100 px-3 py-1 text-[10px] font-black text-amber-800'
              : 'rounded-full bg-amber-400/15 px-3 py-1 text-[10px] font-black text-amber-200'
            : light
              ? 'rounded-full bg-neutral-100 px-3 py-1 text-[10px] font-black text-neutral-700'
              : 'rounded-full bg-white/10 px-3 py-1 text-[10px] font-black text-white/75'
        }
      >
        {isBundle ? 'Bundle / Combo' : 'Single Item'}
      </span>

      <span
        className={
          soldOut
            ? light
              ? 'rounded-full bg-red-100 px-3 py-1 text-[10px] font-black text-red-700'
              : 'rounded-full bg-red-500/20 px-3 py-1 text-[10px] font-black text-red-200'
            : light
              ? 'rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-black text-emerald-700'
              : 'rounded-full bg-emerald-400/15 px-3 py-1 text-[10px] font-black text-emerald-200'
        }
      >
        {soldOut ? 'Sold Out' : `${getProductAvailableQty(product)} available`}
      </span>
    </div>
  );
}

function BundleIncludes({
  product,
  light = false,
  compact = false,
}: {
  product: Product;
  light?: boolean;
  compact?: boolean;
}) {
  if (!isBundleProduct(product)) {
    return null;
  }

  const components = product.bundleComponents ?? [];

  if (!components.length) {
    return (
      <p
        className={
          light
            ? 'mt-2 rounded-2xl bg-amber-50 p-3 text-xs font-bold text-amber-800'
            : 'mt-2 rounded-2xl bg-amber-400/10 p-3 text-xs font-bold text-amber-100'
        }
      >
        No bundle components yet.
      </p>
    );
  }

  return (
    <div
      className={
        light
          ? 'mt-2 rounded-2xl bg-amber-50 p-3'
          : 'mt-2 rounded-2xl bg-amber-400/10 p-3'
      }
    >
      <p
        className={
          light
            ? 'text-[10px] font-black uppercase tracking-[0.14em] text-amber-700'
            : 'text-[10px] font-black uppercase tracking-[0.14em] text-amber-200'
        }
      >
        Includes
      </p>

      <div className="mt-2 space-y-1">
        {components.slice(0, compact ? 3 : 6).map((component) => (
          <p
            key={component.id}
            className={
              light
                ? 'text-xs font-bold text-amber-900'
                : 'text-xs font-bold text-amber-50'
            }
          >
            {component.quantity}× {component.name}
          </p>
        ))}

        {components.length > (compact ? 3 : 6) ? (
          <p
            className={
              light
                ? 'text-xs font-bold text-amber-700'
                : 'text-xs font-bold text-amber-100'
            }
          >
            +{components.length - (compact ? 3 : 6)} more item
            {components.length - (compact ? 3 : 6) === 1 ? '' : 's'}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function BundleSavings({
  product,
  currency,
  light = false,
}: {
  product: Product;
  currency: string;
  light?: boolean;
}) {
  if (!isBundleProduct(product)) {
    return null;
  }

  const normalTotal = product.normalBundlePriceCents ?? 0;
  const savings = product.bundleSavingsCents ?? 0;

  if (normalTotal <= 0 && savings <= 0) {
    return null;
  }

  return (
    <div
      className={
        light
          ? 'mt-2 flex flex-wrap gap-2 text-xs font-black'
          : 'mt-2 flex flex-wrap gap-2 text-xs font-black'
      }
    >
      {normalTotal > 0 ? (
        <span
          className={
            light
              ? 'rounded-full bg-neutral-100 px-3 py-1 text-neutral-600'
              : 'rounded-full bg-white/10 px-3 py-1 text-white/65'
          }
        >
          Normal: {simpleMoney(normalTotal, currency)}
        </span>
      ) : null}

      {savings > 0 ? (
        <span
          className={
            light
              ? 'rounded-full bg-emerald-100 px-3 py-1 text-emerald-700'
              : 'rounded-full bg-emerald-400/15 px-3 py-1 text-emerald-200'
          }
        >
          Save {simpleMoney(savings, currency)}
        </span>
      ) : null}
    </div>
  );
}

function buildOrderNotes({
  orderType,
  notes,
}: {
  orderType: OrderType;
  notes: string;
}) {
  const parts = [
    `Order Type: ${orderTypeLabels[orderType]}`,
    'Guest confirmed the selected order type before placing this order.',
  ];

  if (notes.trim()) {
    parts.push(`Guest Notes: ${notes.trim()}`);
  }

  return parts.join('\n');
}

export function MenuClient({
  tagCode,
  products,
  currency,
  taxRate = 0,
  serviceChargeRate = 0,
}: {
  tagCode: string;
  products: Product[];
  currency: string;
  taxRate?: number;
  serviceChargeRate?: number;
}) {
  const router = useRouter();

  const [screen, setScreen] = useState<'menu' | 'cart'>('menu');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [guestName, setGuestName] = useState('');
  const [notes, setNotes] = useState('');
  const [orderType, setOrderType] = useState<OrderType>('ROOM_SERVICE');
  const [confirmedClause, setConfirmedClause] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<
    'ROOM_CHARGE' | 'PAY_AT_COUNTER' | 'CASH' | 'POS'
  >('ROOM_CHARGE');

  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const productMap = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products]
  );

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(products.map((p) => p.categoryName)))],
    [products]
  );

  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return (activeCategory === 'All'
      ? products
      : products.filter((p) => p.categoryName === activeCategory)
    ).filter((p) => {
      if (!query) {
        return true;
      }

      const componentText = (p.bundleComponents ?? [])
        .map((component) => component.name)
        .join(' ');

      return `${p.name} ${p.description ?? ''} ${
        p.categoryName
      } ${componentText}`
        .toLowerCase()
        .includes(query);
    });
  }, [activeCategory, products, searchQuery]);

  const featured =
    filteredProducts.find((product) => !isProductSoldOut(product)) ??
    filteredProducts[0] ??
    products.find((product) => !isProductSoldOut(product)) ??
    products[0];

  const subtotal = cart.reduce(
    (sum, item) =>
      sum + (productMap.get(item.productId)?.priceCents ?? 0) * item.quantity,
    0
  );

  const serviceCharge = Math.round(subtotal * serviceChargeRate);
  const tax = Math.round(subtotal * taxRate);
  const total = subtotal + serviceCharge + tax;
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  function getCartQuantity(productId: string) {
    return cart.find((item) => item.productId === productId)?.quantity ?? 0;
  }

  function add(productId: string) {
    setError(null);

    const product = productMap.get(productId);

    if (!product) {
      setError('This menu item is no longer available.');
      return;
    }

    if (isProductSoldOut(product)) {
      setError(getSoldOutReason(product) ?? 'This menu item is sold out.');
      return;
    }

    const availableQty = getProductAvailableQty(product);
    const currentQty = getCartQuantity(productId);

    if (currentQty >= availableQty) {
      setError(
        `${product.name} only has ${availableQty} available right now.`
      );
      return;
    }

    setCart((current) => {
      const existing = current.find((item) => item.productId === productId);

      if (existing) {
        return current.map((item) =>
          item.productId === productId
            ? {
                ...item,
                quantity: Math.min(item.quantity + 1, availableQty),
              }
            : item
        );
      }

      return [...current, { productId, quantity: 1 }];
    });
  }

  function updateQty(productId: string, quantity: number) {
    setError(null);

    const product = productMap.get(productId);

    if (!product) {
      setCart((current) =>
        current.filter((item) => item.productId !== productId)
      );
      return;
    }

    const availableQty = getProductAvailableQty(product);

    if (quantity > availableQty) {
      setError(
        `${product.name} only has ${availableQty} available right now.`
      );
    }

    setCart((current) =>
      current
        .map((item) =>
          item.productId === productId
            ? {
                ...item,
                quantity: Math.min(quantity, availableQty),
              }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  function submit() {
    setError(null);

    if (!cart.length) {
      setError('Please add at least one item before placing your order.');
      return;
    }

    const unavailableCartItem = cart.find((item) => {
      const product = productMap.get(item.productId);

      if (!product) {
        return true;
      }

      return isProductSoldOut(product) || item.quantity > getProductAvailableQty(product);
    });

    if (unavailableCartItem) {
      const product = productMap.get(unavailableCartItem.productId);

      setError(
        product
          ? `${product.name} is no longer available in the selected quantity.`
          : 'One item in your cart is no longer available.'
      );
      return;
    }

    if (!confirmedClause) {
      setError('Please confirm the order type before placing your order.');
      return;
    }

    startTransition(async () => {
      try {
        const finalNotes = buildOrderNotes({
          orderType,
          notes,
        });

        const result = await createGuestOrder({
          tagCode,
          guestName,
          notes: finalNotes,
          paymentMethod,
          items: cart,
        });

        if (result.ok) {
          router.push(`/t/${tagCode}/confirmed/${result.orderCode}`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unable to submit order.');
      }
    });
  }

  if (screen === 'cart') {
    return (
      <div className="-mx-5 -mt-3 min-h-[calc(100vh-5rem)] bg-[#f8f3ec] px-5 pb-28 pt-2 text-ink">
        <div className="mb-5 grid grid-cols-[44px_1fr_44px] items-center">
          <button
            type="button"
            onClick={() => setScreen('menu')}
            className="grid size-10 place-items-center rounded-full hover:bg-black/5"
            aria-label="Back to menu"
          >
            <ArrowLeft className="size-5" />
          </button>

          <div className="text-center">
            <h2 className="font-black">Your Cart</h2>
            <p className="text-xs text-neutral-500">
              Review items before placing your order
            </p>
          </div>

          <div />
        </div>

        <div className="rounded-[2rem] bg-white p-4 shadow-soft">
          {cart.length === 0 ? (
            <div className="grid min-h-64 place-items-center text-center">
              <div>
                <div className="mx-auto grid size-14 place-items-center rounded-full bg-neutral-100">
                  <ShoppingBag className="size-6" />
                </div>
                <h3 className="mt-4 text-xl font-black">Your cart is empty</h3>
                <p className="mt-1 text-sm text-neutral-500">
                  Add food or drinks from the menu.
                </p>
                <Button
                  type="button"
                  onClick={() => setScreen('menu')}
                  className="mt-5"
                >
                  Back to Menu
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {cart.map((item) => {
                const product = productMap.get(item.productId)!;
                const availableQty = getProductAvailableQty(product);
                const canIncrease =
                  !isProductSoldOut(product) && item.quantity < availableQty;

                return (
                  <div
                    key={item.productId}
                    className="grid grid-cols-[72px_1fr_32px] gap-3 border-b border-neutral-100 pb-4 last:border-b-0"
                  >
                    <ProductImage
                      product={product}
                      className="size-[72px] rounded-2xl bg-neutral-100"
                    />

                    <div>
                      <div className="flex flex-wrap items-start gap-2">
                        <h3 className="font-black leading-tight">
                          {product.name}
                        </h3>

                        {isBundleProduct(product) ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800">
                            Bundle
                          </span>
                        ) : null}
                      </div>

                      <p className="mt-1 text-sm font-bold text-neutral-700">
                        {simpleMoney(product.priceCents, currency)}
                      </p>

                      <BundleIncludes product={product} light compact />

                      {isProductSoldOut(product) ? (
                        <p className="mt-2 rounded-xl bg-red-50 p-2 text-xs font-bold text-red-700">
                          {getSoldOutReason(product)}
                        </p>
                      ) : (
                        <p className="mt-2 text-xs font-bold text-neutral-400">
                          {availableQty} available
                        </p>
                      )}

                      <div className="mt-3 inline-flex items-center gap-3 rounded-full bg-neutral-50 px-2 py-1">
                        <TapButton
                          onTap={() =>
                            updateQty(item.productId, item.quantity - 1)
                          }
                          className="grid size-8 place-items-center rounded-full hover:bg-white"
                          aria-label={`Decrease ${product.name}`}
                        >
                          <Minus className="size-3" />
                        </TapButton>

                        <span className="min-w-4 text-center text-sm font-black">
                          {item.quantity}
                        </span>

                        <TapButton
                          onTap={() =>
                            updateQty(item.productId, item.quantity + 1)
                          }
                          disabled={!canIncrease}
                          className="grid size-8 place-items-center rounded-full hover:bg-white"
                          aria-label={`Increase ${product.name}`}
                        >
                          <Plus className="size-3" />
                        </TapButton>
                      </div>
                    </div>

                    <TapButton
                      onTap={() => updateQty(item.productId, 0)}
                      className="grid size-10 place-items-center rounded-full text-neutral-400 hover:bg-neutral-100"
                      aria-label={`Remove ${product.name}`}
                    >
                      <X className="size-4" />
                    </TapButton>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {cart.length > 0 ? (
          <>
            <div className="mt-5 rounded-[2rem] bg-white p-4 shadow-soft">
              <h3 className="mb-3 font-black">Order Details</h3>

              <div className="space-y-3">
                <Input
                  placeholder="Guest name optional"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                />

                <div>
                  <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
                    Order Type
                  </label>
                  <Select
                    value={orderType}
                    onChange={(e) => {
                      setOrderType(e.target.value as OrderType);
                      setConfirmedClause(false);
                    }}
                  >
                    <option value="ROOM_SERVICE">
                      Room Service / Deliver to Room
                    </option>
                    <option value="DINE_IN">Dine In</option>
                    <option value="TAKE_OUT">Take Out</option>
                    <option value="PICK_UP">Pick Up at Counter</option>
                  </Select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
                    Payment Method
                  </label>
                  <Select
                    value={paymentMethod}
                    onChange={(e) =>
                      setPaymentMethod(
                        e.target.value as
                          | 'ROOM_CHARGE'
                          | 'PAY_AT_COUNTER'
                          | 'CASH'
                          | 'POS'
                      )
                    }
                  >
                    <option value="ROOM_CHARGE">Room charge</option>
                    <option value="PAY_AT_COUNTER">Pay at counter</option>
                    <option value="CASH">Cash</option>
                    <option value="POS">Card / E-wallet</option>
                  </Select>
                </div>

                <Textarea
                  placeholder="Special instructions / notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />

                <label className="flex items-start gap-3 rounded-2xl bg-amber-50 p-4 text-sm font-bold text-amber-800">
                  <input
                    type="checkbox"
                    checked={confirmedClause}
                    onChange={(event) =>
                      setConfirmedClause(event.target.checked)
                    }
                    className="mt-1 size-4"
                  />

                  <span>
                    I confirm this order is for{' '}
                    <b>{orderTypeLabels[orderType]}</b>. I understand that
                    preparation time and claiming/delivery process may depend on
                    the selected order type.
                  </span>
                </label>
              </div>
            </div>

            <div className="mt-5 rounded-[2rem] bg-white p-4 shadow-soft">
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Subtotal</span>
                  <b>{money(subtotal, currency)}</b>
                </div>

                <div className="flex justify-between">
                  <span className="text-neutral-500">
                    Service charge ({Math.round(serviceChargeRate * 100)}%)
                  </span>
                  <b>{money(serviceCharge, currency)}</b>
                </div>

                {taxRate > 0 ? (
                  <div className="flex justify-between">
                    <span className="text-neutral-500">
                      Tax ({Math.round(taxRate * 100)}%)
                    </span>
                    <b>{money(tax, currency)}</b>
                  </div>
                ) : null}

                <div className="border-t border-neutral-100 pt-4 text-base">
                  <div className="flex justify-between">
                    <span className="font-black">Total</span>
                    <span className="font-black">{money(total, currency)}</span>
                  </div>
                </div>
              </div>

              {error ? (
                <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">
                  {error}
                </p>
              ) : null}

              <Button
                type="button"
                onClick={submit}
                disabled={pending || !confirmedClause}
                size="lg"
                className="mt-5 w-full bg-ink text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? 'Submitting...' : 'Place Order'}
              </Button>
            </div>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className="-mx-5 -mt-3 min-h-[calc(100vh-5rem)] bg-black px-5 pb-28 pt-2 text-white">
      <div className="mb-5 grid grid-cols-[44px_1fr_44px] items-center">
        <button
          type="button"
          onClick={() => router.push(`/t/${tagCode}`)}
          className="grid size-10 place-items-center rounded-full hover:bg-white/10"
          aria-label="Back"
        >
          <ArrowLeft className="size-5" />
        </button>

        <div className="text-center">
          <h2 className="font-black">Order Food</h2>
          <p className="text-xs text-white/50">
            Tap available items to add them to your cart
          </p>
        </div>

        <button
          type="button"
          onClick={() => setScreen('cart')}
          className="relative grid size-10 place-items-center rounded-full hover:bg-white/10"
          aria-label="Open cart"
        >
          <ShoppingBag className="size-5" />
          {itemCount > 0 ? (
            <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-gold text-[10px] font-black text-ink">
              {itemCount}
            </span>
          ) : null}
        </button>
      </div>

      <div className="mb-4 flex h-12 items-center gap-3 rounded-2xl bg-white/10 px-4">
        <Search className="size-5 text-white/40" />
        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search menu or bundle items..."
          className="w-full bg-transparent text-sm font-bold text-white outline-none placeholder:text-white/40"
        />
      </div>

      <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {categories.map((category) => {
          const active = category === activeCategory;

          return (
            <button
              key={category}
              type="button"
              onClick={() => setActiveCategory(category)}
              className={cn(
                'shrink-0 rounded-full px-5 py-3 text-sm font-black',
                active ? 'bg-sand text-ink' : 'bg-white/5 text-white'
              )}
            >
              {category}
            </button>
          );
        })}
      </div>

      {featured ? (
        <section className="mb-6">
          <h3 className="mb-3 font-serif font-black">Chef’s Recommendations</h3>

          <button
            type="button"
            onClick={() => add(featured.id)}
            disabled={isProductSoldOut(featured)}
            className="relative w-full overflow-hidden rounded-[1.75rem] bg-white text-left text-ink disabled:cursor-not-allowed disabled:opacity-70"
          >
            <ProductImage
              product={featured}
              className="h-44 w-full bg-neutral-900"
            />

            {isProductSoldOut(featured) ? (
              <div className="absolute left-4 top-4 rounded-full bg-red-600 px-4 py-2 text-xs font-black text-white shadow-lg">
                SOLD OUT
              </div>
            ) : null}

            <div className="p-4">
              <div className="grid grid-cols-[1fr_64px] items-center gap-3">
                <div>
                  <h4 className="text-lg font-black">{featured.name}</h4>
                  <p className="mt-2 text-base font-black">
                    {simpleMoney(featured.priceCents, currency)}
                  </p>
                  <ProductBadges product={featured} light />
                  <BundleSavings
                    product={featured}
                    currency={currency}
                    light
                  />
                </div>

                <span
                  className={
                    isProductSoldOut(featured)
                      ? 'grid size-14 place-items-center rounded-full bg-neutral-200 text-neutral-400'
                      : 'grid size-14 place-items-center rounded-full bg-black text-white'
                  }
                >
                  <Plus className="size-7" />
                </span>
              </div>

              <BundleIncludes product={featured} light compact />

              {isProductSoldOut(featured) ? (
                <p className="mt-3 rounded-2xl bg-red-50 p-3 text-xs font-bold text-red-700">
                  {getSoldOutReason(featured)}
                </p>
              ) : null}
            </div>
          </button>
        </section>
      ) : null}

      <div className="space-y-3">
        {filteredProducts.map((product) => {
          const soldOut = isProductSoldOut(product);

          return (
            <button
              key={product.id}
              type="button"
              onClick={() => add(product.id)}
              disabled={soldOut}
              className="grid w-full grid-cols-[84px_1fr_48px] items-center gap-3 rounded-[1.5rem] bg-white/5 p-3 text-left disabled:cursor-not-allowed disabled:opacity-60"
            >
              <ProductImage
                product={product}
                className="size-[84px] rounded-2xl bg-neutral-900"
              />

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="truncate font-black">{product.name}</h4>
                  {isBundleProduct(product) ? (
                    <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-black text-amber-200">
                      Bundle
                    </span>
                  ) : null}
                </div>

                {product.description ? (
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/55">
                    {product.description}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-white/35">No description</p>
                )}

                <ProductBadges product={product} />
                <BundleSavings product={product} currency={currency} />
                <BundleIncludes product={product} compact />

                {soldOut ? (
                  <p className="mt-2 rounded-xl bg-red-500/15 p-2 text-xs font-bold text-red-100">
                    {getSoldOutReason(product)}
                  </p>
                ) : null}

                <p className="mt-2 text-sm font-black text-sand">
                  {simpleMoney(product.priceCents, currency)}
                </p>
              </div>

              <span
                className={
                  soldOut
                    ? 'grid size-11 place-items-center rounded-full bg-white/10 text-white/30'
                    : 'grid size-11 place-items-center rounded-full bg-white text-black'
                }
              >
                <Plus className="size-5" />
              </span>
            </button>
          );
        })}

        {!filteredProducts.length ? (
          <div className="rounded-[2rem] border border-white/10 bg-white/5 p-8 text-center">
            <Utensils className="mx-auto size-8 text-white/40" />
            <h3 className="mt-3 font-black">No menu items found</h3>
            <p className="mt-1 text-sm text-white/45">
              Try another category or search term.
            </p>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="fixed inset-x-5 bottom-44 z-30 mx-auto max-w-md rounded-2xl bg-red-600 px-4 py-3 text-sm font-black text-white shadow-xl">
          {error}
        </div>
      ) : null}

      {itemCount > 0 ? (
        <button
          type="button"
          onClick={() => setScreen('cart')}
          className="fixed inset-x-5 bottom-24 z-30 mx-auto flex max-w-md items-center justify-between rounded-2xl bg-gold px-5 py-4 font-black text-ink shadow-xl"
        >
          <span>View Cart ({itemCount})</span>
          <span>{money(total, currency)}</span>
        </button>
      ) : null}
    </div>
  );
}