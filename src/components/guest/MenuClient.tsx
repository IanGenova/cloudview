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
  Search,
  ShoppingBag,
  Utensils,
  X,
} from 'lucide-react';
import { money } from '@/lib/money';
import { cn } from '@/lib/utils';
import { emptyState } from '@/lib/empty-state';
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
  'w-full border border-white/15 !bg-[#0b0b0b] px-4 text-[15px] font-medium !text-white caret-gold outline-none placeholder:!text-white/30 transition focus:border-gold/60 focus:ring-4 focus:ring-gold/10';

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
        'inline-flex shrink-0 touch-manipulation select-none items-center justify-center transition disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40',
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
        <span className="absolute -right-8 -top-8 size-24 border border-gold/10" />
        <span className="absolute -bottom-10 -left-8 size-28 border border-white/5" />
        <span className="relative grid size-12 place-items-center border border-white/10 bg-black/25 text-gold backdrop-blur">
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
            ? 'mt-2 bg-amber-50 p-3 text-xs font-bold text-amber-800'
            : 'mt-2 bg-amber-400/10 p-3 text-xs font-bold text-amber-100'
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
          ? 'mt-2 bg-amber-50 p-3'
          : 'mt-2 bg-amber-400/10 p-3'
      }
    >
      <p
        className={
          light
            ? 'text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700'
            : 'text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200'
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
          ? 'mt-2 flex flex-wrap gap-2 text-xs font-semibold'
          : 'mt-2 flex flex-wrap gap-2 text-xs font-semibold'
      }
    >
      {normalTotal > 0 ? (
        <span
          className={
            light
              ? 'bg-neutral-100 px-3 py-1 text-neutral-600'
              : 'bg-white/10 px-3 py-1 text-white/65'
          }
        >
          Normal: {simpleMoney(normalTotal, currency)}
        </span>
      ) : null}

      {savings > 0 ? (
        <span
          className={
            light
              ? 'bg-emerald-100 px-3 py-1 text-emerald-700'
              : 'bg-emerald-400/15 px-3 py-1 text-emerald-200'
          }
        >
          Save {simpleMoney(savings, currency)}
        </span>
      ) : null}
    </div>
  );
}

/*
 * The checkout fields that can reject an order, and the ids the error binds
 * to. Keeping them in one place is what lets a failure move focus to the box
 * it is about rather than leaving the guest to find it.
 */
type CheckoutField = 'name' | 'phone' | 'room' | 'passcode' | 'confirm';

const CHECKOUT_FIELD_IDS: Record<CheckoutField, string> = {
  name: 'menu-ordered-by',
  phone: 'menu-phone-number',
  room: 'menu-room-number',
  passcode: 'menu-room-passcode',
  confirm: 'menu-confirm-order-type',
};

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

  /*
   * IX-6. Every failure used to arrive as one sentence in a banner at the foot
   * of the form, with nothing on the field it was about: the guest read "Please
   * enter a valid guest phone number" below the Place Order button and had to
   * scroll back up and guess which box it meant. The banner stays — it is the
   * thing a screen reader announces — but the message is also attached to the
   * field, which takes focus.
   */
  const [fieldError, setFieldError] = useState<{ field: CheckoutField; message: string } | null>(null);

  function fail(field: CheckoutField, message: string) {
    setError(message);
    setFieldError({ field, message });

    const id = CHECKOUT_FIELD_IDS[field];
    window.requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      (el as HTMLElement).focus({ preventScroll: true });
    });
  }

  function errorFor(field: CheckoutField) {
    return fieldError?.field === field ? fieldError.message : null;
  }

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
            verifyRemote: true,
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
        verifyRemote: true,
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
          verifyRemote: true,
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
        verifyRemote:
          returnedXenditResult === 'success' && attempt % 3 === 0,
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

  const menuEmptyState = emptyState({
    total: products.length,
    filtered: Boolean(searchQuery.trim()) || activeCategory !== 'All',
    noun: 'dish',
    plural: 'dishes',
    query: searchQuery.trim() || undefined,
    emptyDetail: 'The kitchen has not published a menu for this location yet.',
  });

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
    setFieldError(null);

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
      fail('name', 'Enter the name this order is for.');
      return;
    }

    const phoneDigits = guestPhone.replace(/\D/g, '');

    if (phoneDigits.length < 7 || phoneDigits.length > 15) {
      fail('phone', 'Enter a phone number staff can reach you on, 7 to 15 digits.');
      return;
    }

    if (requiresRoomVerification && !roomNumber.trim()) {
      fail('room', 'Enter the room number this order is going to.');
      return;
    }

    if (requiresRoomVerification && !/^\d{6}$/.test(roomPasscode.trim())) {
      fail('passcode', 'Enter the six-digit passcode for that room.');
      return;
    }

    if (!confirmedClause) {
      fail('confirm', 'Confirm the order type before placing your order.');
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

  /*
   * Emptying the cart cannot be undone — the draft goes with it — so it asks
   * first, and the question names what is about to be lost.
   */
  function askBeforeClearingCart() {
    const what = `${itemCount} item${itemCount === 1 ? '' : 's'} · ${money(total, currency)}`;

    if (!window.confirm(`Remove everything from this order?\n\n${what}\n\nYou will need to choose the dishes again.`)) {
      return;
    }

    clearCart();
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
            className="grid size-11 shrink-0 place-items-center border border-white/10 bg-white/[0.04] text-white/75 transition hover:bg-white/10 hover:text-white"
            aria-label="Back to menu"
          >
            <ArrowLeft className="size-5" />
          </button>

          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-2xl font-normal tracking-wide text-white">
              Review your order
            </h2>
            <p className="mt-1 text-xs font-medium text-white/45">
              {itemCount} item{itemCount === 1 ? '' : 's'} · {money(total, currency)}
            </p>
          </div>

          {/*
            IX-7. Emptying the cart used to be a 44px icon button in the
            top-right corner, the mirror image of the back arrow in the
            top-left, and it fired on the first tap. It is a word now, it sits
            under the list it empties rather than beside the way out, and it
            asks.
          */}
        </div>

        {cart.length === 0 ? (
          <section className="grid min-h-[62vh] place-items-center border border-white/10 bg-white/[0.035] p-8 text-center">
            <div>
              <div className="mx-auto grid size-20 place-items-center border border-gold/20 bg-gold/10 text-gold">
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
                className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 bg-gold px-6 text-sm font-semibold text-black transition hover:brightness-110"
              >
                Browse Menu
                <ChevronRight className="size-4" />
              </button>
            </div>
          </section>
        ) : (
          <>
            <section className="overflow-hidden border border-white/10 bg-white/[0.04]">
              {/*
                An eyebrow, a sentence telling the guest what the controls
                below it do, and a count the header three inches above already
                gives. One heading.
              */}
              <div className="border-b border-white/10 px-5 py-4">
                <h3 className="font-serif text-xl font-normal tracking-wide text-white">
                  Selected dishes
                </h3>
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
                        className="size-[76px] border border-white/10"
                      />

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="line-clamp-2 font-serif text-[17px] font-medium leading-tight tracking-wide text-white">
                            {product.name}
                          </h3>
                          {isBundleProduct(product) ? (
                            <span className="bg-gold/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-gold">
                              Bundle
                            </span>
                          ) : null}
                        </div>

                        <p className="mt-1 text-sm font-semibold text-gold">
                          {simpleMoney(product.priceCents, currency)}
                        </p>

                        <div className="mt-3 inline-flex items-center border border-white/10 bg-black/30 p-1">
                          <TapButton
                            onTap={() =>
                              updateQty(item.productId, item.quantity - 1)
                            }
                            className="grid size-11 place-items-center text-white/65 transition hover:bg-white/10 hover:text-white"
                            aria-label={`Decrease ${product.name}`}
                          >
                            <Minus className="size-4" />
                          </TapButton>

                          <span className="min-w-10 text-center text-base font-semibold tabular-nums text-white">
                            {item.quantity}
                          </span>

                          <TapButton
                            onTap={() =>
                              updateQty(item.productId, item.quantity + 1)
                            }
                            disabled={!canIncrease}
                            className="grid size-11 place-items-center text-white/65 transition hover:bg-white/10 hover:text-white"
                            aria-label={`Increase ${product.name}`}
                          >
                            <Plus className="size-4" />
                          </TapButton>
                        </div>
                      </div>

                      <div className="flex flex-col items-end justify-between gap-3">
                        <TapButton
                          onTap={() => updateQty(item.productId, 0)}
                          className="grid size-11 place-items-center text-white/40 transition hover:bg-red-500/10 hover:text-red-200"
                          aria-label={`Remove ${product.name}`}
                        >
                          <X className="size-4" />
                        </TapButton>
                        <p className="text-sm font-semibold text-white">
                          {money(product.priceCents * item.quantity, currency)}
                        </p>
                      </div>
                    </article>
                  );
                })}
              </div>

              {cart.length > 0 ? (
                <button
                  type="button"
                  onClick={askBeforeClearingCart}
                  className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-white/45 underline-offset-4 transition hover:text-red-200 hover:underline"
                >
                  Remove all items
                </button>
              ) : null}
            </section>

            <section className="mt-5 border border-white/10 bg-white/[0.04] p-5">
              <h3 className="mb-5 font-serif text-xl font-normal tracking-wide text-white">
                Delivery preferences
              </h3>

              <div className="space-y-4">
                <div>
                  <label htmlFor="menu-ordered-by" className="mb-2 flex items-baseline justify-between gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
                    <span>Ordered by</span>
                    <span className="text-white/35">Required</span>
                  </label>
                  <input
            id="menu-ordered-by"
                    type="text"
                    autoComplete="name"
                    required
                    aria-invalid={errorFor('name') ? true : undefined}
                    aria-describedby="menu-ordered-by-note"
                    placeholder="Guest name"
                    value={guestName}
                    onChange={(event) =>
                      setGuestName(event.currentTarget.value)
                    }
                    className={cn(checkoutFieldClass, 'h-14', errorFor('name') && '!border-red-400/70')}
                    style={checkoutFieldStyle}
                  />
                  {/*
                    IX-5. This said "Auto-filled from the active stay" under a
                    box that was empty, because this NFC panel is a public
                    location with no stay attached to it. It only says so when
                    it is true.
                  */}
                  <p id="menu-ordered-by-note" className={cn('mt-2 text-xs font-medium leading-5', errorFor('name') ? 'text-red-200' : 'text-white/40')}>
                    {errorFor('name') ??
                      (defaultGuestName
                        ? 'Taken from your stay. Change it if someone else is ordering.'
                        : 'So staff know who to hand the order to.')}
                  </p>
                </div>

                <div>
                  <label htmlFor="menu-phone-number" className="mb-2 flex items-baseline justify-between gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
                    <span>Phone number</span>
                    <span className="text-white/35">Required</span>
                  </label>
                  <div className="relative">
                    <Phone className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-gold" />
                    <input
            id="menu-phone-number"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      required
                      aria-invalid={errorFor('phone') ? true : undefined}
                      aria-describedby="menu-phone-number-note"
                      placeholder="09XX XXX XXXX"
                      value={guestPhone}
                      onChange={(event) => setGuestPhone(event.currentTarget.value)}
                      className={cn(checkoutFieldClass, 'h-14 pl-11', errorFor('phone') && '!border-red-400/70')}
                      style={checkoutFieldStyle}
                    />
                  </div>
                  <p id="menu-phone-number-note" className={cn('mt-2 text-xs font-medium leading-5', errorFor('phone') ? 'text-red-200' : 'text-white/40')}>
                    {errorFor('phone') ??
                      (defaultGuestPhone
                        ? 'Taken from your stay. Staff call this number about the order.'
                        : 'So hotel staff can reach you about this order.')}
                  </p>
                </div>

                <div>
                  <label htmlFor="menu-order-type" className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
                    Order type
                  </label>
                  <select
            id="menu-order-type"
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
                  <label htmlFor="menu-order-time" className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
                    Order time
                  </label>
                  <select
            id="menu-order-time"
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
                  <div className="border border-gold/20 bg-gold/[0.07] p-4">
                    <div className="flex items-center gap-2 text-gold">
                      <Clock3 className="size-4" />
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em]">
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
                  <label htmlFor="menu-payment-method" className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
                    Payment method
                  </label>
                  <select
            id="menu-payment-method"
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
                    <div className="mt-3 flex items-start gap-3 border border-gold/20 bg-gold/[0.08] p-4">
                      <span className="grid size-10 shrink-0 place-items-center bg-gold text-black">
                        <CreditCard className="size-5" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-white">
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
                    'border p-4',
                    requiresRoomVerification
                      ? 'border-gold/35 bg-gold/[0.08]'
                      : 'border-white/10 bg-white/[0.03]'
                  )}>
                    <div className="flex items-start gap-3">
                      <span className="grid size-10 shrink-0 place-items-center bg-gold text-black">
                        <BedDouble className="size-5" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-white">Secure room assignment</p>
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
                          id="menu-room-number"
                          type="text"
                          inputMode="text"
                          autoComplete="off"
                          required
                          aria-label="Room number"
                          aria-invalid={errorFor('room') ? true : undefined}
                          placeholder="Room number"
                          value={roomNumber}
                          onChange={(event) => setRoomNumber(event.currentTarget.value)}
                          className={cn(checkoutFieldClass, 'h-14', errorFor('room') && '!border-red-400/70')}
                          style={checkoutFieldStyle}
                        />
                        <div className="relative">
                          <KeyRound className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-gold" />
                          <input
                            id="menu-room-passcode"
                            type="password"
                            inputMode="numeric"
                            pattern="[0-9]{6}"
                            maxLength={6}
                            autoComplete="one-time-code"
                            required
                            aria-label="Six-digit room passcode"
                            aria-invalid={errorFor('passcode') ? true : undefined}
                            placeholder="6-digit passcode"
                            value={roomPasscode}
                            onChange={(event) =>
                              setRoomPasscode(event.currentTarget.value.replace(/\D/g, '').slice(0, 6))
                            }
                            className={cn(checkoutFieldClass, 'h-14 pl-11 font-mono tracking-[0.18em]', errorFor('passcode') && '!border-red-400/70')}
                            style={checkoutFieldStyle}
                          />
                        </div>

                        {errorFor('room') || errorFor('passcode') ? (
                          <p className="text-xs font-medium leading-5 text-red-200 sm:col-span-2">
                            {errorFor('room') ?? errorFor('passcode')}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <textarea
                  rows={4}
                  aria-label="Special instructions, allergies, or requests"
                  placeholder="Special instructions, allergies, or requests"
                  value={notes}
                  onChange={(event) => setNotes(event.currentTarget.value)}
                  className={cn(
                    checkoutFieldClass,
                    'min-h-28 resize-y p-4 leading-6'
                  )}
                  style={checkoutFieldStyle}
                />

                <div>
                  <label
                    htmlFor="menu-confirm-order-type"
                    className={cn(
                      'flex min-h-11 cursor-pointer items-start gap-3 border p-4 text-sm font-semibold leading-6 transition',
                      errorFor('confirm')
                        ? 'border-red-400/70 bg-red-500/10 text-red-100'
                        : 'border-gold/15 bg-gold/[0.07] text-gold/90 hover:bg-gold/10'
                    )}
                  >
                    <input
                      id="menu-confirm-order-type"
                      type="checkbox"
                      required
                      checked={confirmedClause}
                      aria-invalid={errorFor('confirm') ? true : undefined}
                      onChange={(event) =>
                        setConfirmedClause(event.target.checked)
                      }
                      className="mt-0.5 size-6 shrink-0 border border-gold/50 bg-black accent-[#d6a738]"
                    />
                    <span>
                      I confirm this order is for{' '}
                      <b className="text-white">{orderTypeLabels[orderType]}</b>.
                    </span>
                  </label>

                  {errorFor('confirm') ? (
                    <p className="mt-2 text-xs font-medium leading-5 text-red-200">
                      {errorFor('confirm')}
                    </p>
                  ) : null}
                </div>
              </div>
            </section>

            {/*
              IX-4. A filled gold rewards panel stood here, and a second one
              above the menu, so the checkout had two calls to action
              competing with the one that places the order. The single line
              the page carries above this client covers both screens; the gold
              belongs to Place Order.
            */}
            <section className="mt-5 border border-gold/20 bg-[linear-gradient(145deg,rgba(214,167,56,0.14),rgba(255,255,255,0.035))] p-5">
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
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gold">
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

              {/*
                The banner stays — it is what a screen reader announces, and it
                carries the failures that belong to no single field — but every
                failure that does belong to one is now also written at that
                field, which takes focus. IX-6.
              */}
              {error ? (
                <p role="alert" className="mt-4 border border-red-400/20 bg-red-500/10 p-3 text-sm font-semibold text-red-200">
                  {error}
                </p>
              ) : null}

              <button
                type="button"
                onClick={submit}
                /*
                 * Only pending disables this now. Gating it on
                 * confirmedClause as well made the button silently dead:
                 * the guest fills in the whole form, taps, and nothing
                 * happens - while the explanation written for exactly this
                 * case ("Please confirm the order type before placing your
                 * order") could never fire, because submit never ran. Let
                 * the handler reject the order and say why.
                 */
                disabled={pending}
                className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 bg-gold px-5 text-[15px] font-semibold text-black shadow-[0_14px_34px_rgba(214,167,56,0.24)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {pending ? (
                  paymentMethod === 'XENDIT'
                    ? 'Opening Xendit...'
                    : 'Submitting...'
                ) : (
                  <>
                    {/* The control that commits the money says how much. */}
                    {paymentMethod === 'XENDIT'
                      ? `Pay ${money(total, currency)} securely`
                      : `Place order · ${money(total, currency)}`}
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
      {/*
        CP-1. The shell above already carries a back arrow and says "Order Food"
        and where you are, so the second back arrow and the second title —
        "In-room dining / Curated for your stay" — were the third and fourth
        statements of location before any food. The hero card that followed
        them was the largest type on the screen at 32px, telling the guest they
        could browse dishes on a screen whose only purpose is browsing dishes.
        Both gone; the cart moved into the bar that is already sticky, so it is
        reachable the whole way down the menu instead of scrolling away.
      */}
      {/* A bordered, filled container wrapped a bordered, filled search field
          and a row of chips: a box holding a box. The bar still needs an opaque
          backing so the menu does not scroll through it, but it does not need
          to be drawn as an object. */}
      <div className="sticky top-[4.5rem] z-40 -mx-5 mb-7 bg-[#050505]/95 px-5 pb-3 pt-2 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <div className="flex h-12 min-w-0 flex-1 items-center gap-3 border-b border-white/15 transition focus-within:border-gold/50">
            <Search className="size-4.5 shrink-0 text-white/35" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              aria-label="Search dishes, bundles, or categories"
              placeholder="Search dishes, bundles, or categories"
              className="h-full w-full bg-transparent text-sm font-semibold text-white outline-none placeholder:text-white/35"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="grid size-11 shrink-0 place-items-center text-white/40 transition hover:bg-white/10 hover:text-white"
                aria-label="Clear search"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>

          <button
            type="button"
            onClick={openCart}
            className="relative grid size-12 shrink-0 place-items-center text-white/70 transition hover:text-white"
            aria-label="Open cart"
          >
            <ShoppingBag className="size-5" />
            {itemCount > 0 ? (
              <span className="absolute -right-1 -top-1 grid size-5 place-items-center bg-gold text-[10px] font-semibold text-black ring-2 ring-black">
                {itemCount}
              </span>
            ) : null}
          </button>
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
                /*
                  Filter chips were filled boxes, the active one a mustard
                  slab. A menu's own sections are not buttons on a dashboard:
                  they read as words, and the one you are on is simply
                  underlined.
                */
                className={cn(
                  'flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-1 pb-2 text-[13px] font-medium transition',
                  active
                    ? 'border-gold text-white'
                    : 'border-transparent text-white/45 hover:text-white/80'
                )}
              >
                {category}
                <span
                  className={cn(
                    'text-[10px] tabular-nums',
                    active ? 'text-white/45' : 'text-white/25'
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
            className="mt-2 flex min-h-12 w-full items-center justify-between gap-3 bg-gold px-4 text-black shadow-[0_10px_28px_rgba(214,167,56,0.2)] transition hover:brightness-105"
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <ShoppingBag className="size-4" />
              Review order
            </span>
            <span className="flex items-center gap-2 text-sm font-semibold">
              {itemCount} item{itemCount === 1 ? '' : 's'} · {money(total, currency)}
              <ChevronRight className="size-4" />
            </span>
          </button>
        ) : null}
      </div>

      {featured ? (
        <section className="mb-7">
          {/*
            "Chef's selection" above "Recommended for you" said the same thing
            twice, and the sparkle said it a third time. One line.
          */}
          <h3 className="mb-3 font-serif text-2xl font-normal tracking-wide text-white">
            Chef&rsquo;s selection
          </h3>

          <article className="relative isolate overflow-hidden border border-white/10 bg-white/[0.045]">
            {/*
              A11Y-2, the blocker. The dish name was white, 24px, set straight
              on the photograph with a gradient that is transparent by the
              midpoint. Measured against the real image at the size it renders:
              1.01:1 over the lightest pixel beneath the text and 3.43:1 over
              the mean — unreadable on a pale dish and below the floor even on
              average. The name and the price now sit on the card's own
              surface, where the ratio is a property of the design rather than
              of whichever photograph the hotel uploaded. The category keeps its
              place on the image: it has its own opaque plate behind it.
            */}
            <div className="relative">
              <ProductImage
                product={featured}
                className="h-40 w-full sm:h-48"
              />
              <span className="absolute right-3 top-3 border border-white/15 bg-black/70 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-white backdrop-blur">
                {featured.categoryName}
              </span>
            </div>

            <div className="p-4">
              <div className="flex items-start justify-between gap-3">
                <h4 className="min-w-0 font-serif text-2xl font-normal leading-tight tracking-wide text-white">
                  {featured.name}
                </h4>
                <p className="shrink-0 font-serif text-2xl font-normal tabular-nums text-gold">
                  {simpleMoney(featured.priceCents, currency)}
                </p>
              </div>

              {featured.description ? (
                <p className="mt-2 line-clamp-2 text-sm font-medium leading-6 text-white/55">
                  {featured.description}
                </p>
              ) : null}

              <div className="mt-4 flex items-center justify-between gap-3">
                {/*
                  Three filled pills used to sit under every dish: "Bundle" or
                  "Single item", and a green "10 AVAILABLE". A guest reading a
                  menu in a good hotel is not doing stock control, and being
                  told a dish is a single item tells them nothing at all. What
                  survives is the one fact that changes a decision: that
                  something is nearly gone, or gone.
                */}
                <div className="flex flex-wrap items-center gap-3 text-[11px] font-medium uppercase tracking-[0.18em]">
                  {isBundleProduct(featured) ? (
                    <span className="text-gold/80">Set menu</span>
                  ) : null}

                  {isProductSoldOut(featured) ? (
                    <span className="text-white/40">Unavailable today</span>
                  ) : getProductAvailableQty(featured) <= 5 ? (
                    <span className="text-white/55">
                      Only {getProductAvailableQty(featured)} left
                    </span>
                  ) : null}
                </div>

                {getCartQuantity(featured.id) > 0 ? (
                  <div className="flex shrink-0 items-center border border-gold/25 bg-gold/10 p-1">
                    <TapButton
                      onTap={() =>
                        updateQty(featured.id, getCartQuantity(featured.id) - 1)
                      }
                      className="grid size-11 place-items-center text-gold hover:bg-gold/10"
                      aria-label={`Decrease ${featured.name}`}
                    >
                      <Minus className="size-4" />
                    </TapButton>
                    <span className="min-w-8 text-center text-sm font-semibold text-white">
                      {getCartQuantity(featured.id)}
                    </span>
                    <TapButton
                      onTap={() => add(featured.id)}
                      disabled={
                        isProductSoldOut(featured) ||
                        getCartQuantity(featured.id) >=
                          getProductAvailableQty(featured)
                      }
                      className="grid size-11 place-items-center bg-gold text-black"
                      aria-label={`Increase ${featured.name}`}
                    >
                      <Plus className="size-4" />
                    </TapButton>
                  </div>
                ) : (
                  <TapButton
                    onTap={() => add(featured.id)}
                    disabled={isProductSoldOut(featured)}
                    className="inline-flex min-h-11 shrink-0 items-center gap-2 border border-gold/60 px-5 text-xs font-medium uppercase tracking-[0.16em] text-gold transition hover:bg-gold/10"
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
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h3 className="font-serif text-2xl font-normal tracking-wide text-white">
            {activeCategory === 'All' ? 'All dishes' : activeCategory}
          </h3>
          <p className="text-xs font-bold text-white/35">
            {/*
             * The category chips count every dish, but this grid excludes
             * the one promoted into Chef's selection above it - so "All 5"
             * sat above a list of 4 and read as though a dish had gone
             * missing. Say "more" when one has been lifted out.
             */}
            {remainingProducts.length}
            {featured ? ' more' : ''} item
            {remainingProducts.length === 1 ? '' : 's'}
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
                  'group relative isolate overflow-hidden border bg-white/[0.04] shadow-[0_14px_36px_rgba(0,0,0,0.16)] transition',
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

                  {/*
                    A11Y-2 again, in miniature: a 55% plate under 70% white is
                    still partly the photograph. Opaque enough to be a surface.
                  */}
                  <span className="absolute left-2.5 top-2.5 max-w-[calc(100%-1.25rem)] truncate border border-white/10 bg-black/75 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-white backdrop-blur">
                    {product.categoryName}
                  </span>

                  {/*
                    A saturated red bar was laid across the photograph of the
                    food. Red is the loudest colour available and it was
                    spending it on "we have run out of pancakes". The card
                    dims instead, and says so in words.
                  */}
                  {soldOut ? (
                    <span className="absolute inset-x-0 bottom-0 bg-black/70 px-3 py-2 text-center text-[10px] font-medium uppercase tracking-[0.2em] text-white/70 backdrop-blur-sm">
                      Unavailable today
                    </span>
                  ) : null}
                </div>

                <div className="flex min-h-[168px] flex-col p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="line-clamp-2 min-h-[2.5rem] font-serif text-[16px] font-medium leading-tight tracking-wide text-white">
                      {product.name}
                    </h4>
                    {isBundleProduct(product) ? (
                      <span className="mt-0.5 shrink-0 bg-gold/15 px-2 py-1 text-[8px] font-semibold uppercase tracking-widest text-gold">
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
                        <p className="text-[15px] font-semibold text-gold">
                          {simpleMoney(product.priceCents, currency)}
                        </p>
                        {!soldOut && getProductAvailableQty(product) <= 5 ? (
                          <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-white/50">
                            Only {getProductAvailableQty(product)} left
                          </p>
                        ) : null}
                      </div>

                      {quantity > 0 ? (
                        <div className="flex shrink-0 items-center border border-gold/25 bg-gold/10 p-0.5">
                          <TapButton
                            onTap={() => updateQty(product.id, quantity - 1)}
                            className="grid size-11 place-items-center text-gold"
                            aria-label={`Decrease ${product.name}`}
                          >
                            <Minus className="size-4" />
                          </TapButton>
                          <span className="min-w-8 text-center text-sm font-semibold tabular-nums text-white">
                            {quantity}
                          </span>
                          <TapButton
                            onTap={() => add(product.id)}
                            disabled={
                              soldOut || quantity >= getProductAvailableQty(product)
                            }
                            className="grid size-11 place-items-center bg-gold text-black"
                            aria-label={`Increase ${product.name}`}
                          >
                            <Plus className="size-4" />
                          </TapButton>
                        </div>
                      ) : (
                        <TapButton
                          onTap={() => add(product.id)}
                          disabled={soldOut}
                          className="grid size-11 shrink-0 place-items-center border border-white/25 text-white transition hover:border-gold/70 hover:text-gold"
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

        {/*
          ST-7 and CP-9. "No dishes found — try another category or clear your
          search" ran whether or not anything had been searched, so a hotel
          with an empty menu told the guest to undo a filter they had not set.
        */}
        {!filteredProducts.length ? (
          <div className="border border-white/10 bg-white/[0.04] p-9 text-center">
            <div className="mx-auto grid size-16 place-items-center bg-white/5 text-white/35">
              <Utensils className="size-7" strokeWidth={1.5} />
            </div>
            <h3 className="mt-5 font-serif text-2xl font-normal tracking-wide text-white">
              {menuEmptyState.title}
            </h3>
            <p className="mx-auto mt-2 max-w-xs text-sm font-medium leading-6 text-white/45">
              {menuEmptyState.detail}
            </p>
            {(searchQuery || activeCategory !== 'All') ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setActiveCategory('All');
                }}
                className="mt-5 border border-white/10 bg-white/[0.06] px-5 py-3 text-sm font-semibold text-white"
              >
                Reset filters
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      {error ? (
        <div className="fixed inset-x-5 bottom-44 z-40 mx-auto flex max-w-md items-start gap-3 border border-red-400/20 bg-red-600/95 px-4 py-3 text-sm font-bold text-white shadow-2xl backdrop-blur">
          <X className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0 flex-1">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="grid size-7 shrink-0 place-items-center bg-black/15"
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
          className="fixed inset-x-5 bottom-24 z-30 mx-auto flex max-w-md items-center justify-between gap-4 border border-gold/25 bg-[linear-gradient(135deg,#d9ad45,#c79022)] px-4 py-3.5 text-black transition hover:brightness-105"
        >
          <span className="flex items-center gap-3">
            <span className="grid size-11 place-items-center bg-black/12">
              <ShoppingBag className="size-4.5" />
            </span>
            <span className="text-left">
              <span className="block text-[10px] font-semibold uppercase tracking-widest text-black/55">
                {itemCount} item{itemCount === 1 ? '' : 's'} selected
              </span>
              <span className="mt-0.5 block text-sm font-semibold">Review order</span>
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