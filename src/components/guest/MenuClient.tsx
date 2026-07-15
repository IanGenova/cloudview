'use client';

import {
  type ButtonHTMLAttributes,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ChefHat,
  ChevronRight,
  Clock3,
  BedDouble,
  KeyRound,
  Phone,
  Minus,
  PackageCheck,
  Plus,
  CreditCard,
  QrCode,
  ReceiptText,
  Search,
  ShoppingBag,
  Sparkles,
  Trash2,
  Utensils,
  X,
} from 'lucide-react';
import { money } from '@/lib/money';
import { cn } from '@/lib/utils';
import {
  ExistingXenditSessionGuard,
  type ExistingXenditGuardStatus,
} from '@/components/payment/ExistingXenditSessionGuard';
import { createGuestOrder } from '@/app/t/[tagCode]/actions';
import {
  cancelGuestFoodXenditCheckout,
  createGuestFoodXenditCheckout,
  finalizeGuestFoodXenditCheckout,
  getGuestFoodXenditStatus,
} from '@/app/t/[tagCode]/food-xendit-actions';

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

type StoredFoodCheckoutDraft = {
  cart: CartItem[];
  guestName: string;
  guestPhone: string;
  roomNumber: string;
  notes: string;
  orderType: OrderType;
  confirmedClause: boolean;
  paymentMethod: 'ROOM_CHARGE' | 'PAY_AT_COUNTER' | 'CASH' | 'POS' | 'XENDIT';
  fulfillmentTiming: FulfillmentTimingValue;
  scheduledDate: string;
  scheduledTime: string;
  scheduledNote: string;
  xenditSessionId?: string;
};

type ActiveFoodXenditSession = {
  sessionId: string;
  status: ExistingXenditGuardStatus;
  checkoutUrl?: string | null;
  errorMessage?: string | null;
};

type OrderType = 'ROOM_SERVICE' | 'DINE_IN' | 'TAKE_OUT' | 'PICK_UP';

type FulfillmentTimingValue = 'ASAP' | 'SCHEDULED';

const orderTypeLabels: Record<OrderType, string> = {
  ROOM_SERVICE: 'Room Service / Deliver to Room',
  DINE_IN: 'Dine In',
  TAKE_OUT: 'Take Out',
  PICK_UP: 'Pick Up at Counter',
};

const checkoutFieldClass =
  'w-full rounded-2xl border border-white/15 !bg-[#0b0b0b] px-4 text-[15px] font-medium !text-white caret-gold outline-none placeholder:!text-white/30 transition focus:border-gold/60 focus:ring-4 focus:ring-gold/10';

const checkoutFieldStyle = {
  backgroundColor: '#0b0b0b',
  color: '#ffffff',
  WebkitTextFillColor: '#ffffff',
  WebkitBoxShadow: '0 0 0 1000px #0b0b0b inset',
  caretColor: '#d6a738',
  colorScheme: 'dark',
} as const;

function TapButton({
  onTap,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { onTap: () => void }) {
  return (
    <button
      {...props}
      type="button"
      disabled={disabled}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();

        if (!disabled) {
          onTap();
        }
      }}
      className={cn(
        'inline-flex shrink-0 touch-manipulation select-none items-center justify-center transition active:scale-95 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40',
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
          'relative grid place-items-center overflow-hidden bg-[radial-gradient(circle_at_30%_20%,rgba(214,167,56,0.18),transparent_34%),linear-gradient(145deg,#191919,#0d0d0d)] text-white/55',
          className
        )}
        aria-label={`${product.name} image placeholder`}
      >
        <span className="absolute -right-8 -top-8 size-24 rounded-full border border-gold/10" />
        <span className="absolute -bottom-10 -left-8 size-28 rounded-full border border-white/5" />
        <span className="relative grid size-12 place-items-center rounded-full border border-white/10 bg-black/25 text-gold backdrop-blur">
          <Utensils className="size-5" strokeWidth={1.6} />
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'relative overflow-hidden bg-neutral-900 bg-cover bg-center',
        className
      )}
      style={{
        backgroundImage: `linear-gradient(to top, rgba(0,0,0,0.18), transparent 55%), url(${product.imageUrl})`,
      }}
      role="img"
      aria-label={product.name}
    />
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
  defaultGuestName = '',
  defaultGuestPhone = '',
  isPublicLocation = false,
  returnedXenditSessionId = null,
  returnedXenditResult = null,
}: {
  tagCode: string;
  products: Product[];
  currency: string;
  taxRate?: number;
  serviceChargeRate?: number;
  defaultGuestName?: string;
  defaultGuestPhone?: string;
  isPublicLocation?: boolean;
  returnedXenditSessionId?: string | null;
  returnedXenditResult?: 'success' | 'cancelled' | null;
}) {
  const router = useRouter();

  const [screen, setScreen] = useState<'menu' | 'cart'>('menu');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [guestName, setGuestName] = useState(defaultGuestName);
  const [guestPhone, setGuestPhone] = useState(defaultGuestPhone);
  const [roomNumber, setRoomNumber] = useState('');
  const [roomPasscode, setRoomPasscode] = useState('');
  const [notes, setNotes] = useState('');
  const [orderType, setOrderType] = useState<OrderType>('ROOM_SERVICE');
  const [confirmedClause, setConfirmedClause] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<
    'ROOM_CHARGE' | 'PAY_AT_COUNTER' | 'CASH' | 'XENDIT'
  >('ROOM_CHARGE');

  const [fulfillmentTiming, setFulfillmentTiming] =
  useState<FulfillmentTimingValue>('ASAP');
const [scheduledDate, setScheduledDate] = useState('');
const [scheduledTime, setScheduledTime] = useState('');
const [scheduledNote, setScheduledNote] = useState('');

  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [existingXenditSession, setExistingXenditSession] =
    useState<ActiveFoodXenditSession | null>(null);
  const [xenditGuardBusy, setXenditGuardBusy] = useState(false);

  useEffect(() => {
    setGuestName(defaultGuestName);
  }, [defaultGuestName]);

  useEffect(() => {
    setGuestPhone(defaultGuestPhone);
  }, [defaultGuestPhone]);

  const checkoutDraftStorageKey = `cloudview-food-checkout-draft:${tagCode}`;

  useEffect(() => {
    let disposed = false;

    async function restoreCheckoutDraft() {
      try {
        const rawDraft = window.sessionStorage.getItem(checkoutDraftStorageKey);

        if (!rawDraft) {
          return;
        }

        const draft = JSON.parse(rawDraft) as Partial<StoredFoodCheckoutDraft>;

        /**
         * A paid checkout is authoritative. Do not restore its old cart after
         * the guest returns from Xendit or revisits the menu.
         */
        if (
          draft.paymentMethod === 'XENDIT' &&
          typeof draft.xenditSessionId === 'string' &&
          draft.xenditSessionId.trim()
        ) {
          const paymentStatus = await getGuestFoodXenditStatus({
            tagCode,
            paymentSessionId: draft.xenditSessionId,
          });

          if (disposed) {
            return;
          }

          if (
            paymentStatus.ok &&
            paymentStatus.status === 'COMPLETED' &&
            paymentStatus.orderCode
          ) {
            window.sessionStorage.removeItem(checkoutDraftStorageKey);
            setCart([]);
            setConfirmedClause(false);
            router.push(
              `/t/${tagCode}/confirmed/${paymentStatus.orderCode}`
            );
            return;
          }

          if (
            paymentStatus.ok &&
            paymentStatus.status &&
            [
              'PENDING',
              'PAID',
              'PROCESSING',
              'COMPLETED',
              'PAID_REVIEW_REQUIRED',
            ].includes(paymentStatus.status)
          ) {
            setExistingXenditSession({
              sessionId: draft.xenditSessionId,
              status:
                paymentStatus.status as ExistingXenditGuardStatus,
              checkoutUrl: paymentStatus.checkoutUrl,
              errorMessage: paymentStatus.errorMessage,
            });
          } else if (paymentStatus.ok && paymentStatus.shouldClearCart) {
            window.sessionStorage.removeItem(checkoutDraftStorageKey);
            setCart([]);
            setConfirmedClause(false);
            return;
          }
        }

        const restoredCart = Array.isArray(draft.cart)
          ? draft.cart.filter(
              (item): item is CartItem =>
                Boolean(item) &&
                typeof item.productId === 'string' &&
                Number.isInteger(item.quantity) &&
                item.quantity > 0
            )
          : [];

        if (disposed) {
          return;
        }

        setCart(restoredCart);

        if (typeof draft.guestName === 'string') setGuestName(draft.guestName);
        if (typeof draft.guestPhone === 'string') setGuestPhone(draft.guestPhone);
        if (typeof draft.roomNumber === 'string') setRoomNumber(draft.roomNumber);
        if (typeof draft.notes === 'string') setNotes(draft.notes);
        if (draft.orderType && draft.orderType in orderTypeLabels) {
          setOrderType(draft.orderType as OrderType);
        }
        if (typeof draft.confirmedClause === 'boolean') {
          setConfirmedClause(draft.confirmedClause);
        }
        // Older browser drafts may still contain POS from the former
        // manual Card / E-wallet option. Route those drafts through the
        // single Xendit hosted checkout instead of restoring a legacy path.
        if (draft.paymentMethod === 'XENDIT' || draft.paymentMethod === 'POS') {
          setPaymentMethod('XENDIT');
        }
        if (draft.fulfillmentTiming === 'SCHEDULED') {
          setFulfillmentTiming('SCHEDULED');
        }
        if (typeof draft.scheduledDate === 'string') {
          setScheduledDate(draft.scheduledDate);
        }
        if (typeof draft.scheduledTime === 'string') {
          setScheduledTime(draft.scheduledTime);
        }
        if (typeof draft.scheduledNote === 'string') {
          setScheduledNote(draft.scheduledNote);
        }
      } catch {
        window.sessionStorage.removeItem(checkoutDraftStorageKey);
      }
    }

    void restoreCheckoutDraft();

    return () => {
      disposed = true;
    };
  }, [checkoutDraftStorageKey, router, tagCode]);

  useEffect(() => {
    if (screen !== 'cart') {
      return;
    }

    /**
     * The menu and cart are rendered by the same client component, so changing
     * the screen does not trigger Next.js route-scroll restoration.
     * Reset the document scroll after the cart layout has rendered.
     */
    const timer = window.setTimeout(() => {
      window.scrollTo({
        top: 0,
        left: 0,
        behavior: 'auto',
      });

      // Compatibility for older mobile Safari/WebView implementations.
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }, 0);

    return () => window.clearTimeout(timer);
  }, [screen]);

  function saveCheckoutDraft(xenditSessionId?: string) {
    const draft: StoredFoodCheckoutDraft = {
      cart,
      guestName,
      guestPhone,
      roomNumber,
      notes,
      orderType,
      confirmedClause,
      paymentMethod,
      fulfillmentTiming,
      scheduledDate,
      scheduledTime,
      scheduledNote,
      xenditSessionId,
    };

    try {
      window.sessionStorage.setItem(
        checkoutDraftStorageKey,
        JSON.stringify(draft)
      );
    } catch {
      // The server still stores the authoritative paid checkout payload.
    }
  }

  function clearCheckoutDraft() {
    try {
      window.sessionStorage.removeItem(checkoutDraftStorageKey);
    } catch {
      // Ignore browser storage failures.
    }
  }

  async function refreshExistingFoodPayment(sessionId?: string) {
    const activeSessionId =
      sessionId || existingXenditSession?.sessionId || '';

    if (!activeSessionId || xenditGuardBusy) {
      return;
    }

    setXenditGuardBusy(true);

    try {
      let status = await getGuestFoodXenditStatus({
        tagCode,
        paymentSessionId: activeSessionId,
      });

      if (!status.ok) {
        setError(status.error || 'Unable to read the Xendit payment status.');
        return;
      }

      if (status.status === 'PAID') {
        await finalizeGuestFoodXenditCheckout({
          tagCode,
          paymentSessionId: activeSessionId,
        });

        status = await getGuestFoodXenditStatus({
          tagCode,
          paymentSessionId: activeSessionId,
        });

        if (!status.ok) {
          setError(
            status.error || 'Unable to confirm the finalized food order.'
          );
          return;
        }
      }

      if (status.status === 'COMPLETED' && status.orderCode) {
        clearCheckoutDraft();
        setExistingXenditSession(null);
        setCart([]);
        setConfirmedClause(false);
        router.push(`/t/${tagCode}/confirmed/${status.orderCode}`);
        return;
      }

      if (
        status.status &&
        [
          'PENDING',
          'PAID',
          'PROCESSING',
          'COMPLETED',
          'PAID_REVIEW_REQUIRED',
        ].includes(status.status)
      ) {
        setExistingXenditSession({
          sessionId: activeSessionId,
          status: status.status as ExistingXenditGuardStatus,
          checkoutUrl: status.checkoutUrl,
          errorMessage: status.errorMessage,
        });
        return;
      }

      setExistingXenditSession(null);
      saveCheckoutDraft(undefined);
      setError(
        status.errorMessage ||
          `Payment status: ${String(status.status || 'UNKNOWN').replaceAll(
            '_',
            ' '
          )}`
      );
    } finally {
      setXenditGuardBusy(false);
    }
  }

  async function cancelExistingFoodPayment() {
    const active = existingXenditSession;

    if (!active || xenditGuardBusy) {
      return;
    }

    setXenditGuardBusy(true);

    try {
      const result = await cancelGuestFoodXenditCheckout({
        tagCode,
        paymentSessionId: active.sessionId,
      });

      if (!result.ok) {
        if ('paymentCompleted' in result && result.paymentCompleted) {
          setXenditGuardBusy(false);
          await refreshExistingFoodPayment(active.sessionId);
          return;
        }

        setError(result.error);
        return;
      }

      setExistingXenditSession(null);
      saveCheckoutDraft(undefined);
      setScreen('cart');
      setError(
        'The existing Xendit checkout was cancelled. You may now review the cart and start a new payment.'
      );
    } finally {
      setXenditGuardBusy(false);
    }
  }

  function continueExistingFoodPayment() {
    const active = existingXenditSession;

    if (!active) {
      return;
    }

    if (active.status === 'PENDING' && active.checkoutUrl) {
      window.location.assign(active.checkoutUrl);
      return;
    }

    window.location.assign(
      `/t/${tagCode}/payment?session=${encodeURIComponent(
        active.sessionId
      )}&flow=food`
    );
  }

  useEffect(() => {
    if (
      !existingXenditSession ||
      existingXenditSession.status === 'PENDING' ||
      existingXenditSession.status === 'PAID_REVIEW_REQUIRED'
    ) {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshExistingFoodPayment(existingXenditSession.sessionId);
    }, 2000);

    return () => window.clearInterval(timer);
    // The session ID/status intentionally controls the recovery poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingXenditSession?.sessionId, existingXenditSession?.status]);

  useEffect(() => {
    if (!returnedXenditSessionId) {
      return;
    }

    let cancelled = false;
    let timer: number | null = null;

    function cleanXenditQuery() {
      const url = new URL(window.location.href);
      url.searchParams.delete('xendit');
      url.searchParams.delete('xenditResult');
      router.replace(`${url.pathname}${url.search}`, { scroll: false });
    }

    async function handleCancelledCheckout() {
      const result = await cancelGuestFoodXenditCheckout({
        tagCode,
        paymentSessionId: returnedXenditSessionId!,
      });

      if (cancelled) return;

      setScreen('cart');
      setError(
        result.ok
          ? 'Xendit checkout was cancelled. No order was created and no inventory was deducted.'
          : result.error
      );
      cleanXenditQuery();
    }

    if (returnedXenditResult === 'cancelled') {
      void handleCancelledCheckout();

      return () => {
        cancelled = true;
      };
    }

    async function waitForPayment(attempt = 0) {
      const status = await getGuestFoodXenditStatus({
        tagCode,
        paymentSessionId: returnedXenditSessionId!,
      });

      if (cancelled) return;

      if (!status.ok) {
        setScreen('cart');
        setError(status.error || 'Unable to confirm Xendit payment.');
        cleanXenditQuery();
        return;
      }

      if (status.status === 'COMPLETED' && status.orderCode) {
        clearCart();
        cleanXenditQuery();
        router.push(`/t/${tagCode}/confirmed/${status.orderCode}`);
        return;
      }

      if (status.status === 'PAID') {
        const result = await finalizeGuestFoodXenditCheckout({
          tagCode,
          paymentSessionId: returnedXenditSessionId!,
        });

        if (cancelled) return;

        if (result.ok) {
          clearCart();
          cleanXenditQuery();
          router.push(`/t/${tagCode}/confirmed/${result.orderCode}`);
          return;
        }

        if (!result.waiting) {
          clearCart();
          setScreen('menu');
          setError(result.error);
          cleanXenditQuery();
          return;
        }
      }

      if (
        status.status === 'FAILED' ||
        status.status === 'EXPIRED' ||
        status.status === 'CANCELLED' ||
        status.status === 'PAID_REVIEW_REQUIRED' ||
        status.status === 'REFUND_PENDING' ||
        status.status === 'REFUND_FAILED' ||
        status.status === 'REFUNDED'
      ) {
        if (status.shouldClearCart) {
          clearCart();
          setScreen('menu');
        } else {
          setScreen('cart');
        }

        setError(
          status.errorMessage ||
            (status.status === 'REFUNDED'
              ? 'Payment was refunded because the order could not be completed.'
              : `Payment status: ${status.status.replaceAll('_', ' ')}`)
        );
        cleanXenditQuery();
        return;
      }

      if (attempt >= 39) {
        setScreen('cart');
        setError(
          'Payment is still being confirmed. Open My Orders in a moment or contact the front desk.'
        );
        cleanXenditQuery();
        return;
      }

      timer = window.setTimeout(() => waitForPayment(attempt + 1), 1500);
    }

    void waitForPayment();

    return () => {
      cancelled = true;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
    // Handle one Xendit return per URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnedXenditResult, returnedXenditSessionId, tagCode]);

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

  function getScheduledForIso() {
  if (fulfillmentTiming !== 'SCHEDULED') {
    return '';
  }

  if (!scheduledDate || !scheduledTime) {
    return null;
  }

  const date = new Date(`${scheduledDate}T${scheduledTime}:00`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

  const requiresRoomVerification =
    isPublicLocation &&
    (paymentMethod === 'ROOM_CHARGE' || orderType === 'ROOM_SERVICE');

  function submit() {
    setError(null);

    if (existingXenditSession) {
      setError(
        'An existing Xendit checkout must be continued or cancelled before another payment can be created.'
      );
      return;
    }

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

    if (guestName.trim().length < 2) {
      setError('Please enter the guest name.');
      return;
    }

    const phoneDigits = guestPhone.replace(/\D/g, '');

    if (phoneDigits.length < 7 || phoneDigits.length > 15) {
      setError('Please enter a valid guest phone number.');
      return;
    }

    if (requiresRoomVerification && !roomNumber.trim()) {
      setError('Please enter the room number for delivery or room charging.');
      return;
    }

    if (requiresRoomVerification && !/^\d{6}$/.test(roomPasscode.trim())) {
      setError('Please enter the six-digit room passcode.');
      return;
    }

    if (!confirmedClause) {
      setError('Please confirm the order type before placing your order.');
      return;
    }

    const scheduledForIso = getScheduledForIso();

      if (fulfillmentTiming === 'SCHEDULED') {
        if (!scheduledForIso) {
          setError('Please select a valid scheduled date and time.');
          return;
        }

        if (new Date(scheduledForIso).getTime() <= Date.now() + 60_000) {
          setError('Scheduled order time must be in the future.');
          return;
        }
      }

    startTransition(async () => {
      try {
        const finalNotes = buildOrderNotes({
          orderType,
          notes,
        });

        if (paymentMethod === 'XENDIT') {
          const checkout = await createGuestFoodXenditCheckout({
            tagCode,
            guestName,
            guestPhone,
            notes: finalNotes,
            orderType,
            roomNumber: requiresRoomVerification ? roomNumber : '',
            roomPasscode: requiresRoomVerification ? roomPasscode : '',
            fulfillmentTiming,
            scheduledFor: scheduledForIso || '',
            scheduledNote,
            items: cart,
          });

          if (!checkout.ok) {
            if (
              'existingSession' in checkout &&
              checkout.existingSession &&
              checkout.sessionId &&
              checkout.status
            ) {
              saveCheckoutDraft(checkout.sessionId);
              setExistingXenditSession({
                sessionId: checkout.sessionId,
                status:
                  checkout.status as ExistingXenditGuardStatus,
                checkoutUrl: checkout.checkoutUrl,
                errorMessage: checkout.error,
              });
            }

            setError(checkout.error);
            return;
          }

          saveCheckoutDraft(checkout.sessionId);
          window.location.assign(checkout.checkoutUrl);
          return;
        }

        const result = await createGuestOrder({
          tagCode,
          guestName,
          guestPhone,
          notes: finalNotes,
          orderType,
          roomNumber: requiresRoomVerification ? roomNumber : '',
          roomPasscode: requiresRoomVerification ? roomPasscode : '',
          paymentMethod,
          fulfillmentTiming,
          scheduledFor: scheduledForIso || '',
          scheduledNote,
          items: cart,
        });

        if (result.ok) {
          clearCheckoutDraft();
          router.push(`/t/${tagCode}/confirmed/${result.orderCode}`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unable to submit order.');
      }
    });
  }

  const remainingProducts = featured
    ? filteredProducts.filter((product) => product.id !== featured.id)
    : filteredProducts;

  function openCart() {
    setError(null);
    setScreen('cart');
  }

  function clearCart() {
    setCart([]);
    setError(null);
    setConfirmedClause(false);
    clearCheckoutDraft();
  }

  if (screen === 'cart') {
    return (
      <div className="-mx-5 -mt-3 min-h-[calc(100vh-5rem)] bg-[#070706] px-5 pb-32 pt-3 text-white">
        <ExistingXenditSessionGuard
          open={Boolean(existingXenditSession)}
          title={
            existingXenditSession?.status === 'PENDING'
              ? 'Payment already in progress'
              : 'Payment received'
          }
          description={
            existingXenditSession?.status === 'PENDING'
              ? 'This food order already has an active Xendit payment link. A second checkout is blocked.'
              : 'CloudView is recovering and finalizing the paid food order automatically.'
          }
          sessionReference={existingXenditSession?.sessionId || ''}
          status={existingXenditSession?.status || 'PENDING'}
          checkoutUrl={existingXenditSession?.checkoutUrl}
          busy={xenditGuardBusy}
          dark
          onContinue={continueExistingFoodPayment}
          onRefresh={() => void refreshExistingFoodPayment()}
          onCancel={() => void cancelExistingFoodPayment()}
        />
        <div className="mb-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setScreen('menu')}
            className="grid size-11 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-white/75 transition hover:bg-white/10 hover:text-white"
            aria-label="Back to menu"
          >
            <ArrowLeft className="size-5" />
          </button>

          <div className="min-w-0 flex-1 text-center">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gold">
              Final step
            </p>
            <h2 className="mt-1 font-serif text-2xl font-normal tracking-wide text-white">
              Review your order
            </h2>
            <p className="mt-1 text-xs font-medium text-white/45">
              {itemCount} item{itemCount === 1 ? '' : 's'} · {money(total, currency)}
            </p>
          </div>

          {cart.length > 0 ? (
            <button
              type="button"
              onClick={clearCart}
              className="grid size-11 shrink-0 place-items-center rounded-full border border-red-400/15 bg-red-500/10 text-red-200 transition hover:bg-red-500/20"
              aria-label="Clear cart"
            >
              <Trash2 className="size-4.5" />
            </button>
          ) : (
            <div className="size-11" />
          )}
        </div>

        {cart.length === 0 ? (
          <section className="grid min-h-[62vh] place-items-center rounded-[2rem] border border-white/10 bg-white/[0.035] p-8 text-center shadow-[0_24px_70px_rgba(0,0,0,0.28)]">
            <div>
              <div className="mx-auto grid size-20 place-items-center rounded-full border border-gold/20 bg-gold/10 text-gold">
                <ShoppingBag className="size-8" strokeWidth={1.5} />
              </div>
              <h3 className="mt-6 font-serif text-3xl font-normal tracking-wide text-white">
                Your cart is empty
              </h3>
              <p className="mx-auto mt-3 max-w-xs text-sm font-medium leading-6 text-white/50">
                Browse the menu and add dishes prepared for your stay.
              </p>
              <button
                type="button"
                onClick={() => setScreen('menu')}
                className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-gold px-6 text-sm font-black text-black transition hover:brightness-110 active:scale-[0.98]"
              >
                Browse Menu
                <ChevronRight className="size-4" />
              </button>
            </div>
          </section>
        ) : (
          <>
            <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] shadow-[0_24px_70px_rgba(0,0,0,0.25)]">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gold">
                    Selected dishes
                  </p>
                  <p className="mt-1 text-sm font-semibold text-white/55">
                    Adjust quantities before checkout
                  </p>
                </div>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black text-white/70">
                  {itemCount}
                </span>
              </div>

              <div className="divide-y divide-white/10">
                {cart.map((item) => {
                  const product = productMap.get(item.productId)!;
                  const availableQty = getProductAvailableQty(product);
                  const canIncrease =
                    !isProductSoldOut(product) && item.quantity < availableQty;

                  return (
                    <article
                      key={item.productId}
                      className="grid grid-cols-[76px_1fr_auto] gap-3 p-4"
                    >
                      <ProductImage
                        product={product}
                        className="size-[76px] rounded-2xl border border-white/10"
                      />

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="line-clamp-2 font-serif text-[17px] font-medium leading-tight tracking-wide text-white">
                            {product.name}
                          </h3>
                          {isBundleProduct(product) ? (
                            <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-gold">
                              Bundle
                            </span>
                          ) : null}
                        </div>

                        <p className="mt-1 text-sm font-black text-gold">
                          {simpleMoney(product.priceCents, currency)}
                        </p>

                        <div className="mt-3 inline-flex items-center rounded-full border border-white/10 bg-black/30 p-1">
                          <TapButton
                            onTap={() =>
                              updateQty(item.productId, item.quantity - 1)
                            }
                            className="grid size-8 place-items-center rounded-full text-white/65 transition hover:bg-white/10 hover:text-white"
                            aria-label={`Decrease ${product.name}`}
                          >
                            <Minus className="size-3.5" />
                          </TapButton>

                          <span className="min-w-8 text-center text-sm font-black text-white">
                            {item.quantity}
                          </span>

                          <TapButton
                            onTap={() =>
                              updateQty(item.productId, item.quantity + 1)
                            }
                            disabled={!canIncrease}
                            className="grid size-8 place-items-center rounded-full text-white/65 transition hover:bg-white/10 hover:text-white"
                            aria-label={`Increase ${product.name}`}
                          >
                            <Plus className="size-3.5" />
                          </TapButton>
                        </div>
                      </div>

                      <div className="flex flex-col items-end justify-between gap-3">
                        <TapButton
                          onTap={() => updateQty(item.productId, 0)}
                          className="grid size-9 place-items-center rounded-full text-white/35 transition hover:bg-red-500/10 hover:text-red-200"
                          aria-label={`Remove ${product.name}`}
                        >
                          <X className="size-4" />
                        </TapButton>
                        <p className="text-sm font-black text-white">
                          {money(product.priceCents * item.quantity, currency)}
                        </p>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="mt-5 rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.2)]">
              <div className="mb-5 flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-2xl bg-gold/15 text-gold">
                  <ReceiptText className="size-5" />
                </span>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gold">
                    Guest details
                  </p>
                  <h3 className="mt-1 font-serif text-xl font-normal tracking-wide text-white">
                    Delivery preferences
                  </h3>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.16em] text-white/45">
                    Ordered by
                  </label>
                  <input
                    type="text"
                    autoComplete="name"
                    required
                    placeholder="Guest name"
                    value={guestName}
                    onChange={(event) =>
                      setGuestName(event.currentTarget.value)
                    }
                    className={cn(checkoutFieldClass, 'h-14')}
                    style={checkoutFieldStyle}
                  />
                  <p className="mt-2 text-xs font-medium leading-5 text-white/40">
                    Auto-filled from the active stay. Confirm the name before ordering.
                  </p>
                </div>

                <div>
                  <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.16em] text-white/45">
                    Phone number
                  </label>
                  <div className="relative">
                    <Phone className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-gold" />
                    <input
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      required
                      placeholder="09XX XXX XXXX"
                      value={guestPhone}
                      onChange={(event) => setGuestPhone(event.currentTarget.value)}
                      className={cn(checkoutFieldClass, 'h-14 pl-11')}
                      style={checkoutFieldStyle}
                    />
                  </div>
                  <p className="mt-2 text-xs font-medium leading-5 text-white/40">
                    Required so hotel staff can contact you about this order.
                  </p>
                </div>

                <div>
                  <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.16em] text-white/45">
                    Order type
                  </label>
                  <select
                    value={orderType}
                    onChange={(event) => {
                      setOrderType(event.currentTarget.value as OrderType);
                      setConfirmedClause(false);
                    }}
                    className={cn(
                      checkoutFieldClass,
                      'h-14 appearance-auto [color-scheme:dark]'
                    )}
                    style={checkoutFieldStyle}
                  >
                    <option value="ROOM_SERVICE" className="bg-[#111] text-white">
                      Room Service / Deliver to Room
                    </option>
                    <option value="DINE_IN" className="bg-[#111] text-white">
                      Dine In
                    </option>
                    <option value="TAKE_OUT" className="bg-[#111] text-white">
                      Take Out
                    </option>
                    <option value="PICK_UP" className="bg-[#111] text-white">
                      Pick Up at Counter
                    </option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.16em] text-white/45">
                    Order time
                  </label>
                  <select
                    value={fulfillmentTiming}
                    onChange={(event) =>
                      setFulfillmentTiming(
                        event.currentTarget.value as FulfillmentTimingValue
                      )
                    }
                    className={cn(
                      checkoutFieldClass,
                      'h-14 appearance-auto [color-scheme:dark]'
                    )}
                    style={checkoutFieldStyle}
                  >
                    <option value="ASAP" className="bg-[#111] text-white">
                      ASAP / Send to kitchen now
                    </option>
                    <option value="SCHEDULED" className="bg-[#111] text-white">
                      Schedule for later
                    </option>
                  </select>
                </div>

                {fulfillmentTiming === 'SCHEDULED' ? (
                  <div className="rounded-[1.5rem] border border-gold/20 bg-gold/[0.07] p-4">
                    <div className="flex items-center gap-2 text-gold">
                      <Clock3 className="size-4" />
                      <p className="text-[10px] font-black uppercase tracking-[0.16em]">
                        Scheduled order
                      </p>
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <input
                        type="date"
                        value={scheduledDate}
                        onChange={(event) =>
                          setScheduledDate(event.currentTarget.value)
                        }
                        className={cn(
                          checkoutFieldClass,
                          'h-14 border-gold/25 [color-scheme:dark]'
                        )}
                        style={checkoutFieldStyle}
                      />
                      <input
                        type="time"
                        value={scheduledTime}
                        onChange={(event) =>
                          setScheduledTime(event.currentTarget.value)
                        }
                        className={cn(
                          checkoutFieldClass,
                          'h-14 border-gold/25 [color-scheme:dark]'
                        )}
                        style={checkoutFieldStyle}
                      />
                    </div>

                    <textarea
                      rows={3}
                      className={cn(
                        checkoutFieldClass,
                        'mt-3 min-h-24 resize-y border-gold/25 p-4 leading-6'
                      )}
                      placeholder="Optional schedule note"
                      value={scheduledNote}
                      onChange={(event) =>
                        setScheduledNote(event.currentTarget.value)
                      }
                      style={checkoutFieldStyle}
                    />
                  </div>
                ) : null}

                <div>
                  <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.16em] text-white/45">
                    Payment method
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(event) =>
                      setPaymentMethod(
                        event.currentTarget.value as
                          | 'ROOM_CHARGE'
                          | 'PAY_AT_COUNTER'
                          | 'CASH'
                          | 'XENDIT'
                      )
                    }
                    className={cn(
                      checkoutFieldClass,
                      'h-14 appearance-auto [color-scheme:dark]'
                    )}
                    style={checkoutFieldStyle}
                  >
                    <option value="ROOM_CHARGE" className="bg-[#111] text-white">
                      Room charge
                    </option>
                    <option
                      value="PAY_AT_COUNTER"
                      className="bg-[#111] text-white"
                    >
                      Pay at counter
                    </option>
                    <option value="CASH" className="bg-[#111] text-white">
                      Cash
                    </option>
                    <option value="XENDIT" className="bg-[#111] text-white">
                      Card / E-wallet / QR Ph (Xendit)
                    </option>
                  </select>

                  {paymentMethod === 'XENDIT' ? (
                    <div className="mt-3 flex items-start gap-3 rounded-[1.5rem] border border-gold/20 bg-gold/[0.08] p-4">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold text-black">
                        <CreditCard className="size-5" />
                      </span>
                      <div>
                        <p className="text-sm font-black text-white">
                          Secure online payment via Xendit
                        </p>
                        <p className="mt-1 text-xs font-medium leading-5 text-white/55">
                          Choose Card, GCash, Maya, QR Ph, or another enabled method on Xendit. The order and stock deduction happen only after payment confirmation.
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>

                {isPublicLocation ? (
                  <div className={cn(
                    'rounded-[1.5rem] border p-4',
                    requiresRoomVerification
                      ? 'border-gold/35 bg-gold/[0.08]'
                      : 'border-white/10 bg-white/[0.03]'
                  )}>
                    <div className="flex items-start gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold text-black">
                        <BedDouble className="size-5" />
                      </span>
                      <div>
                        <p className="text-sm font-black text-white">Secure room assignment</p>
                        <p className="mt-1 text-xs font-medium leading-5 text-white/50">
                          {requiresRoomVerification
                            ? 'Room number and passcode are required for room delivery or room charging from this public NFC location.'
                            : 'Room verification is not needed for this order type and payment method.'}
                        </p>
                      </div>
                    </div>

                    {requiresRoomVerification ? (
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <input
                          type="text"
                          inputMode="text"
                          autoComplete="off"
                          required
                          placeholder="Room number"
                          value={roomNumber}
                          onChange={(event) => setRoomNumber(event.currentTarget.value)}
                          className={cn(checkoutFieldClass, 'h-14')}
                          style={checkoutFieldStyle}
                        />
                        <div className="relative">
                          <KeyRound className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-gold" />
                          <input
                            type="password"
                            inputMode="numeric"
                            pattern="[0-9]{6}"
                            maxLength={6}
                            autoComplete="one-time-code"
                            required
                            placeholder="6-digit passcode"
                            value={roomPasscode}
                            onChange={(event) =>
                              setRoomPasscode(event.currentTarget.value.replace(/\D/g, '').slice(0, 6))
                            }
                            className={cn(checkoutFieldClass, 'h-14 pl-11 font-mono tracking-[0.18em]')}
                            style={checkoutFieldStyle}
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <textarea
                  rows={4}
                  placeholder="Special instructions, allergies, or requests"
                  value={notes}
                  onChange={(event) => setNotes(event.currentTarget.value)}
                  className={cn(
                    checkoutFieldClass,
                    'min-h-28 resize-y p-4 leading-6'
                  )}
                  style={checkoutFieldStyle}
                />

                <label className="flex cursor-pointer items-start gap-3 rounded-[1.5rem] border border-gold/15 bg-gold/[0.07] p-4 text-sm font-semibold leading-6 text-gold/90 transition hover:bg-gold/10">
                  <input
                    type="checkbox"
                    checked={confirmedClause}
                    onChange={(event) =>
                      setConfirmedClause(event.target.checked)
                    }
                    className="mt-1 size-5 shrink-0 rounded border border-gold/50 bg-black accent-[#d6a738]"
                  />
                  <span>
                    I confirm this order is for{' '}
                    <b className="text-white">{orderTypeLabels[orderType]}</b>.
                  </span>
                </label>
              </div>
            </section>

            <section className="mt-5 rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-2xl bg-gold/15 text-gold">
                  <Sparkles className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gold">
                    CloudView Rewards
                  </p>
                  <p className="mt-1 text-sm font-semibold leading-5 text-white/65">
                    Link your rewards profile before checkout to earn points.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => router.push(`/t/${tagCode}/rewards`)}
                  className="shrink-0 rounded-xl border border-gold/25 bg-gold/10 px-3 py-2 text-xs font-black text-gold transition hover:bg-gold/20"
                >
                  View
                </button>
              </div>
            </section>

            <section className="mt-5 rounded-[2rem] border border-gold/20 bg-[linear-gradient(145deg,rgba(214,167,56,0.14),rgba(255,255,255,0.035))] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.25)]">
              <div className="space-y-3 text-sm">
                <div className="flex justify-between gap-4 text-white/55">
                  <span>Subtotal</span>
                  <b className="text-white">{money(subtotal, currency)}</b>
                </div>
                <div className="flex justify-between gap-4 text-white/55">
                  <span>Service charge ({Math.round(serviceChargeRate * 100)}%)</span>
                  <b className="text-white">{money(serviceCharge, currency)}</b>
                </div>
                {taxRate > 0 ? (
                  <div className="flex justify-between gap-4 text-white/55">
                    <span>Tax ({Math.round(taxRate * 100)}%)</span>
                    <b className="text-white">{money(tax, currency)}</b>
                  </div>
                ) : null}
                <div className="border-t border-white/10 pt-4">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gold">
                        Total
                      </p>
                      <p className="mt-1 text-xs text-white/40">
                        {itemCount} item{itemCount === 1 ? '' : 's'}
                      </p>
                    </div>
                    <p className="font-serif text-3xl font-normal tracking-wide text-white">
                      {money(total, currency)}
                    </p>
                  </div>
                </div>
              </div>

              {error ? (
                <p className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 p-3 text-sm font-bold text-red-200">
                  {error}
                </p>
              ) : null}

              <button
                type="button"
                onClick={submit}
                disabled={pending || !confirmedClause}
                className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gold px-5 text-[15px] font-black text-black shadow-[0_14px_34px_rgba(214,167,56,0.24)] transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {pending ? (
                  paymentMethod === 'XENDIT'
                    ? 'Opening Xendit...'
                    : 'Submitting...'
                ) : (
                  <>
                    {paymentMethod === 'XENDIT'
                      ? 'Continue to Secure Payment'
                      : 'Place Order'}
                    {paymentMethod === 'XENDIT' ? (
                      <CreditCard className="size-4.5" />
                    ) : (
                      <PackageCheck className="size-4.5" />
                    )}
                  </>
                )}
              </button>
            </section>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="-mx-5 -mt-3 min-h-[calc(100vh-5rem)] bg-[#050505] px-5 pb-40 pt-3 text-white">
      <ExistingXenditSessionGuard
          open={Boolean(existingXenditSession)}
          title={
            existingXenditSession?.status === 'PENDING'
              ? 'Payment already in progress'
              : 'Payment received'
          }
          description={
            existingXenditSession?.status === 'PENDING'
              ? 'This food order already has an active Xendit payment link. A second checkout is blocked.'
              : 'CloudView is recovering and finalizing the paid food order automatically.'
          }
          sessionReference={existingXenditSession?.sessionId || ''}
          status={existingXenditSession?.status || 'PENDING'}
          checkoutUrl={existingXenditSession?.checkoutUrl}
          busy={xenditGuardBusy}
          dark
          onContinue={continueExistingFoodPayment}
          onRefresh={() => void refreshExistingFoodPayment()}
          onCancel={() => void cancelExistingFoodPayment()}
        />
      <div className="mb-5 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => router.push(`/t/${tagCode}`)}
          className="grid size-11 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-white/70 transition hover:bg-white/10 hover:text-white"
          aria-label="Back"
        >
          <ArrowLeft className="size-5" />
        </button>

        <div className="min-w-0 flex-1 px-1">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gold">
            In-room dining
          </p>
          <p className="mt-1 truncate font-serif text-xl font-normal tracking-wide text-white">
            Curated for your stay
          </p>
        </div>

        <button
          type="button"
          onClick={openCart}
          className="relative grid size-11 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-white transition hover:bg-white/10"
          aria-label="Open cart"
        >
          <ShoppingBag className="size-5" />
          {itemCount > 0 ? (
            <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-gold text-[10px] font-black text-black ring-2 ring-black">
              {itemCount}
            </span>
          ) : null}
        </button>
      </div>

      <section className="mb-5 overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(214,167,56,0.16),transparent_34%),linear-gradient(145deg,#161512,#0b0b0a)] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.28)]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-gold/20 bg-gold/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-gold">
              <ChefHat className="size-3.5" />
              Hotel dining
            </div>
            <h2 className="mt-4 max-w-[16rem] font-serif text-[2rem] font-normal leading-[1.05] tracking-tight text-white">
              Delicious moments, delivered.
            </h2>
            <p className="mt-3 max-w-xs text-sm font-medium leading-6 text-white/55">
              Browse available dishes, bundles, and room-service favourites.
            </p>
          </div>

          <span className="grid size-14 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.05] text-gold">
            <Utensils className="size-6" strokeWidth={1.5} />
          </span>
        </div>

      </section>

      <div className="sticky top-[4.5rem] z-40 -mx-1 mb-6 rounded-[1.75rem] border border-white/10 bg-black/85 p-2 shadow-[0_18px_45px_rgba(0,0,0,0.28)] backdrop-blur-xl">
        <div className="flex h-12 items-center gap-3 rounded-2xl bg-white/[0.07] px-4 transition focus-within:bg-white/[0.1] focus-within:ring-1 focus-within:ring-gold/35">
          <Search className="size-4.5 shrink-0 text-gold" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search dishes, bundles, or categories"
            className="w-full bg-transparent text-sm font-semibold text-white outline-none placeholder:text-white/35"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="grid size-8 shrink-0 place-items-center rounded-full text-white/40 transition hover:bg-white/10 hover:text-white"
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>

        <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {categories.map((category) => {
            const active = category === activeCategory;
            const count =
              category === 'All'
                ? products.length
                : products.filter((product) => product.categoryName === category)
                    .length;

            return (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category)}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-full border px-4 py-2.5 text-xs font-black transition active:scale-[0.98]',
                  active
                    ? 'border-gold bg-gold text-black shadow-[0_8px_22px_rgba(214,167,56,0.18)]'
                    : 'border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.08] hover:text-white'
                )}
              >
                {category}
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[9px]',
                    active ? 'bg-black/12 text-black/70' : 'bg-white/10 text-white/45'
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {itemCount > 0 ? (
          <button
            type="button"
            onClick={openCart}
            className="mt-2 flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl bg-gold px-4 text-black shadow-[0_10px_28px_rgba(214,167,56,0.2)] transition hover:brightness-105 active:scale-[0.99]"
          >
            <span className="flex items-center gap-2 text-sm font-black">
              <ShoppingBag className="size-4" />
              Review order
            </span>
            <span className="flex items-center gap-2 text-sm font-black">
              {itemCount} item{itemCount === 1 ? '' : 's'} · {money(total, currency)}
              <ChevronRight className="size-4" />
            </span>
          </button>
        ) : null}
      </div>

      {featured ? (
        <section className="mb-7">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold">
                Chef’s selection
              </p>
              <h3 className="mt-1 font-serif text-2xl font-normal tracking-wide text-white">
                Recommended for you
              </h3>
            </div>
            <Sparkles className="size-5 text-gold" />
          </div>

          <article className="relative isolate overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.045] shadow-[0_24px_70px_rgba(0,0,0,0.22)]">
            <div className="relative">
              <ProductImage
                product={featured}
                className="h-40 w-full sm:h-48"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
              <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="line-clamp-2 font-serif text-2xl font-normal leading-tight tracking-wide text-white">
                    {featured.name}
                  </p>
                  <p className="mt-1 text-base font-black text-gold">
                    {simpleMoney(featured.priceCents, currency)}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-white/15 bg-black/50 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white/80 backdrop-blur">
                  {featured.categoryName}
                </span>
              </div>
            </div>

            <div className="p-4">
              {featured.description ? (
                <p className="line-clamp-2 text-sm font-medium leading-6 text-white/55">
                  {featured.description}
                </p>
              ) : null}

              <div className="mt-4 flex items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {isBundleProduct(featured) ? (
                    <span className="rounded-full bg-gold/15 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-gold">
                      Bundle
                    </span>
                  ) : (
                    <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white/60">
                      Single item
                    </span>
                  )}
                  <span
                    className={cn(
                      'rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest',
                      isProductSoldOut(featured)
                        ? 'bg-red-500/15 text-red-200'
                        : 'bg-emerald-400/15 text-emerald-200'
                    )}
                  >
                    {isProductSoldOut(featured)
                      ? 'Sold out'
                      : `${getProductAvailableQty(featured)} available`}
                  </span>
                </div>

                {getCartQuantity(featured.id) > 0 ? (
                  <div className="flex shrink-0 items-center rounded-full border border-gold/25 bg-gold/10 p-1">
                    <TapButton
                      onTap={() =>
                        updateQty(featured.id, getCartQuantity(featured.id) - 1)
                      }
                      className="grid size-9 place-items-center rounded-full text-gold hover:bg-gold/10"
                      aria-label={`Decrease ${featured.name}`}
                    >
                      <Minus className="size-4" />
                    </TapButton>
                    <span className="min-w-8 text-center text-sm font-black text-white">
                      {getCartQuantity(featured.id)}
                    </span>
                    <TapButton
                      onTap={() => add(featured.id)}
                      disabled={
                        isProductSoldOut(featured) ||
                        getCartQuantity(featured.id) >=
                          getProductAvailableQty(featured)
                      }
                      className="grid size-9 place-items-center rounded-full bg-gold text-black"
                      aria-label={`Increase ${featured.name}`}
                    >
                      <Plus className="size-4" />
                    </TapButton>
                  </div>
                ) : (
                  <TapButton
                    onTap={() => add(featured.id)}
                    disabled={isProductSoldOut(featured)}
                    className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-gold px-4 text-xs font-black text-black shadow-[0_10px_25px_rgba(214,167,56,0.2)]"
                    aria-label={`Add ${featured.name}`}
                  >
                    Add
                    <Plus className="size-4" />
                  </TapButton>
                )}
              </div>

              <BundleSavings product={featured} currency={currency} />
              <BundleIncludes product={featured} compact />
            </div>
          </article>
        </section>
      ) : null}

      <section>
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold">
              Explore menu
            </p>
            <h3 className="mt-1 font-serif text-2xl font-normal tracking-wide text-white">
              {activeCategory === 'All' ? 'All dishes' : activeCategory}
            </h3>
          </div>
          <p className="text-xs font-bold text-white/35">
            {remainingProducts.length} item{remainingProducts.length === 1 ? '' : 's'}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {remainingProducts.map((product) => {
            const soldOut = isProductSoldOut(product);
            const quantity = getCartQuantity(product.id);

            return (
              <article
                key={product.id}
                className={cn(
                  'group relative isolate overflow-hidden rounded-[1.6rem] border bg-white/[0.04] shadow-[0_14px_36px_rgba(0,0,0,0.16)] transition',
                  soldOut
                    ? 'border-white/8 opacity-65'
                    : quantity > 0
                      ? 'border-gold/35 bg-gold/[0.06]'
                      : 'border-white/10 hover:border-white/20 hover:bg-white/[0.06]'
                )}
              >
                <div className="relative">
                  <ProductImage
                    product={product}
                    className="aspect-[4/3] w-full transition duration-300 group-hover:scale-[1.02]"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />

                  <span className="absolute left-2.5 top-2.5 max-w-[calc(100%-1.25rem)] truncate rounded-full border border-white/10 bg-black/55 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-white/70 backdrop-blur">
                    {product.categoryName}
                  </span>

                  {soldOut ? (
                    <span className="absolute inset-x-2.5 bottom-2.5 rounded-full bg-red-600 px-3 py-1.5 text-center text-[9px] font-black uppercase tracking-widest text-white">
                      Sold out
                    </span>
                  ) : null}
                </div>

                <div className="flex min-h-[168px] flex-col p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="line-clamp-2 min-h-[2.5rem] font-serif text-[16px] font-medium leading-tight tracking-wide text-white">
                      {product.name}
                    </h4>
                    {isBundleProduct(product) ? (
                      <span className="mt-0.5 shrink-0 rounded-full bg-gold/15 px-2 py-1 text-[8px] font-black uppercase tracking-widest text-gold">
                        Set
                      </span>
                    ) : null}
                  </div>

                  {product.description ? (
                    <p className="mt-2 line-clamp-2 text-[11px] font-medium leading-4 text-white/45">
                      {product.description}
                    </p>
                  ) : (
                    <p className="mt-2 text-[11px] font-medium text-white/25">
                      Freshly prepared by the hotel kitchen.
                    </p>
                  )}

                  <div className="mt-auto pt-3">
                    <div className="flex items-end justify-between gap-2">
                      <div>
                        <p className="text-[15px] font-black text-gold">
                          {simpleMoney(product.priceCents, currency)}
                        </p>
                        {!soldOut ? (
                          <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-300/80">
                            {getProductAvailableQty(product)} available
                          </p>
                        ) : null}
                      </div>

                      {quantity > 0 ? (
                        <div className="flex shrink-0 items-center rounded-full border border-gold/25 bg-gold/10 p-0.5">
                          <TapButton
                            onTap={() => updateQty(product.id, quantity - 1)}
                            className="grid size-8 place-items-center rounded-full text-gold"
                            aria-label={`Decrease ${product.name}`}
                          >
                            <Minus className="size-3.5" />
                          </TapButton>
                          <span className="min-w-6 text-center text-xs font-black text-white">
                            {quantity}
                          </span>
                          <TapButton
                            onTap={() => add(product.id)}
                            disabled={
                              soldOut || quantity >= getProductAvailableQty(product)
                            }
                            className="grid size-8 place-items-center rounded-full bg-gold text-black"
                            aria-label={`Increase ${product.name}`}
                          >
                            <Plus className="size-3.5" />
                          </TapButton>
                        </div>
                      ) : (
                        <TapButton
                          onTap={() => add(product.id)}
                          disabled={soldOut}
                          className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-black shadow-lg"
                          aria-label={`Add ${product.name}`}
                        >
                          <Plus className="size-5" />
                        </TapButton>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {!filteredProducts.length ? (
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-9 text-center">
            <div className="mx-auto grid size-16 place-items-center rounded-full bg-white/5 text-white/35">
              <Utensils className="size-7" strokeWidth={1.5} />
            </div>
            <h3 className="mt-5 font-serif text-2xl font-normal tracking-wide text-white">
              No dishes found
            </h3>
            <p className="mx-auto mt-2 max-w-xs text-sm font-medium leading-6 text-white/45">
              Try another category or clear your search.
            </p>
            {(searchQuery || activeCategory !== 'All') ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setActiveCategory('All');
                }}
                className="mt-5 rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-3 text-sm font-black text-white"
              >
                Reset filters
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      {error ? (
        <div className="fixed inset-x-5 bottom-44 z-40 mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-red-400/20 bg-red-600/95 px-4 py-3 text-sm font-bold text-white shadow-2xl backdrop-blur">
          <X className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0 flex-1">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="grid size-7 shrink-0 place-items-center rounded-full bg-black/15"
            aria-label="Dismiss error"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}

      {itemCount > 0 ? (
        <button
          type="button"
          onClick={openCart}
          className="fixed inset-x-5 bottom-24 z-30 mx-auto flex max-w-md items-center justify-between gap-4 rounded-[1.35rem] border border-gold/25 bg-[linear-gradient(135deg,#d9ad45,#c79022)] px-4 py-3.5 text-black shadow-[0_18px_45px_rgba(214,167,56,0.28)] transition hover:brightness-105 active:scale-[0.99]"
        >
          <span className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-black/12">
              <ShoppingBag className="size-4.5" />
            </span>
            <span className="text-left">
              <span className="block text-[10px] font-black uppercase tracking-widest text-black/55">
                {itemCount} item{itemCount === 1 ? '' : 's'} selected
              </span>
              <span className="mt-0.5 block text-sm font-black">Review order</span>
            </span>
          </span>

          <span className="flex items-center gap-2 font-serif text-lg font-medium">
            {money(total, currency)}
            <ChevronRight className="size-4" />
          </span>
        </button>
      ) : null}
    </div>
  );
}