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
      className: 'bg-emerald-400/15 text-emerald-300 border-emerald-400/20',
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
    className: 'bg-sand/15 text-sand border-sand/25',
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
      className="mt-5 w-full bg-ink text-white disabled:cursor-not-allowed disabled:opacity-50"
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

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    setLocalError(null);

    if (!cart.length) {
      event.preventDefault();
      setLocalError('Please add at least one service request.');
      return;
    }

    if (hasFixedPriceItem && !chargeConsent) {
      event.preventDefault();
      setLocalError('Please confirm the room add-on charge before submitting.');
    }
  }

  if (screen === 'cart') {
    return (
      <div className="-mx-5 -mt-3 min-h-[calc(100vh-5rem)] bg-[#f8f3ec] px-5 pb-28 pt-2 text-ink">
        <div className="mb-5 grid grid-cols-[44px_1fr_44px] items-center">
          <button
            type="button"
            onClick={() => setScreen('services')}
            className="grid size-10 place-items-center rounded-full hover:bg-black/5"
            aria-label="Back to services"
          >
            <ArrowLeft className="size-5" />
          </button>

          <div className="text-center">
            <h2 className="font-black">Selected Requests</h2>
            <p className="text-xs text-neutral-500">
              Review services before submitting
            </p>
          </div>

          <div />
        </div>

        {cart.length === 0 ? (
          <div className="grid min-h-[65vh] place-items-center rounded-[2rem] bg-white p-6 text-center shadow-soft">
            <div>
              <div className="mx-auto grid size-16 place-items-center rounded-full bg-neutral-100">
                <ShoppingBag className="size-7" />
              </div>

              <h3 className="mt-4 text-xl font-black">No requests selected</h3>
              <p className="mt-1 text-sm text-neutral-500">
                Add service requests first.
              </p>

              <Button
                type="button"
                onClick={() => setScreen('services')}
                className="mt-5"
              >
                Back to Services
              </Button>
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
              </div>
            ))}

            <div className="rounded-[2rem] bg-white p-4 shadow-soft">
              <div className="space-y-4">
                {selectedServices.map(({ service, quantity }) => {
                  const Icon = getServiceIcon(service);

                  return (
                    <div
                      key={service.code}
                      className="grid grid-cols-[64px_1fr_36px] gap-3 border-b border-neutral-100 pb-4 last:border-b-0"
                    >
                      <div className="grid size-16 place-items-center rounded-2xl bg-neutral-100 text-neutral-700">
                        <Icon className="size-7" />
                      </div>

                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-black leading-tight">
                            {service.name}
                          </h3>

                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${
                              getBillingBadge(service).className
                            }`}
                          >
                            {getBillingBadge(service).label}
                          </span>
                        </div>

                        <p className="mt-1 text-sm font-bold text-neutral-700">
                          {getServicePriceText(service)}
                        </p>

                        {service.description ? (
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-neutral-500">
                            {service.description}
                          </p>
                        ) : null}

                        <div className="mt-3 inline-flex items-center gap-3 rounded-full bg-neutral-50 px-2 py-1">
                          <button
                            type="button"
                            onClick={() =>
                              updateQuantity(service.code, quantity - 1)
                            }
                            className="grid size-8 place-items-center rounded-full hover:bg-white active:scale-95"
                            aria-label={`Decrease ${service.name}`}
                          >
                            <Minus className="size-3" />
                          </button>

                          <span className="min-w-4 text-center text-sm font-black">
                            {quantity}
                          </span>

                          <button
                            type="button"
                            onClick={() =>
                              updateQuantity(service.code, quantity + 1)
                            }
                            className="grid size-8 place-items-center rounded-full hover:bg-white active:scale-95"
                            aria-label={`Increase ${service.name}`}
                          >
                            <Plus className="size-3" />
                          </button>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => updateQuantity(service.code, 0)}
                        className="grid size-10 place-items-center rounded-full text-neutral-400 hover:bg-neutral-100"
                        aria-label={`Remove ${service.name}`}
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-5 rounded-[2rem] bg-white p-4 shadow-soft">
              <h3 className="mb-3 font-black">Request Details</h3>

              <div className="space-y-3">
                <div>
                  <label className="mb-2 block text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
                    Requested By
                  </label>

                  <Input
                    name="guestName"
                    placeholder="Guest name"
                    value={guestName}
                    onChange={(event) => setGuestName(event.target.value)}
                  />

                  <p className="mt-1 text-xs font-semibold text-neutral-400">
                    Auto-filled from the current stay. You may edit this if another guest is making the request.
                  </p>
                </div>

                <Textarea
                  name="notes"
                  placeholder="Special instructions / notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />

                <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-4">
  <div className="flex items-start gap-3">
    <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white text-neutral-700 shadow-sm">
      <ImagePlus className="size-5" />
    </span>

    <div className="min-w-0 flex-1">
      <p className="text-sm font-black text-neutral-900">
        Add Photos
      </p>

      <p className="mt-1 text-xs font-semibold leading-5 text-neutral-500">
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
    className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-neutral-900 px-4 text-sm font-black text-white"
  >
    <Camera className="size-4" />
    Take / Upload Photos
  </button>

  {attachments.length > 0 ? (
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
      {attachments.map((attachment) => (
        <div
          key={attachment.id}
          className="overflow-hidden rounded-2xl border border-neutral-200 bg-white"
        >
          <div className="relative aspect-square bg-neutral-100">
            <img
              src={attachment.url}
              alt={attachment.file.name}
              className="size-full object-cover"
            />

            <button
              type="button"
              onClick={() => removeAttachment(attachment.id)}
              className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-black/70 text-white"
              aria-label={`Remove ${attachment.file.name}`}
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="p-2">
            <p className="truncate text-xs font-black text-neutral-800">
              {attachment.file.name}
            </p>

            <p className="mt-0.5 text-[11px] font-bold text-neutral-400">
              {formatFileSize(attachment.file.size)}
            </p>
          </div>
        </div>
      ))}
    </div>
  ) : (
    <div className="mt-4 flex items-center gap-2 rounded-2xl bg-white p-3 text-xs font-bold text-neutral-500">
      <FileImage className="size-4 text-neutral-400" />
      No photos attached yet.
    </div>
  )}
</div>

                {hasFixedPriceItem ? (
                  <label className="flex items-start gap-3 rounded-2xl bg-amber-50 p-4 text-sm font-bold text-amber-800">
                    <input
                      name="chargeConsent"
                      value="true"
                      type="checkbox"
                      checked={chargeConsent}
                      onChange={(event) =>
                        setChargeConsent(event.target.checked)
                      }
                      className="mt-1 size-4"
                    />

                    <span>
                      I confirm the selected paid room add-ons may be charged to
                      this room. Total paid add-ons:{' '}
                      <b>{money(fixedPriceTotal)}</b>.
                    </span>
                  </label>
                ) : null}

                {hasConfirmationItem ? (
                  <div className="rounded-2xl bg-gold/10 p-4 text-sm font-bold text-amber-800">
                    Some selected services require staff confirmation before
                    pricing or completion.
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-5 rounded-[2rem] bg-white p-4 shadow-soft">
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Selected requests</span>
                  <b>{selectedCount}</b>
                </div>

                <div className="flex justify-between">
                  <span className="text-neutral-500">Paid add-ons</span>
                  <b>{money(fixedPriceTotal)}</b>
                </div>

                <div className="border-t border-neutral-100 pt-4 text-base">
                  <div className="flex justify-between">
                    <span className="font-black">Room / Location</span>
                    <span className="font-black">{roomLabel}</span>
                  </div>
                </div>
              </div>

              {visibleError ? (
                <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">
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
    <div className="-mx-5 -mt-3 min-h-[calc(100vh-5rem)] bg-black px-5 pb-28 pt-2 text-white">
      {successMessage ? (
        <div className="mb-4 rounded-[1.5rem] border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm font-bold text-emerald-200">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
            <p>{successMessage}</p>
          </div>
        </div>
      ) : null}

      {visibleError ? (
        <div className="mb-4 rounded-[1.5rem] border border-red-400/20 bg-red-500/10 p-4 text-sm font-bold text-red-200">
          {visibleError}
        </div>
      ) : null}

      <div className="mb-4">
          <label className="mb-2 block text-xs font-black uppercase tracking-[0.16em] text-sand">
            Requested By
          </label>

          <Input
            placeholder="Guest name"
            value={guestName}
            onChange={(event) => setGuestName(event.target.value)}
            className="h-14 rounded-2xl border-white/10 bg-white text-ink"
          />

          <p className="mt-1 text-xs font-semibold text-white/45">
            Auto-filled from your current stay. You may edit this name before submitting.
          </p>
        </div>

      <div className="mb-4 flex h-12 items-center gap-3 rounded-2xl bg-white/10 px-4">
        <Search className="size-5 text-white/40" />

        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search services..."
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

      <div className="space-y-6">
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
                <h3 className="mb-3 text-sm font-black uppercase tracking-[0.12em] text-sand">
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
                          'relative min-h-36 rounded-[1.35rem] border p-4 text-left transition active:scale-[0.98]',
                          quantity > 0
                            ? 'border-gold bg-gold/10'
                            : 'border-white/10 bg-white/5 hover:bg-white/10'
                        )}
                      >
                        <span
                          className={`absolute right-3 top-3 rounded-full border px-2.5 py-1 text-[10px] font-black ${badge.className}`}
                        >
                          {badge.label}
                        </span>

                        {quantity > 0 ? (
                          <span className="absolute left-3 top-3 grid size-6 place-items-center rounded-full bg-gold text-xs font-black text-black">
                            {quantity}
                          </span>
                        ) : null}

                        <div className="mt-7 grid place-items-center text-white/85">
                          <Icon className="size-8" />
                        </div>

                        <p className="mt-3 text-center text-sm font-black leading-tight">
                          {service.name}
                        </p>

                        {service.description ? (
                          <p className="mt-2 line-clamp-2 text-center text-[11px] leading-4 text-white/40">
                            {service.description}
                          </p>
                        ) : null}

                        <div className="mt-3 flex justify-center">
                          <span className="grid size-9 place-items-center rounded-full bg-white text-black">
                            <Plus className="size-4" />
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
          <div className="rounded-[2rem] border border-white/10 bg-white/5 p-8 text-center">
            <ConciergeBell className="mx-auto size-8 text-white/40" />
            <h3 className="mt-3 font-black">No services found</h3>
            <p className="mt-1 text-sm text-white/45">
              Try another category or search term.
            </p>
          </div>
        ) : null}
      </div>

      {selectedCount > 0 ? (
        <button
          type="button"
          onClick={() => setScreen('cart')}
          className="fixed inset-x-5 bottom-24 z-30 mx-auto flex max-w-md items-center justify-between rounded-2xl bg-gold px-5 py-4 font-black text-ink shadow-xl"
        >
          <span>View Requests ({selectedCount})</span>
          <span>
            {fixedPriceTotal > 0 ? money(fixedPriceTotal) : 'Review'}
          </span>
        </button>
      ) : null}

      {selectedCount > 0 ? (
        <button
          type="button"
          onClick={clearCart}
          className="fixed bottom-44 right-5 z-30 grid size-11 place-items-center rounded-full bg-red-600 text-white shadow-xl"
          aria-label="Clear selected requests"
        >
          <Trash2 className="size-5" />
        </button>
      ) : null}
    </div>
  );
}