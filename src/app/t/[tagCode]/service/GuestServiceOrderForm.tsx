'use client';

import {
  type ChangeEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Baby,
  BedDouble,
  BellRing,
  CalendarClock,
  Camera,
  Car,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  QrCode,
  RefreshCw,
  ConciergeBell,
  Droplets,
  FileImage,
  Hammer,
  ImagePlus,
  Minus,
  PackagePlus,
  Plus,
  Search,
  ShieldCheck,
  Shirt,
  ShoppingBag,
  Sparkles,
  SprayCan,
  Trash2,
  Waves,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { createServiceRequestAction } from '../actions';
import {
  cancelGuestServiceXenditCheckout,
  createGuestServiceXenditCheckout,
  finalizeGuestServiceXenditCheckout,
  getGuestServiceXenditStatus,
} from '../service-xendit-actions';

type GuestServiceBillingMode =
  | 'FREE'
  | 'FIXED_PRICE'
  | 'PRICE_ON_CONFIRMATION';

type GuestServiceItem = {
  id: string;
  code: string;
  name: string;
  category: string;
  description: string;
  iconKey: string;
  billingMode: GuestServiceBillingMode;
  unitPrice: number;
  unitLabel: string;
  sortOrder: number;
  inventoryTracked: boolean;
  availableQty: number | null;
  isSoldOut: boolean;
};

type ServiceCartItem = {
  serviceCode: string;
  quantity: number;
};

type AttachmentPreview = {
  id: string;
  file: File;
  url: string;
};

type FulfillmentTimingValue = 'ASAP' | 'SCHEDULED';
type ServicePaymentMethod = 'ROOM_CHARGE' | 'XENDIT';

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024;

const ALLOWED_ATTACHMENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const iconMap: Record<string, LucideIcon> = {
  Baby,
  BedDouble,
  Car,
  Clock,
  ConciergeBell,
  Droplets,
  Hammer,
  PackagePlus,
  Shirt,
  Sparkles,
  SprayCan,
  Waves,
};

const moneyFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
});

const darkFieldClass =
  'w-full rounded-2xl border border-white/12 bg-[#0b0b0b] px-4 text-[15px] font-medium text-white caret-gold outline-none placeholder:text-white/30 transition focus:border-gold/60 focus:ring-4 focus:ring-gold/10';

function money(value: number) {
  return moneyFormatter.format(value);
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function validateAttachmentFile(file: File) {
  if (!ALLOWED_ATTACHMENT_TYPES.has(file.type)) {
    return 'Please upload JPG, PNG, or WEBP images only.';
  }

  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    return 'Each image must be 5MB or smaller.';
  }

  return null;
}

function createAttachmentId(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

function getBillingBadge(service: GuestServiceItem) {
  if (service.billingMode === 'FREE') {
    return {
      label: 'Complimentary',
      className:
        'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
    };
  }

  if (service.billingMode === 'PRICE_ON_CONFIRMATION') {
    return {
      label: 'Confirm price',
      className: 'border-gold/25 bg-gold/10 text-gold',
    };
  }

  return {
    label: money(service.unitPrice),
    className: 'border-white/15 bg-white/[0.07] text-white/80',
  };
}

function getErrorMessage(error?: string) {
  if (!error) {
    return null;
  }

  const messages: Record<string, string> = {
    invalid_tag: 'Invalid guest access. Please scan the NFC tag again.',
    inactive_tag: 'This NFC tag is inactive. Please contact the front desk.',
    invalid_service: 'Please select at least one valid service.',
    room_required:
      'A paid add-on cannot be charged because no room is linked to this NFC tag.',
    consent_required:
      'Please confirm the room add-on charge before submitting this request.',
    quantity_required: 'Please choose a valid quantity for every selected item.',
    request_failed: 'Unable to submit the request. Please try again.',
    invalid_attachment:
      'Please upload JPG, PNG, or WEBP images only. Maximum 5 images, 5MB each.',
    invalid_schedule:
      'Please select a valid future date and time for the scheduled request.',
    service_stock_unavailable:
      'One or more selected services are no longer available in that quantity.',
    xendit_checkout_required:
      'Please use the secure Xendit checkout button for this payment.',
    xendit_cancelled:
      'Xendit checkout was cancelled. Your selected services were restored; attached photos must be selected again.',
  };

  return messages[error] ?? 'Unable to submit the request. Please try again.';
}

function getSuccessMessage(success?: string, count?: string) {
  if (!success) {
    return null;
  }

  const requestCount = Number(count || 1);

  if (success === 'charged') {
    return `${requestCount} paid room add-on request${
      requestCount === 1 ? '' : 's'
    } sent successfully.`;
  }

  if (success === 'confirmation') {
    return `${requestCount} request${
      requestCount === 1 ? '' : 's'
    } sent for staff price confirmation.`;
  }

  if (success === 'mixed') {
    return `${requestCount} request${
      requestCount === 1 ? '' : 's'
    } sent. Some items may require staff confirmation.`;
  }

  return `${requestCount} service request${
    requestCount === 1 ? '' : 's'
  } sent successfully.`;
}

function getServiceIcon(service: GuestServiceItem) {
  return iconMap[service.iconKey] ?? ConciergeBell;
}

function getServicePriceText(service: GuestServiceItem) {
  if (service.billingMode === 'FREE') {
    return 'Complimentary';
  }

  if (service.billingMode === 'PRICE_ON_CONFIRMATION') {
    return 'Price confirmed by staff';
  }

  return `${money(service.unitPrice)}${
    service.unitLabel ? ` / ${service.unitLabel}` : ''
  }`;
}

function getCartItemTotal(service: GuestServiceItem, quantity: number) {
  if (service.billingMode !== 'FIXED_PRICE') {
    return 0;
  }

  return service.unitPrice * quantity;
}

function getServiceQuantityLimit(service: GuestServiceItem) {
  if (!service.inventoryTracked) return 20;
  return Math.max(Math.min(service.availableQty ?? 0, 20), 0);
}

function isServiceUnavailable(service: GuestServiceItem) {
  return service.isSoldOut || getServiceQuantityLimit(service) <= 0;
}

function SubmitButton({
  disabled,
  clientPending,
  paymentMethod,
  requiresPayment,
}: {
  disabled: boolean;
  clientPending: boolean;
  paymentMethod: ServicePaymentMethod;
  requiresPayment: boolean;
}) {
  const { pending: formPending } = useFormStatus();
  const pending = formPending || clientPending;
  const usesXendit = requiresPayment && paymentMethod === 'XENDIT';

  return (
    <Button
      type="submit"
      disabled={disabled || pending}
      size="lg"
      className="mt-5 h-14 w-full rounded-2xl bg-gold text-[15px] font-black tracking-wide text-black shadow-[0_16px_36px_rgba(214,167,56,0.24)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
    >
      {pending
        ? usesXendit
          ? 'Opening secure checkout...'
          : 'Sending requests...'
        : usesXendit
          ? 'Continue to Secure Payment'
          : 'Send Requests'}
    </Button>
  );
}

function QuantityControl({
  name,
  quantity,
  onDecrease,
  onIncrease,
}: {
  name: string;
  quantity: number;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <div className="inline-flex items-center rounded-full border border-gold/25 bg-gold/10 p-1">
      <button
        type="button"
        onClick={onDecrease}
        className="grid size-8 place-items-center rounded-full text-gold transition hover:bg-gold/10 active:scale-95"
        aria-label={`Decrease ${name}`}
      >
        <Minus className="size-3.5" />
      </button>

      <span className="min-w-7 text-center text-sm font-black text-white">
        {quantity}
      </span>

      <button
        type="button"
        onClick={onIncrease}
        className="grid size-8 place-items-center rounded-full bg-gold text-black transition hover:brightness-110 active:scale-95"
        aria-label={`Increase ${name}`}
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}

export function GuestServiceOrderForm({
  tagCode,
  roomLabel,
  services,
  defaultGuestName = '',
  error,
  success,
  count,
}: {
  tagCode: string;
  roomLabel: string;
  services: GuestServiceItem[];
  defaultGuestName?: string;
  error?: string;
  success?: string;
  count?: string;
}) {
  const router = useRouter();
  const [paymentPending, startPaymentTransition] = useTransition();
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);
  const [screen, setScreen] = useState<'services' | 'cart'>('services');
  const [cart, setCart] = useState<ServiceCartItem[]>([]);
  const [guestName, setGuestName] = useState(defaultGuestName);
  const [notes, setNotes] = useState('');
  const [chargeConsent, setChargeConsent] = useState(false);
  const [paymentMethod, setPaymentMethod] =
    useState<ServicePaymentMethod>('ROOM_CHARGE');
  const [fulfillmentTiming, setFulfillmentTiming] =
    useState<FulfillmentTimingValue>('ASAP');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [scheduledNote, setScheduledNote] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const objectUrlsRef = useRef<string[]>([]);
  const [attachments, setAttachments] = useState<AttachmentPreview[]>([]);

  function restoreCheckoutDraft() {
    const storageKey = `cv-service-checkout-${tagCode}`;
    const stored = sessionStorage.getItem(storageKey);

    if (!stored) {
      return false;
    }

    try {
      const draft = JSON.parse(stored) as {
        cart?: unknown;
        guestName?: unknown;
        notes?: unknown;
        fulfillmentTiming?: unknown;
        scheduledDate?: unknown;
        scheduledTime?: unknown;
        scheduledNote?: unknown;
        paymentMethod?: unknown;
      };

      const restoredQuantities = new Map<string, number>();

      if (Array.isArray(draft.cart)) {
        for (const rawItem of draft.cart) {
          if (!rawItem || typeof rawItem !== 'object') continue;

          const item = rawItem as Partial<ServiceCartItem>;
          const serviceCode =
            typeof item.serviceCode === 'string' ? item.serviceCode : '';
          const service = services.find(
            (candidate) => candidate.code === serviceCode
          );
          const quantity = Number(item.quantity);

          if (
            !service ||
            isServiceUnavailable(service) ||
            !Number.isInteger(quantity) ||
            quantity <= 0
          ) {
            continue;
          }

          const limit = getServiceQuantityLimit(service);
          const nextQuantity = Math.min(
            (restoredQuantities.get(serviceCode) ?? 0) + quantity,
            limit
          );

          if (nextQuantity > 0) {
            restoredQuantities.set(serviceCode, nextQuantity);
          }
        }
      }

      const restoredCart = Array.from(restoredQuantities.entries()).map(
        ([serviceCode, quantity]) => ({ serviceCode, quantity })
      );

      if (!restoredCart.length) {
        sessionStorage.removeItem(storageKey);
        return false;
      }

      const restoredHasPayableItem = restoredCart.some((item) => {
        const service = services.find(
          (candidate) => candidate.code === item.serviceCode
        );

        return (
          service?.billingMode === 'FIXED_PRICE' && service.unitPrice > 0
        );
      });

      setCart(restoredCart);
      setScreen('cart');

      if (typeof draft.guestName === 'string') setGuestName(draft.guestName);
      if (typeof draft.notes === 'string') setNotes(draft.notes);
      if (
        draft.fulfillmentTiming === 'ASAP' ||
        draft.fulfillmentTiming === 'SCHEDULED'
      ) {
        setFulfillmentTiming(draft.fulfillmentTiming);
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

      setPaymentMethod(
        restoredHasPayableItem && draft.paymentMethod === 'XENDIT'
          ? 'XENDIT'
          : 'ROOM_CHARGE'
      );
      setChargeConsent(false);

      return true;
    } catch {
      sessionStorage.removeItem(storageKey);
      return false;
    }
  }

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current = [];
    };
  }, []);

  useEffect(() => {
    setGuestName(defaultGuestName);
  }, [defaultGuestName]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const paymentSessionId = url.searchParams.get('xendit');
    const xenditResult = url.searchParams.get('xenditResult');

    if (!paymentSessionId || !xenditResult) {
      return;
    }

    let stopped = false;
    let timer: number | null = null;

    const clearPaymentQuery = () => {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('xendit');
      cleanUrl.searchParams.delete('xenditResult');
      window.history.replaceState(
        null,
        '',
        `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`
      );
    };

    const openThankYouPage = (requestCode: string) => {
      sessionStorage.removeItem(`cv-service-checkout-${tagCode}`);
      sessionStorage.setItem(
        `cv-service-reset-${tagCode}`,
        requestCode
      );
      clearCart();

      const query = new URLSearchParams({ code: requestCode });
      router.replace(
        `/t/${encodeURIComponent(tagCode)}/service/thanks?${query.toString()}`
      );
      router.refresh();
    };

    const run = async () => {
      if (xenditResult === 'cancelled') {
        const cancelled = await cancelGuestServiceXenditCheckout({
          tagCode,
          paymentSessionId,
        });

        if (!stopped) {
          restoreCheckoutDraft();
          setLocalError(
            cancelled.ok
              ? 'Xendit checkout was cancelled. Your selected services were restored, but photos must be attached again. No service inventory was deducted.'
              : cancelled.error || 'Unable to cancel the payment checkout.'
          );
          setPaymentMessage(null);
          clearPaymentQuery();
          router.replace(`/t/${tagCode}/service?error=xendit_cancelled`);
          router.refresh();
        }
        return;
      }

      setPaymentMessage('Confirming your Xendit payment...');
      const status = await getGuestServiceXenditStatus({
        tagCode,
        paymentSessionId,
      });

      if (stopped) return;

      if (!status.ok) {
        setLocalError(status.error || 'Unable to confirm the payment.');
        clearPaymentQuery();
        return;
      }

      if (status.status === 'PAID' || status.status === 'PROCESSING') {
        const finalized = await finalizeGuestServiceXenditCheckout({
          tagCode,
          paymentSessionId,
        });

        if (stopped) return;

        if (finalized.ok) {
          openThankYouPage(finalized.requestCode);
          return;
        }

        if (!finalized.waiting) {
          setLocalError(
            finalized.error ||
              'The payment was received, but the request requires staff review.'
          );
          setPaymentMessage(null);
          clearPaymentQuery();
          return;
        }
      }

      if (status.status === 'COMPLETED') {
        if (status.requestCode) {
          openThankYouPage(status.requestCode);
          return;
        }

        setPaymentMessage(null);
        setLocalError(
          'Payment is complete, but the request reference could not be loaded. Please open My Requests.'
        );
        clearPaymentQuery();
        return;
      }

      if (
        status.status === 'FAILED' ||
        status.status === 'EXPIRED' ||
        status.status === 'CANCELLED' ||
        status.status === 'PAID_REVIEW_REQUIRED' ||
        status.status === 'REFUND_FAILED' ||
        status.status === 'REFUNDED'
      ) {
        if (
          status.status === 'FAILED' ||
          status.status === 'EXPIRED' ||
          status.status === 'CANCELLED'
        ) {
          restoreCheckoutDraft();
        }

        setLocalError(
          status.errorMessage ||
            (status.status === 'REFUNDED'
              ? 'The payment was refunded because the service request could not be completed.'
              : `Payment status: ${status.status.replaceAll('_', ' ')}`)
        );
        setPaymentMessage(null);
        clearPaymentQuery();
        return;
      }

      timer = window.setTimeout(run, 1600);
    };

    void run();

    return () => {
      stopped = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [router, tagCode]);

  useEffect(() => {
    const checkoutKey = `cv-service-checkout-${tagCode}`;
    const resetKey = `cv-service-reset-${tagCode}`;

    const resetCompletedRequest = () => {
      if (!sessionStorage.getItem(resetKey)) {
        return false;
      }

      sessionStorage.removeItem(resetKey);
      sessionStorage.removeItem(checkoutKey);

      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current = [];

      if (attachmentInputRef.current) {
        attachmentInputRef.current.value = '';
      }

      setScreen('services');
      setCart([]);
      setGuestName(defaultGuestName);
      setNotes('');
      setChargeConsent(false);
      setPaymentMethod('ROOM_CHARGE');
      setFulfillmentTiming('ASAP');
      setScheduledDate('');
      setScheduledTime('');
      setScheduledNote('');
      setActiveCategory('All');
      setSearchQuery('');
      setLocalError(null);
      setPaymentMessage(null);
      setAttachments([]);

      return true;
    };

    const resetOnMount = resetCompletedRequest();
    const url = new URL(window.location.href);

    if (!resetOnMount && !url.searchParams.has('xendit')) {
      restoreCheckoutDraft();
    }

    const handlePageShow = () => {
      resetCompletedRequest();
    };

    window.addEventListener('pageshow', handlePageShow);

    return () => {
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [defaultGuestName, tagCode]);

  const serviceMap = useMemo(
    () => new Map(services.map((service) => [service.code, service])),
    [services]
  );

  const categories = useMemo(
    () => [
      'All',
      ...Array.from(new Set(services.map((service) => service.category))),
    ],
    [services]
  );

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();

    for (const service of services) {
      counts.set(service.category, (counts.get(service.category) ?? 0) + 1);
    }

    return counts;
  }, [services]);

  const filteredServices = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return services.filter((service) => {
      const matchesCategory =
        activeCategory === 'All' || service.category === activeCategory;

      const matchesSearch =
        !query ||
        `${service.name} ${service.description} ${service.category}`
          .toLowerCase()
          .includes(query);

      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, searchQuery, services]);

  const selectedServices = useMemo(() => {
    return cart
      .map((item) => {
        const service = serviceMap.get(item.serviceCode);

        if (!service) {
          return null;
        }

        return {
          service,
          quantity: item.quantity,
        };
      })
      .filter(
        (
          item
        ): item is {
          service: GuestServiceItem;
          quantity: number;
        } => Boolean(item)
      );
  }, [cart, serviceMap]);

  const selectedCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const fixedPriceTotal = selectedServices.reduce(
    (sum, item) => sum + getCartItemTotal(item.service, item.quantity),
    0
  );

  const hasPayableFixedPrice = fixedPriceTotal > 0;
  const effectivePaymentMethod: ServicePaymentMethod = hasPayableFixedPrice
    ? paymentMethod
    : 'ROOM_CHARGE';
  const usesXendit =
    hasPayableFixedPrice && effectivePaymentMethod === 'XENDIT';

  useEffect(() => {
    if (!hasPayableFixedPrice && paymentMethod !== 'ROOM_CHARGE') {
      setPaymentMethod('ROOM_CHARGE');
      setChargeConsent(false);
    }
  }, [hasPayableFixedPrice, paymentMethod]);

  const hasConfirmationItem = selectedServices.some(
    (item) => item.service.billingMode === 'PRICE_ON_CONFIRMATION'
  );

  const actionError = getErrorMessage(error);
  const successMessage = getSuccessMessage(success, count);
  const visibleError = localError || actionError;

  function getCartQuantity(serviceCode: string) {
    return cart.find((item) => item.serviceCode === serviceCode)?.quantity ?? 0;
  }

  function addService(serviceCode: string) {
    setLocalError(null);

    const service = serviceMap.get(serviceCode);

    if (!service) {
      setLocalError('This service is no longer available.');
      return;
    }

    if (isServiceUnavailable(service)) {
      setLocalError(`${service.name} is currently unavailable.`);
      return;
    }

    const limit = getServiceQuantityLimit(service);

    setCart((current) => {
      const existing = current.find((item) => item.serviceCode === serviceCode);

      if (existing) {
        return current.map((item) =>
          item.serviceCode === serviceCode
            ? {
                ...item,
                quantity: Math.min(item.quantity + 1, limit),
              }
            : item
        );
      }

      return [...current, { serviceCode, quantity: 1 }];
    });
  }

  function updateQuantity(serviceCode: string, quantity: number) {
    setLocalError(null);

    const service = serviceMap.get(serviceCode);

    if (!service) {
      setCart((current) =>
        current.filter((item) => item.serviceCode !== serviceCode)
      );
      return;
    }

    const limit = getServiceQuantityLimit(service);

    if (quantity > limit) {
      setLocalError(`${service.name} only has ${limit} available.`);
    }

    setCart((current) =>
      current
        .map((item) =>
          item.serviceCode === serviceCode
            ? {
                ...item,
                quantity: Math.min(Math.max(quantity, 0), limit),
              }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  function clearCart() {
    sessionStorage.removeItem(`cv-service-checkout-${tagCode}`);
    setCart([]);
    setNotes('');
    setChargeConsent(false);
    setPaymentMethod('ROOM_CHARGE');
    setPaymentMessage(null);
    setLocalError(null);
    clearAttachments();
  }

  function syncAttachmentInput(nextAttachments: AttachmentPreview[]) {
    const input = attachmentInputRef.current;

    if (!input) {
      return;
    }

    if (!nextAttachments.length) {
      input.value = '';
      return;
    }

    const dataTransfer = new DataTransfer();

    nextAttachments.forEach((attachment) => {
      dataTransfer.items.add(attachment.file);
    });

    input.files = dataTransfer.files;
  }

  function handleAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
    setLocalError(null);

    const selectedFiles = Array.from(event.currentTarget.files ?? []);

    if (!selectedFiles.length) {
      return;
    }

    const nextAttachments = [...attachments];

    for (const file of selectedFiles) {
      if (nextAttachments.length >= MAX_ATTACHMENTS) {
        setLocalError(`You can upload up to ${MAX_ATTACHMENTS} images only.`);
        break;
      }

      const validationError = validateAttachmentFile(file);

      if (validationError) {
        setLocalError(validationError);
        continue;
      }

      const url = URL.createObjectURL(file);

      objectUrlsRef.current.push(url);

      nextAttachments.push({
        id: createAttachmentId(file),
        file,
        url,
      });
    }

    setAttachments(nextAttachments);
    syncAttachmentInput(nextAttachments);
  }

  function removeAttachment(attachmentId: string) {
    const removedAttachment = attachments.find(
      (attachment) => attachment.id === attachmentId
    );

    if (removedAttachment) {
      URL.revokeObjectURL(removedAttachment.url);

      objectUrlsRef.current = objectUrlsRef.current.filter(
        (url) => url !== removedAttachment.url
      );
    }

    const nextAttachments = attachments.filter(
      (attachment) => attachment.id !== attachmentId
    );

    setAttachments(nextAttachments);
    syncAttachmentInput(nextAttachments);
  }

  function clearAttachments() {
    attachments.forEach((attachment) => URL.revokeObjectURL(attachment.url));
    objectUrlsRef.current = [];
    setAttachments([]);

    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = '';
    }
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

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    setLocalError(null);
    setPaymentMessage(null);

    if (!cart.length) {
      event.preventDefault();
      setLocalError('Please add at least one service request.');
      return;
    }

    const unavailableItem = selectedServices.find(({ service, quantity }) =>
      isServiceUnavailable(service) ||
      quantity > getServiceQuantityLimit(service)
    );

    if (unavailableItem) {
      event.preventDefault();
      setLocalError(
        `${unavailableItem.service.name} is no longer available in the selected quantity.`
      );
      return;
    }

    const scheduledForIso = getScheduledForIso();

    if (fulfillmentTiming === 'SCHEDULED') {
      if (!scheduledForIso) {
        event.preventDefault();
        setLocalError('Please select a valid scheduled date and time.');
        return;
      }

      if (new Date(scheduledForIso).getTime() <= Date.now() + 60_000) {
        event.preventDefault();
        setLocalError('Scheduled service time must be in the future.');
        return;
      }
    }

    if (hasPayableFixedPrice && !chargeConsent) {
      event.preventDefault();
      setLocalError(
        usesXendit
          ? 'Please confirm the Xendit payment before continuing.'
          : 'Please confirm the room add-on charge before submitting.'
      );
      return;
    }

    if (!usesXendit) {
      return;
    }

    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    sessionStorage.setItem(
      `cv-service-checkout-${tagCode}`,
      JSON.stringify({
        cart,
        guestName,
        notes,
        fulfillmentTiming,
        scheduledDate,
        scheduledTime,
        scheduledNote,
        paymentMethod: effectivePaymentMethod,
      })
    );

    startPaymentTransition(() => {
      void (async () => {
        setPaymentMessage('Preparing your secure QR Ph checkout...');
        const result = await createGuestServiceXenditCheckout(formData);

        if (!result.ok) {
          setPaymentMessage(null);
          setLocalError(result.error);
          return;
        }

        window.location.assign(result.checkoutUrl);
      })();
    });
  }

  if (screen === 'cart') {
    return (
      <div className="-mx-5 -mt-3 min-h-[calc(100vh-5rem)] bg-[#050505] px-5 pb-32 pt-3 text-white">
        <div className="mb-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setScreen('services')}
            className="grid size-11 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-white/70 transition hover:bg-white/10 hover:text-white"
            aria-label="Back to services"
          >
            <ArrowLeft className="size-5" />
          </button>

          <div className="min-w-0 flex-1 text-center">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gold">
              Guest concierge
            </p>
            <h2 className="mt-1 font-serif text-2xl font-normal tracking-wide text-white">
              Review requests
            </h2>
            <p className="mt-1 text-xs font-medium text-white/45">
              {selectedCount} request{selectedCount === 1 ? '' : 's'} ·{' '}
              {fixedPriceTotal > 0 ? money(fixedPriceTotal) : 'Review details'}
            </p>
          </div>

          {cart.length > 0 ? (
            <button
              type="button"
              onClick={clearCart}
              className="grid size-11 shrink-0 place-items-center rounded-full border border-red-400/15 bg-red-500/10 text-red-200 transition hover:bg-red-500/20"
              aria-label="Clear requests"
            >
              <Trash2 className="size-4.5" />
            </button>
          ) : (
            <div className="size-11" />
          )}
        </div>

        {cart.length === 0 ? (
          <section className="grid min-h-[62vh] place-items-center rounded-[2rem] border border-white/10 bg-white/[0.035] p-8 text-center">
            <div>
              <div className="mx-auto grid size-20 place-items-center rounded-full border border-gold/20 bg-gold/10 text-gold">
                <ShoppingBag className="size-8" strokeWidth={1.5} />
              </div>
              <h3 className="mt-6 font-serif text-3xl font-normal tracking-wide">
                No requests selected
              </h3>
              <p className="mx-auto mt-3 max-w-xs text-sm font-medium leading-6 text-white/50">
                Browse guest services and choose what you need.
              </p>
              <button
                type="button"
                onClick={() => setScreen('services')}
                className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-gold px-6 text-sm font-black text-black"
              >
                Browse Services
                <ChevronRight className="size-4" />
              </button>
            </div>
          </section>
        ) : (
          <form action={createServiceRequestAction} onSubmit={handleSubmit}>
            <input type="hidden" name="tagCode" value={tagCode} />
            <input
              type="hidden"
              name="paymentMethod"
              value={effectivePaymentMethod}
            />
            <input
              type="hidden"
              name="fulfillmentTiming"
              value={fulfillmentTiming}
            />
            <input
              type="hidden"
              name="scheduledFor"
              value={getScheduledForIso() || ''}
            />
            <input
              type="hidden"
              name="scheduledNote"
              value={scheduledNote}
            />

            {selectedServices.map((item) => (
              <div key={`hidden-${item.service.code}`}>
                <input
                  type="hidden"
                  name="serviceCodes"
                  value={item.service.code}
                />
                <input
                  type="hidden"
                  name={`quantity_${item.service.code}`}
                  value={item.quantity}
                />
              </div>
            ))}

            <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] shadow-[0_24px_70px_rgba(0,0,0,0.24)]">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gold">
                    Selected services
                  </p>
                  <p className="mt-1 text-sm font-semibold text-white/50">
                    Adjust quantities before sending
                  </p>
                </div>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black text-white/70">
                  {selectedCount}
                </span>
              </div>

              <div className="divide-y divide-white/10">
                {selectedServices.map(({ service, quantity }) => {
                  const Icon = getServiceIcon(service);
                  const badge = getBillingBadge(service);

                  return (
                    <article
                      key={service.code}
                      className="grid grid-cols-[64px_1fr_auto] gap-3 p-4"
                    >
                      <div className="grid size-16 place-items-center rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_top,rgba(214,167,56,0.16),transparent_55%),#0c0c0c] text-gold">
                        <Icon className="size-6" strokeWidth={1.6} />
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-serif text-[17px] font-medium leading-tight tracking-wide text-white">
                            {service.name}
                          </h3>
                          <span
                            className={cn(
                              'rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-widest',
                              badge.className
                            )}
                          >
                            {badge.label}
                          </span>
                        </div>

                        <p className="mt-1 text-xs font-semibold text-white/45">
                          {getServicePriceText(service)}
                        </p>

                        <div className="mt-3">
                          <QuantityControl
                            name={service.name}
                            quantity={quantity}
                            onDecrease={() =>
                              updateQuantity(service.code, quantity - 1)
                            }
                            onIncrease={() =>
                              updateQuantity(service.code, quantity + 1)
                            }
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => updateQuantity(service.code, 0)}
                        className="grid size-9 place-items-center rounded-full text-white/35 transition hover:bg-red-500/10 hover:text-red-200"
                        aria-label={`Remove ${service.name}`}
                      >
                        <X className="size-4" />
                      </button>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="mt-5 rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.2)]">
              <div className="mb-5 flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-2xl bg-gold/15 text-gold">
                  <ShieldCheck className="size-5" />
                </span>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gold">
                    Request details
                  </p>
                  <h3 className="mt-1 font-serif text-xl font-normal tracking-wide">
                    Personalize your request
                  </h3>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.16em] text-white/45">
                    Requested by
                  </label>
                  <input
                    name="guestName"
                    type="text"
                    autoComplete="name"
                    placeholder="Guest name"
                    value={guestName}
                    onChange={(event) =>
                      setGuestName(event.currentTarget.value)
                    }
                    className={cn(darkFieldClass, 'h-14')}
                    style={{
                      WebkitTextFillColor: 'white',
                      caretColor: '#d6a738',
                    }}
                  />
                  <p className="mt-2 text-xs font-medium leading-5 text-white/40">
                    Auto-filled from the active stay. You may edit it for another
                    guest.
                  </p>
                </div>

                <textarea
                  name="notes"
                  rows={4}
                  placeholder="Special instructions or helpful details"
                  value={notes}
                  onChange={(event) => setNotes(event.currentTarget.value)}
                  className={cn(
                    darkFieldClass,
                    'min-h-28 resize-y p-4 leading-6'
                  )}
                  style={{
                    WebkitTextFillColor: 'white',
                    caretColor: '#d6a738',
                  }}
                />

                <div>
                  <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.16em] text-white/45">
                    Request time
                  </label>
                  <select
                    value={fulfillmentTiming}
                    onChange={(event) =>
                      setFulfillmentTiming(
                        event.target.value as FulfillmentTimingValue
                      )
                    }
                    className={cn(
                      darkFieldClass,
                      'h-14 appearance-none [color-scheme:dark]'
                    )}
                  >
                    <option value="ASAP" className="bg-[#111] text-white">
                      Now / Send request immediately
                    </option>
                    <option value="SCHEDULED" className="bg-[#111] text-white">
                      Schedule service for later
                    </option>
                  </select>
                </div>

                {fulfillmentTiming === 'SCHEDULED' ? (
                  <div className="rounded-[1.5rem] border border-gold/20 bg-gold/[0.06] p-4">
                    <div className="flex items-center gap-2 text-gold">
                      <CalendarClock className="size-4" />
                      <p className="text-[10px] font-black uppercase tracking-[0.16em]">
                        Scheduled request
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
                          darkFieldClass,
                          'h-14 [color-scheme:dark]'
                        )}
                      />
                      <input
                        type="time"
                        value={scheduledTime}
                        onChange={(event) =>
                          setScheduledTime(event.currentTarget.value)
                        }
                        className={cn(
                          darkFieldClass,
                          'h-14 [color-scheme:dark]'
                        )}
                      />
                    </div>

                    <textarea
                      rows={3}
                      placeholder="Optional schedule note"
                      value={scheduledNote}
                      onChange={(event) =>
                        setScheduledNote(event.currentTarget.value)
                      }
                      className={cn(
                        darkFieldClass,
                        'mt-3 min-h-24 resize-y p-4 leading-6'
                      )}
                    />
                  </div>
                ) : null}

                <div className="rounded-[1.5rem] border border-dashed border-white/15 bg-black/20 p-4">
                  <div className="flex items-start gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/[0.07] text-gold">
                      <ImagePlus className="size-5" />
                    </span>
                    <div>
                      <p className="font-serif text-[17px] font-medium tracking-wide">
                        Add supporting photos
                      </p>
                      <p className="mt-1 text-xs font-medium leading-5 text-white/45">
                        Helpful for maintenance, damages, leaks, or missing
                        items. Up to {MAX_ATTACHMENTS} images.
                      </p>
                    </div>
                  </div>

                  <input
                    ref={attachmentInputRef}
                    name="attachments"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={handleAttachmentChange}
                    className="hidden"
                  />

                  <button
                    type="button"
                    onClick={() => attachmentInputRef.current?.click()}
                    className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-gold/25 bg-gold/10 px-5 text-sm font-black text-gold transition hover:bg-gold/15 active:scale-[0.99]"
                  >
                    <Camera className="size-4" />
                    Take or Upload Photos
                  </button>

                  {attachments.length > 0 ? (
                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {attachments.map((attachment) => (
                        <div
                          key={attachment.id}
                          className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]"
                        >
                          <div className="relative aspect-square bg-black/40">
                            <img
                              src={attachment.url}
                              alt={attachment.file.name}
                              className="size-full object-cover"
                            />
                            <button
                              type="button"
                              onClick={() => removeAttachment(attachment.id)}
                              className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-black/75 text-white"
                              aria-label={`Remove ${attachment.file.name}`}
                            >
                              <X className="size-4" />
                            </button>
                          </div>

                          <div className="p-3">
                            <p className="truncate text-xs font-semibold">
                              {attachment.file.name}
                            </p>
                            <p className="mt-0.5 text-[10px] text-white/40">
                              {formatFileSize(attachment.file.size)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-4 flex items-center gap-2 rounded-xl bg-white/[0.04] p-3 text-xs font-medium text-white/40">
                      <FileImage className="size-4" />
                      No photos attached
                    </div>
                  )}
                </div>

                {hasPayableFixedPrice ? (
                  <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gold">
                      Payment method
                    </p>

                    <div className="mt-3 grid gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setPaymentMethod('ROOM_CHARGE');
                          setChargeConsent(false);
                        }}
                        className={cn(
                          'flex items-center gap-3 rounded-2xl border p-4 text-left transition',
                          paymentMethod === 'ROOM_CHARGE'
                            ? 'border-gold/45 bg-gold/10'
                            : 'border-white/10 bg-white/[0.03]'
                        )}
                      >
                        <span className="grid size-11 place-items-center rounded-2xl bg-white/10 text-gold">
                          <CreditCard className="size-5" />
                        </span>
                        <span>
                          <span className="block text-sm font-black text-white">
                            Charge to room
                          </span>
                          <span className="mt-1 block text-xs font-medium text-white/45">
                            Add the fixed-price services to the room folio.
                          </span>
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setPaymentMethod('XENDIT');
                          setChargeConsent(false);
                        }}
                        className={cn(
                          'flex items-center gap-3 rounded-2xl border p-4 text-left transition',
                          paymentMethod === 'XENDIT'
                            ? 'border-gold/45 bg-gold/10'
                            : 'border-white/10 bg-white/[0.03]'
                        )}
                      >
                        <span className="grid size-11 place-items-center rounded-2xl bg-white/10 text-gold">
                          <QrCode className="size-5" />
                        </span>
                        <span>
                          <span className="block text-sm font-black text-white">
                            Card / E-wallet / QR Ph
                          </span>
                          <span className="mt-1 block text-xs font-medium text-white/45">
                            Continue to Xendit and choose Card, GCash, Maya, QR Ph, or another enabled method before the request is released to staff.
                          </span>
                        </span>
                      </button>
                    </div>
                  </div>
                ) : null}

                {hasPayableFixedPrice ? (
                  <label className="flex cursor-pointer items-start gap-3 rounded-[1.5rem] border border-gold/20 bg-gold/[0.07] p-4 text-sm font-semibold leading-6 text-gold/90">
                    <input
                      name="chargeConsent"
                      value="true"
                      type="checkbox"
                      checked={chargeConsent}
                      onChange={(event) =>
                        setChargeConsent(event.target.checked)
                      }
                      className="mt-1 size-5 rounded border-gold/40 bg-black accent-gold"
                    />
                    <span>
                      {paymentMethod === 'XENDIT'
                        ? 'I confirm the secure online payment of '
                        : 'I approve room charges totaling '}
                      <b className="text-white">{money(fixedPriceTotal)}</b>.
                    </span>
                  </label>
                ) : null}

                {!hasPayableFixedPrice ? (
                  <div className="rounded-[1.5rem] border border-emerald-400/20 bg-emerald-400/[0.08] p-4 text-sm font-semibold leading-6 text-emerald-200">
                    No online payment is required. This request will be sent
                    directly to the hotel team.
                  </div>
                ) : null}

                {hasConfirmationItem ? (
                  <div className="rounded-[1.5rem] border border-gold/15 bg-gold/[0.06] p-4 text-sm font-semibold leading-6 text-gold/85">
                    Some services require staff confirmation before pricing or
                    completion.
                  </div>
                ) : null}
              </div>
            </section>

            <section className="mt-5 rounded-[2rem] border border-gold/20 bg-[linear-gradient(145deg,rgba(214,167,56,0.14),rgba(255,255,255,0.035))] p-5">
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-4 text-white/55">
                  <span>Selected requests</span>
                  <b className="text-white">{selectedCount}</b>
                </div>
                <div className="flex items-center justify-between gap-4 text-white/55">
                  <span>Paid add-ons</span>
                  <b className="text-gold">{money(fixedPriceTotal)}</b>
                </div>
                <div className="border-t border-white/10 pt-4">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-white/55">Room / Location</span>
                    <b className="text-right text-white">{roomLabel}</b>
                  </div>
                </div>
              </div>

              {paymentMessage ? (
                <p className="mt-4 flex items-center gap-2 rounded-2xl border border-gold/20 bg-gold/10 p-3 text-sm font-bold text-gold">
                  <RefreshCw className="size-4 animate-spin" />
                  {paymentMessage}
                </p>
              ) : null}

              {visibleError ? (
                <p className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 p-3 text-sm font-bold text-red-200">
                  {visibleError}
                </p>
              ) : null}

              <SubmitButton
                disabled={
                  cart.length === 0 ||
                  (hasPayableFixedPrice && !chargeConsent)
                }
                clientPending={paymentPending}
                paymentMethod={effectivePaymentMethod}
                requiresPayment={hasPayableFixedPrice}
              />
            </section>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="-mx-5 -mt-3 min-h-[calc(100vh-5rem)] bg-[#050505] px-5 pb-40 pt-3 text-white">
      {successMessage ? (
        <div className="mb-5 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm font-semibold text-emerald-200">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
            <p>{successMessage}</p>
          </div>
        </div>
      ) : null}

      {visibleError ? (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm font-semibold text-red-200">
          <X className="mt-0.5 size-4 shrink-0" />
          <p className="min-w-0 flex-1">{visibleError}</p>
          <button
            type="button"
            onClick={() => setLocalError(null)}
            className="grid size-7 shrink-0 place-items-center rounded-full bg-black/15"
            aria-label="Dismiss error"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}

      <section className="mb-5 overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(214,167,56,0.16),transparent_36%),linear-gradient(145deg,#161512,#0b0b0a)] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.28)]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-gold/20 bg-gold/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-gold">
              <Sparkles className="size-3.5" />
              Private concierge
            </div>

            <h2 className="mt-4 max-w-[17rem] font-serif text-[2rem] font-normal leading-[1.05] tracking-tight text-white">
              Comfort, delivered to your room.
            </h2>

            <p className="mt-3 max-w-xs text-sm font-medium leading-6 text-white/55">
              Request housekeeping, room amenities, maintenance assistance, and
              thoughtful add-ons.
            </p>
          </div>

          <span className="grid size-14 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.05] text-gold">
            <BellRing className="size-6" strokeWidth={1.5} />
          </span>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/35">
              Service location
            </p>
            <p className="mt-1 font-serif text-[17px] font-medium tracking-wide text-white">
              {roomLabel}
            </p>
          </div>
          <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-emerald-300">
            Available
          </span>
        </div>
      </section>

      <section className="mb-5 rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-4">
        <label className="block text-[10px] font-black uppercase tracking-[0.16em] text-gold/85">
          Requesting as
        </label>
        <input
          type="text"
          autoComplete="name"
          placeholder="Guest name"
          value={guestName}
          onChange={(event) => setGuestName(event.currentTarget.value)}
          className={cn(darkFieldClass, 'mt-3 h-13')}
          style={{
            WebkitTextFillColor: 'white',
            caretColor: '#d6a738',
          }}
        />
        <p className="mt-2 text-xs font-medium leading-5 text-white/40">
          Auto-filled from your active stay. You may edit this name.
        </p>
      </section>

      <div className="sticky top-[4.5rem] z-20 -mx-1 mb-7 rounded-[1.75rem] border border-white/10 bg-black/90 p-2 shadow-[0_18px_45px_rgba(0,0,0,0.28)] backdrop-blur-xl">
        <div className="flex h-12 items-center gap-3 rounded-2xl bg-white/[0.07] px-4 transition focus-within:bg-white/[0.1] focus-within:ring-1 focus-within:ring-gold/35">
          <Search className="size-4.5 shrink-0 text-gold" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search services and add-ons"
            className="w-full bg-transparent text-sm font-semibold text-white outline-none placeholder:text-white/35"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="grid size-8 shrink-0 place-items-center rounded-full text-white/40 hover:bg-white/10 hover:text-white"
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>

        <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {categories.map((category) => {
            const active = category === activeCategory;
            const categoryCount =
              category === 'All'
                ? services.length
                : categoryCounts.get(category) ?? 0;

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
                    active
                      ? 'bg-black/12 text-black/70'
                      : 'bg-white/10 text-white/45'
                  )}
                >
                  {categoryCount}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-8">
        {categories
          .filter((category) => category !== 'All')
          .filter(
            (category) =>
              activeCategory === 'All' || activeCategory === category
          )
          .map((category) => {
            const categoryServices = filteredServices.filter(
              (service) => service.category === category
            );

            if (!categoryServices.length) {
              return null;
            }

            return (
              <section key={category}>
                <div className="mb-4 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold">
                      Guest services
                    </p>
                    <h3 className="mt-1 font-serif text-2xl font-normal tracking-wide text-white">
                      {category}
                    </h3>
                  </div>
                  <p className="text-xs font-bold text-white/35">
                    {categoryServices.length} option
                    {categoryServices.length === 1 ? '' : 's'}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {categoryServices.map((service) => {
                    const Icon = getServiceIcon(service);
                    const badge = getBillingBadge(service);
                    const quantity = getCartQuantity(service.code);
                    const unavailable = isServiceUnavailable(service);

                    return (
                      <article
                        key={service.code}
                        className={cn(
                          'flex min-h-[220px] flex-col overflow-hidden rounded-[1.6rem] border bg-white/[0.04] p-4 shadow-[0_14px_36px_rgba(0,0,0,0.16)] transition',
                          unavailable
                            ? 'border-red-400/15 bg-red-500/[0.04] opacity-70'
                            : quantity > 0
                              ? 'border-gold/35 bg-gold/[0.06]'
                              : 'border-white/10 hover:border-white/20 hover:bg-white/[0.06]'
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="grid size-12 place-items-center rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_top,rgba(214,167,56,0.18),transparent_58%),#0d0d0d] text-gold">
                            <Icon className="size-5.5" strokeWidth={1.6} />
                          </span>
                          <span
                            className={cn(
                              'max-w-[7rem] truncate rounded-full border px-2.5 py-1 text-[8px] font-black uppercase tracking-widest',
                              badge.className
                            )}
                          >
                            {badge.label}
                          </span>
                        </div>

                        <h4 className="mt-4 line-clamp-2 font-serif text-[18px] font-medium leading-tight tracking-wide text-white">
                          {service.name}
                        </h4>

                        {service.description ? (
                          <p className="mt-2 line-clamp-3 text-[11px] font-medium leading-4 text-white/45">
                            {service.description}
                          </p>
                        ) : (
                          <p className="mt-2 text-[11px] font-medium text-white/25">
                            Personalized assistance from our hotel team.
                          </p>
                        )}

                        <div className="mt-auto pt-4">
                          <p className="mb-3 text-[10px] font-bold uppercase tracking-wide text-white/35">
                            {unavailable
                              ? 'Currently unavailable'
                              : service.inventoryTracked
                                ? `${getServicePriceText(service)} · ${service.availableQty ?? 0} available`
                                : getServicePriceText(service)}
                          </p>

                          {unavailable ? (
                            <button
                              type="button"
                              disabled
                              className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-red-500/10 text-xs font-black text-red-200"
                            >
                              Sold out
                            </button>
                          ) : quantity > 0 ? (
                            <QuantityControl
                              name={service.name}
                              quantity={quantity}
                              onDecrease={() =>
                                updateQuantity(service.code, quantity - 1)
                              }
                              onIncrease={() =>
                                updateQuantity(service.code, quantity + 1)
                              }
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => addService(service.code)}
                              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-white text-xs font-black text-black transition hover:bg-gold active:scale-[0.98]"
                            >
                              Add request
                              <Plus className="size-4" />
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}

        {!filteredServices.length ? (
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-9 text-center">
            <div className="mx-auto grid size-16 place-items-center rounded-full bg-white/5 text-white/35">
              <ConciergeBell className="size-7" strokeWidth={1.5} />
            </div>
            <h3 className="mt-5 font-serif text-2xl font-normal tracking-wide">
              No services found
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
      </div>

      {selectedCount > 0 ? (
        <button
          type="button"
          onClick={() => setScreen('cart')}
          className="fixed inset-x-5 bottom-24 z-30 mx-auto flex max-w-md items-center justify-between gap-4 rounded-[1.35rem] border border-gold/25 bg-[linear-gradient(135deg,#d9ad45,#c79022)] px-4 py-3.5 text-black shadow-[0_18px_45px_rgba(214,167,56,0.28)] transition hover:brightness-105 active:scale-[0.99]"
        >
          <span className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-black/12">
              <ShoppingBag className="size-4.5" />
            </span>
            <span className="text-left">
              <span className="block text-[10px] font-black uppercase tracking-widest text-black/55">
                {selectedCount} request{selectedCount === 1 ? '' : 's'} selected
              </span>
              <span className="mt-0.5 block text-sm font-black">
                Review requests
              </span>
            </span>
          </span>

          <span className="flex items-center gap-2 font-serif text-lg font-medium">
            {fixedPriceTotal > 0 ? money(fixedPriceTotal) : 'Review'}
            <ChevronRight className="size-4" />
          </span>
        </button>
      ) : null}
    </div>
  );
}
