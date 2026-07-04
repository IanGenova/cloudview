'use client';

import {
  type ChangeEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useFormStatus } from 'react-dom';
import {
  ArrowLeft,
  Baby,
  BedDouble,
  Car,
  CheckCircle2,
  Clock,
  Camera,
  FileImage,
  ImagePlus,
  ConciergeBell,
  Droplets,
  Hammer,
  Minus,
  PackagePlus,
  Plus,
  Search,
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
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { cn } from '@/lib/utils';
import { createServiceRequestAction } from '../actions';

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

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024;

const ALLOWED_ATTACHMENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

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

function money(value: number) {
  return moneyFormatter.format(value);
}

function getBillingBadge(service: GuestServiceItem) {
  if (service.billingMode === 'FREE') {
    return {
      label: 'FREE',
      className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20',
    };
  }

  if (service.billingMode === 'PRICE_ON_CONFIRMATION') {
    return {
      label: 'CONFIRM',
      className: 'bg-gold/15 text-gold border-gold/25',
    };
  }

  return {
    label: money(service.unitPrice),
    className: 'bg-white/10 text-white/80 border-white/20',
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
    invalid_attachment: 'Please upload JPG, PNG, or WEBP images only. Maximum 5 images, 5MB each.',
    invalid_schedule:
        'Please select a valid future date and time for the scheduled request.',
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
    return `${requestCount} request${requestCount === 1 ? '' : 's'} sent for staff price confirmation.`;
  }

  if (success === 'mixed') {
    return `${requestCount} request${requestCount === 1 ? '' : 's'} sent. Some items may require staff confirmation.`;
  }

  return `${requestCount} service request${requestCount === 1 ? '' : 's'} sent successfully.`;
}

function getServiceIcon(service: GuestServiceItem) {
  return iconMap[service.iconKey] ?? ConciergeBell;
}

function getServicePriceText(service: GuestServiceItem) {
  if (service.billingMode === 'FREE') {
    return 'Free';
  }

  if (service.billingMode === 'PRICE_ON_CONFIRMATION') {
    return 'Price on confirmation';
  }

  return `${money(service.unitPrice)}${service.unitLabel ? ` / ${service.unitLabel}` : ''}`;
}

function getCartItemTotal(service: GuestServiceItem, quantity: number) {
  if (service.billingMode !== 'FIXED_PRICE') {
    return 0;
  }

  return service.unitPrice * quantity;
}

function SubmitButton({
  disabled,
}: {
  disabled: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      disabled={disabled || pending}
      size="lg"
      className="mt-6 h-14 w-full rounded-[1.25rem] bg-gold text-[15px] font-semibold tracking-wide text-black shadow-[0_12px_30px_rgba(214,167,56,0.25)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100"
    >
      {pending ? 'Submitting...' : 'Submit Requests'}
    </Button>
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
  const [screen, setScreen] = useState<'services' | 'cart'>('services');
  const [cart, setCart] = useState<ServiceCartItem[]>([]);
  const [guestName, setGuestName] = useState(defaultGuestName);
  const [notes, setNotes] = useState('');
  const [chargeConsent, setChargeConsent] = useState(false);
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

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current = [];
    };
  }, []);

  useEffect(() => {
    setGuestName(defaultGuestName);
  }, [defaultGuestName]);

  const serviceMap = useMemo(
    () => new Map(services.map((service) => [service.code, service])),
    [services]
  );

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(services.map((service) => service.category)))],
    [services]
  );

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

  const hasFixedPriceItem = selectedServices.some(
    (item) => item.service.billingMode === 'FIXED_PRICE'
  );

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

    setCart((current) => {
      const existing = current.find((item) => item.serviceCode === serviceCode);

      if (existing) {
        return current.map((item) =>
          item.serviceCode === serviceCode
            ? {
                ...item,
                quantity: Math.min(item.quantity + 1, 20),
              }
            : item
        );
      }

      return [
        ...current,
        {
          serviceCode,
          quantity: 1,
        },
      ];
    });
  }

  function updateQuantity(serviceCode: string, quantity: number) {
    setLocalError(null);

    setCart((current) =>
      current
        .map((item) =>
          item.serviceCode === serviceCode
            ? {
                ...item,
                quantity: Math.min(Math.max(quantity, 0), 20),
              }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  function clearCart() {
    setCart([]);
    setNotes('');
    setChargeConsent(false);
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

    if (!cart.length) {
      event.preventDefault();
      setLocalError('Please add at least one service request.');
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

    if (hasFixedPriceItem && !chargeConsent) {
      event.preventDefault();
      setLocalError('Please confirm the room add-on charge before submitting.');
      return;
    }
  }

  if (screen === 'cart') {
    return (
      <div className="-mx-5 -mt-3 min-h-[calc(100vh-5rem)] bg-[#050505] px-5 pb-28 pt-2 text-white">
        <div className="mb-5 grid grid-cols-[44px_1fr_44px] items-center">
          <button
            type="button"
            onClick={() => setScreen('services')}
            className="grid size-11 place-items-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
            aria-label="Back to services"
          >
            <ArrowLeft className="size-6" />
          </button>

          <div className="text-center">
            <h2 className="font-serif text-xl font-normal tracking-wide">Selected Requests</h2>
            <p className="mt-0.5 text-xs font-medium text-white/50">
              Review services before submitting
            </p>
          </div>

          <div />
        </div>

        {cart.length === 0 ? (
          <div className="grid min-h-[65vh] place-items-center rounded-[2.4rem] border border-white/10 bg-white/[0.03] p-6 text-center shadow-sm backdrop-blur-md">
            <div>
              <div className="mx-auto grid size-20 place-items-center rounded-[1.5rem] bg-white/5 text-white/40">
                <ShoppingBag className="size-8" strokeWidth={1.5} />
              </div>

              <h3 className="mt-6 font-serif text-2xl font-light tracking-wide">No requests selected</h3>
              <p className="mt-2 text-[15px] font-medium text-white/50">
                Add service requests first.
              </p>

              <button
                type="button"
                onClick={() => setScreen('services')}
                className="mt-8 rounded-[1.25rem] bg-gold px-6 py-3.5 text-[15px] font-semibold tracking-wide text-black transition hover:brightness-110 active:scale-[0.98]"
              >
                Back to Services
              </button>
            </div>
          </div>
        ) : (
          <form action={createServiceRequestAction} onSubmit={handleSubmit}>
            <input type="hidden" name="tagCode" value={tagCode} />

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
                <input type="hidden" name="fulfillmentTiming" value={fulfillmentTiming} />
                <input type="hidden" name="scheduledFor" value={getScheduledForIso() || ''} />
                <input type="hidden" name="scheduledNote" value={scheduledNote} />
              </div>
            ))}

            <div className="rounded-[2.4rem] border border-white/10 bg-white/[0.04] p-5 shadow-sm backdrop-blur-md">
              <div className="space-y-4">
                {selectedServices.map(({ service, quantity }) => {
                  const Icon = getServiceIcon(service);

                  return (
                    <div
                      key={service.code}
                      className="grid grid-cols-[64px_1fr_36px] gap-4 border-b border-white/10 pb-5 last:border-b-0 last:pb-0"
                    >
                      <div className="grid size-16 place-items-center rounded-[1.25rem] bg-white/5 text-white/70">
                        <Icon className="size-7" />
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <h3 className="font-serif text-[17px] font-medium tracking-wide text-white text-balance">
                            {service.name}
                          </h3>

                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${
                              getBillingBadge(service).className
                            }`}
                          >
                            {getBillingBadge(service).label}
                          </span>
                        </div>

                        <p className="mt-1 text-sm font-medium text-gold/90">
                          {getServicePriceText(service)}
                        </p>

                        {service.description ? (
                          <p className="mt-1.5 text-[12px] leading-relaxed text-white/60 text-balance">
                            {service.description}
                          </p>
                        ) : null}

                        <div className="mt-4 flex items-center gap-3 w-fit rounded-full border border-white/10 bg-black/40 px-2 py-1">
                          <button
                            type="button"
                            onClick={() =>
                              updateQuantity(service.code, quantity - 1)
                            }
                            className="grid size-8 place-items-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white active:scale-95"
                            aria-label={`Decrease ${service.name}`}
                          >
                            <Minus className="size-3.5" />
                          </button>

                          <span className="min-w-[1.25rem] text-center text-[15px] font-semibold text-white">
                            {quantity}
                          </span>

                          <button
                            type="button"
                            onClick={() =>
                              updateQuantity(service.code, quantity + 1)
                            }
                            className="grid size-8 place-items-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white active:scale-95"
                            aria-label={`Increase ${service.name}`}
                          >
                            <Plus className="size-3.5" />
                          </button>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => updateQuantity(service.code, 0)}
                        className="grid size-10 shrink-0 place-items-center rounded-full text-white/40 transition hover:bg-white/10 hover:text-white"
                        aria-label={`Remove ${service.name}`}
                      >
                        <X className="size-5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-5 rounded-[2.4rem] border border-white/10 bg-white/[0.04] p-6 shadow-sm backdrop-blur-md">
              <h3 className="mb-5 font-serif text-xl font-normal tracking-wide text-white">Request Details</h3>

              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-gold/80">
                    Requested By
                  </label>

                  <Input
                    name="guestName"
                    placeholder="Guest name"
                    value={guestName}
                    onChange={(event) => setGuestName(event.target.value)}
                    className="h-14 rounded-[1.25rem] border-white/10 bg-black/40 px-5 text-[15px] font-medium text-white placeholder:text-white/40 transition focus:border-gold/50 focus:bg-black/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                  />

                  <p className="mt-2 text-xs font-medium text-white/50">
                    Auto-filled from the current stay. You may edit this if another guest is making the request.
                  </p>
                </div>

                <Textarea
                  name="notes"
                  placeholder="Special instructions / notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  className="rounded-[1.25rem] border-white/10 bg-black/40 p-5 text-[15px] font-medium text-white placeholder:text-white/40 transition focus:border-gold/50 focus:bg-black/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                />

                <div>
                  <label className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-gold/80">
                    Request Time
                  </label>

                  <select
                    value={fulfillmentTiming}
                    onChange={(event) =>
                      setFulfillmentTiming(event.target.value as FulfillmentTimingValue)
                    }
                    className="h-14 w-full rounded-[1.25rem] border border-white/10 bg-black/40 px-5 text-[15px] font-medium text-white outline-none transition focus:border-gold/50 focus:bg-black/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] appearance-none"
                  >
                    <option value="ASAP" className="bg-[#111] text-white">Now / Send request immediately</option>
                    <option value="SCHEDULED" className="bg-[#111] text-white">Schedule service for later</option>
                  </select>
                </div>

                {fulfillmentTiming === 'SCHEDULED' ? (
                  <div className="rounded-[1.5rem] border border-gold/20 bg-gold/5 p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-gold">
                      Scheduled Service Request
                    </p>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <Input
                        type="date"
                        value={scheduledDate}
                        onChange={(event) => setScheduledDate(event?.currentTarget?.value ?? '')}
                        className="h-14 rounded-[1.25rem] border-gold/20 bg-black/40 px-5 text-[15px] font-medium text-white transition focus:border-gold/50 focus:bg-black/60 [color-scheme:dark]"
                      />

                      <Input
                        type="time"
                        value={scheduledTime}
                        onChange={(event) => setScheduledTime(event?.currentTarget?.value ?? '')}
                        className="h-14 rounded-[1.25rem] border-gold/20 bg-black/40 px-5 text-[15px] font-medium text-white transition focus:border-gold/50 focus:bg-black/60 [color-scheme:dark]"
                      />
                    </div>

                    <Textarea
                      className="mt-3 rounded-[1.25rem] border-gold/20 bg-black/40 p-5 text-[15px] font-medium text-white placeholder:text-white/40 transition focus:border-gold/50 focus:bg-black/60"
                      placeholder="Optional schedule note, e.g. Please clean the room after breakfast"
                      value={scheduledNote}
                      onChange={(event) => setScheduledNote(event?.currentTarget?.value ?? '')}
                    />

                    <p className="mt-3 text-[13px] font-medium leading-relaxed text-gold/80">
                      This request will be saved now, then released to staff before the
                      scheduled time.
                    </p>
                  </div>
                ) : null}

                <div className="rounded-[1.5rem] border border-dashed border-white/20 bg-black/20 p-5">
                  <div className="flex items-start gap-4">
                    <span className="grid size-12 shrink-0 place-items-center rounded-[1rem] bg-white/10 text-white shadow-sm">
                      <ImagePlus className="size-5" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="font-serif text-[17px] font-medium tracking-wide text-white">
                        Add Photos
                      </p>

                      <p className="mt-1.5 text-[13px] font-medium leading-relaxed text-white/60">
                        Upload photos for maintenance issues, damages, leaks, missing items,
                        or areas needing attention. Maximum {MAX_ATTACHMENTS} images, 5MB each.
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
                    className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-[1.25rem] bg-gold px-5 text-[15px] font-semibold tracking-wide text-black transition hover:brightness-110 active:scale-[0.98]"
                  >
                    <Camera className="size-4.5" />
                    Take / Upload Photos
                  </button>

                  {attachments.length > 0 ? (
                    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {attachments.map((attachment) => (
                        <div
                          key={attachment.id}
                          className="overflow-hidden rounded-[1.25rem] border border-white/10 bg-white/5"
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
                              className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-black/70 text-white transition hover:bg-black/90 active:scale-95"
                              aria-label={`Remove ${attachment.file.name}`}
                            >
                              <X className="size-4" />
                            </button>
                          </div>

                          <div className="p-3">
                            <p className="truncate text-[13px] font-medium text-white">
                              {attachment.file.name}
                            </p>

                            <p className="mt-0.5 text-[11px] font-medium text-white/50">
                              {formatFileSize(attachment.file.size)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-5 flex items-center gap-2.5 rounded-[1rem] bg-white/5 p-4 text-[13px] font-medium text-white/50">
                      <FileImage className="size-4.5 text-white/40" />
                      No photos attached yet.
                    </div>
                  )}
                </div>

                {hasFixedPriceItem ? (
                  <label className="flex items-start gap-3 rounded-[1.5rem] bg-gold/10 p-5 text-[15px] font-medium text-gold cursor-pointer transition hover:bg-gold/15">
                    <input
                      name="chargeConsent"
                      value="true"
                      type="checkbox"
                      checked={chargeConsent}
                      onChange={(event) =>
                        setChargeConsent(event.target.checked)
                      }
                      className="mt-1 size-5 rounded border-gold/40 bg-black/40 accent-gold"
                    />

                    <span className="leading-relaxed">
                      I confirm the selected paid room add-ons may be charged to
                      this room. Total paid add-ons:{' '}
                      <span className="font-semibold text-white">{money(fixedPriceTotal)}</span>.
                    </span>
                  </label>
                ) : null}

                {hasConfirmationItem ? (
                  <div className="rounded-[1.5rem] bg-gold/10 p-5 text-[15px] font-medium leading-relaxed text-gold">
                    Some selected services require staff confirmation before
                    pricing or completion.
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-5 rounded-[2.4rem] border border-white/10 bg-white/[0.04] p-6 shadow-sm backdrop-blur-md">
              <div className="space-y-4 text-[15px]">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-white/60">Selected requests</span>
                  <span className="font-serif font-medium tracking-wide text-white">{selectedCount}</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="font-medium text-white/60">Paid add-ons</span>
                  <span className="font-serif font-medium tracking-wide text-gold">{money(fixedPriceTotal)}</span>
                </div>

                <div className="border-t border-white/10 pt-5 mt-2">
                  <div className="flex justify-between items-center">
                    <span className="font-serif font-medium tracking-wide text-white/80">Room / Location</span>
                    <span className="font-serif font-medium tracking-wide text-white">{roomLabel}</span>
                  </div>
                </div>
              </div>

              {visibleError ? (
                <p className="mt-5 rounded-[1.25rem] bg-red-500/10 p-4 text-[13px] font-medium text-red-200">
                  {visibleError}
                </p>
              ) : null}

              <SubmitButton
                disabled={cart.length === 0 || (hasFixedPriceItem && !chargeConsent)}
              />
            </div>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="-mx-5 -mt-3 min-h-[calc(100vh-5rem)] bg-[#050505] px-5 pb-28 pt-2 text-white">
      {successMessage ? (
        <div className="mb-5 rounded-[1.25rem] border border-emerald-400/20 bg-emerald-400/10 p-4 text-[15px] font-medium text-emerald-200">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
            <p>{successMessage}</p>
          </div>
        </div>
      ) : null}

      {visibleError ? (
        <div className="mb-5 rounded-[1.25rem] border border-red-400/20 bg-red-500/10 p-4 text-[15px] font-medium text-red-200">
          {visibleError}
        </div>
      ) : null}

      <div className="mb-6">
        <label className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-gold/80">
          Requested By
        </label>

        <Input
          placeholder="Guest name"
          value={guestName}
          onChange={(event) => setGuestName(event.target.value)}
          className="h-14 rounded-[1.25rem] border-white/10 bg-white/5 text-[15px] font-medium text-white transition focus:border-gold/50 focus:bg-white/10"
        />

        <p className="mt-2 text-xs font-medium text-white/50">
          Auto-filled from your current stay. You may edit this name before submitting.
        </p>
      </div>

      <div className="mb-6 flex h-14 items-center gap-3 rounded-[1.25rem] border border-white/10 bg-white/5 px-5 transition focus-within:border-gold/50 focus-within:bg-white/10">
        <Search className="size-5 text-gold" />

        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search services..."
          className="w-full bg-transparent text-[15px] font-medium text-white outline-none placeholder:text-white/40"
        />
      </div>

      <div className="mb-6 flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {categories.map((category) => {
          const active = category === activeCategory;

          return (
            <button
              key={category}
              type="button"
              onClick={() => setActiveCategory(category)}
              className={cn(
                'shrink-0 rounded-[1.25rem] px-5 py-3 text-[13px] font-semibold tracking-wide transition active:scale-[0.98]',
                active ? 'bg-gold text-black shadow-[0_4px_14px_rgba(214,167,56,0.2)]' : 'bg-white/5 text-white/80 hover:bg-white/10'
              )}
            >
              {category}
            </button>
          );
        })}
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
                <h3 className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-gold">
                  {category}
                </h3>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {categoryServices.map((service) => {
                    const Icon = getServiceIcon(service);
                    const badge = getBillingBadge(service);
                    const quantity = getCartQuantity(service.code);

                    return (
                      <button
                        key={service.code}
                        type="button"
                        onClick={() => addService(service.code)}
                        className={cn(
                          'relative flex min-h-[160px] flex-col h-full rounded-[1.5rem] border p-4 text-left transition active:scale-[0.98]',
                          quantity > 0
                            ? 'border-gold/50 bg-gold/10 shadow-[0_8px_20px_rgba(214,167,56,0.1)]'
                            : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                        )}
                      >
                        <span
                          className={`absolute right-3 top-3 rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-widest ${badge.className}`}
                        >
                          {badge.label}
                        </span>

                        {quantity > 0 ? (
                          <span className="absolute left-3 top-3 grid size-7 place-items-center rounded-full bg-gold text-[11px] font-bold text-black shadow-sm">
                            {quantity}
                          </span>
                        ) : null}

                        <div className="mt-8 grid place-items-center text-white/80">
                          <Icon className="size-8" strokeWidth={1.5} />
                        </div>

                        <p className="mt-4 w-full text-center font-serif text-[15px] sm:text-base font-medium tracking-wide text-white leading-tight text-balance">
                          {service.name}
                        </p>

                        {service.description ? (
                          <p className="mt-2 w-full text-center text-[11px] sm:text-xs font-medium leading-relaxed text-white/60 text-balance">
                            {service.description}
                          </p>
                        ) : null}

                        <div className="mt-auto w-full pt-4 flex justify-center">
                          <span className={cn(
                            "grid size-9 place-items-center rounded-full transition",
                            quantity > 0 ? "bg-gold text-black" : "bg-white/10 text-white"
                          )}>
                            <Plus className="size-4" strokeWidth={2} />
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}

        {!filteredServices.length ? (
          <div className="rounded-[2.4rem] border border-white/10 bg-white/[0.03] p-8 text-center backdrop-blur-sm">
            <ConciergeBell className="mx-auto size-10 text-white/30" strokeWidth={1.5} />
            <h3 className="mt-5 font-serif text-xl font-normal tracking-wide text-white">No services found</h3>
            <p className="mt-2 text-[15px] font-medium text-white/50">
              Try another category or search term.
            </p>
          </div>
        ) : null}
      </div>

      {selectedCount > 0 ? (
        <button
          type="button"
          onClick={() => setScreen('cart')}
          className="fixed inset-x-5 bottom-24 z-30 mx-auto flex max-w-md items-center justify-between rounded-[1.5rem] bg-gold px-6 py-4 font-semibold tracking-wide text-black shadow-[0_16px_40px_rgba(214,167,56,0.3)] transition hover:brightness-110 active:scale-[0.98]"
        >
          <span className="text-[15px]">View Requests ({selectedCount})</span>
          <span className="font-serif text-lg font-medium">
            {fixedPriceTotal > 0 ? money(fixedPriceTotal) : 'Review'}
          </span>
        </button>
      ) : null}

      {selectedCount > 0 ? (
        <button
          type="button"
          onClick={clearCart}
          className="fixed bottom-44 right-5 z-30 grid size-12 place-items-center rounded-full bg-red-600/90 text-white shadow-[0_8px_20px_rgba(220,38,38,0.3)] backdrop-blur transition hover:bg-red-500 active:scale-95"
          aria-label="Clear selected requests"
        >
          <Trash2 className="size-5" />
        </button>
      ) : null}
    </div>
  );
}