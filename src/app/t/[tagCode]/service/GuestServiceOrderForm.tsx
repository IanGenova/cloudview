'use client';

import { useMemo, useState } from 'react';
import {
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
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
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
    label: moneyFormatter.format(service.unitPrice),
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
    quantity_required: 'Please enter a valid quantity.',
    consent_required:
      'Please confirm that the paid add-on will be charged to your room.',
    request_failed: 'Unable to submit your requests. Please try again.',
    payment_cancelled:
      'Payment was cancelled. Your request was not marked as paid.',
    payment_failed: 'Unable to start payment checkout. Please try again.',
  };

  return messages[error] ?? 'Unable to submit your requests. Please try again.';
}

function getSuccessMessage(success?: string, count?: string) {
  if (!success) {
    return null;
  }

  const requestCount = Number(count || 0);
  const label =
    requestCount > 1 ? `${requestCount} requests were` : 'Your request was';

  if (success === 'charged') {
    return `${label} submitted and paid add-ons were added to your room bill.`;
  }

  if (success === 'confirmation') {
    return `${label} submitted. Staff will confirm the price/details shortly.`;
  }

  if (success === 'mixed') {
    return `${label} submitted. Some items were added to your room bill, while others require staff confirmation.`;
  }

  return `${label} submitted successfully.`;
}

export function GuestServiceOrderForm({
  tagCode,
  roomLabel,
  services,
  error,
  success,
  count,
}: {
  tagCode: string;
  roomLabel: string;
  services: GuestServiceItem[];
  error?: string;
  success?: string;
  count?: string;
}) {
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [quantityInputs, setQuantityInputs] = useState<Record<string, string>>(
    {}
  );
  const [confirmed, setConfirmed] = useState(false);

  function normalizeQuantity(rawValue?: string) {
    const quantity = Number(rawValue);

    if (!Number.isInteger(quantity) || quantity < 1) {
      return 1;
    }

    return Math.min(quantity, 20);
  }

  function getQuantity(code: string) {
    return normalizeQuantity(quantityInputs[code] ?? '1');
  }

  function updateQuantityInput(code: string, rawValue: string) {
    const digitsOnly = rawValue.replace(/[^\d]/g, '');

    setConfirmed(false);

    if (!digitsOnly) {
      setQuantityInputs((current) => ({
        ...current,
        [code]: '',
      }));

      return;
    }

    const nextQuantity = Math.min(Number(digitsOnly), 20);

    setQuantityInputs((current) => ({
      ...current,
      [code]: String(nextQuantity),
    }));
  }

  function normalizeQuantityOnBlur(code: string) {
    setQuantityInputs((current) => ({
      ...current,
      [code]: String(normalizeQuantity(current[code])),
    }));
  }

  function toggleService(code: string) {
    setSelectedCodes((currentCodes) => {
      const isSelected = currentCodes.includes(code);

      if (isSelected) {
        setQuantityInputs((currentQuantities) => {
          const nextQuantities = { ...currentQuantities };

          delete nextQuantities[code];

          return nextQuantities;
        });

        return currentCodes.filter((currentCode) => currentCode !== code);
      }

      setQuantityInputs((currentQuantities) => ({
        ...currentQuantities,
        [code]: '1',
      }));

      return [...currentCodes, code];
    });

    setConfirmed(false);
  }

  const groupedServices = useMemo(() => {
    const groups = new Map<string, GuestServiceItem[]>();

    for (const service of services) {
      const existingItems = groups.get(service.category) ?? [];

      existingItems.push(service);
      groups.set(service.category, existingItems);
    }

    return Array.from(groups.entries()).map(([category, items]) => ({
      category,
      items: items.sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) {
          return a.sortOrder - b.sortOrder;
        }

        return a.name.localeCompare(b.name);
      }),
    }));
  }, [services]);

  const selectedServices = useMemo(
    () => services.filter((service) => selectedCodes.includes(service.code)),
    [services, selectedCodes]
  );

  const fixedPriceServices = selectedServices.filter(
    (service) => service.billingMode === 'FIXED_PRICE'
  );

  const confirmationServices = selectedServices.filter(
    (service) => service.billingMode === 'PRICE_ON_CONFIRMATION'
  );

  const freeServices = selectedServices.filter(
    (service) => service.billingMode === 'FREE'
  );

  const hasFixedPrice = fixedPriceServices.length > 0;

  const total = fixedPriceServices.reduce((sum, service) => {
    const quantity = getQuantity(service.code);

    return sum + service.unitPrice * quantity;
  }, 0);

  const errorMessage = getErrorMessage(error);
  const successMessage = getSuccessMessage(success, count);

  return (
    <form
      action={createServiceRequestAction}
      className="-mx-5 -mt-4 min-h-screen space-y-6 bg-[radial-gradient(circle_at_top,_rgba(184,137,56,0.20),_transparent_35%),linear-gradient(180deg,#050505,#0b0b0b_45%,#050505)] px-5 pb-32 pt-5 text-white"
    >
      <input type="hidden" name="tagCode" value={tagCode} />

      {selectedServices.map((service) => (
        <div key={service.code}>
          <input type="hidden" name="serviceCodes" value={service.code} />
          <input
            type="hidden"
            name={`quantity_${service.code}`}
            value={getQuantity(service.code)}
          />
        </div>
      ))}

      {errorMessage ? (
        <div className="rounded-3xl border border-red-400/20 bg-red-500/10 p-4 text-sm font-bold text-red-200">
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-200">
          {successMessage}
        </div>
      ) : null}

      <div>
  <label className="mb-2 block text-xs font-black uppercase tracking-wide text-sand">
    Guest Name
  </label>

  <Input
    name="guestName"
    placeholder="Guest name optional"
    className="h-12 rounded-2xl border border-gold/20 bg-white text-ink placeholder:text-neutral-400 focus:border-gold focus:ring-gold"
  />
</div>

      {services.length ? (
        groupedServices.map((group) => (
          <section key={group.category}>
            <h2 className="mb-3 text-sm font-black uppercase tracking-wide text-sand">
              {group.category}
            </h2>

            <div className="grid grid-cols-3 gap-3">
              {group.items.map((service) => {
                const Icon = iconMap[service.iconKey] ?? ConciergeBell;
                const badge = getBillingBadge(service);
                const isSelected = selectedCodes.includes(service.code);

                return (
                  <button
                    key={service.id}
                    type="button"
                    onClick={() => toggleService(service.code)}
                    className={
                      isSelected
                        ? 'relative grid min-h-[112px] place-items-center rounded-2xl border border-gold bg-gold/15 p-3 text-center text-xs font-black text-white shadow-[0_0_30px_rgba(184,137,56,0.25)] ring-1 ring-gold'
                        : 'relative grid min-h-[112px] place-items-center rounded-2xl border border-white/10 bg-white/8 p-3 text-center text-xs font-black text-white shadow-sm transition hover:border-gold/70 hover:bg-gold/10'
                    }
                  >
                    <span
                      className={`absolute right-2 top-2 rounded-full border px-2 py-1 text-[9px] font-black ${badge.className}`}
                    >
                      {badge.label}
                    </span>

                    <span>
                      <Icon
                        className={
                          isSelected
                            ? 'mx-auto mb-2 size-6 text-gold'
                            : 'mx-auto mb-2 size-6 text-white/85'
                        }
                      />
                      {service.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))
      ) : (
        <div className="rounded-3xl border border-gold/20 bg-gold/10 p-5 text-sm font-bold text-sand">
          No services are available yet. Please contact the front desk.
        </div>
      )}

      <div className="rounded-[2rem] border border-white/10 bg-white/8 p-5 shadow-2xl backdrop-blur">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-gold">
              Selected Requests
            </p>

            <h3 className="mt-1 text-xl font-black text-white">
              {selectedServices.length
                ? `${selectedServices.length} selected`
                : 'No service selected'}
            </h3>

            <p className="mt-1 text-sm text-white/45">
              You may select multiple services before submitting.
            </p>
          </div>

          {selectedServices.length ? (
            <span className="rounded-full bg-gold px-3 py-1 text-xs font-black text-black">
              {selectedServices.length}
            </span>
          ) : null}
        </div>

        {selectedServices.length ? (
          <div className="mt-5 space-y-3">
            {selectedServices.map((service) => {
              const isFixedPrice = service.billingMode === 'FIXED_PRICE';
              const isFree = service.billingMode === 'FREE';
              const needsConfirmation =
                service.billingMode === 'PRICE_ON_CONFIRMATION';

              const quantity = getQuantity(service.code);
              const quantityInputValue = quantityInputs[service.code] ?? '1';
              const lineTotal = service.unitPrice * quantity;

              return (
                <div
                  key={service.code}
                  className="rounded-2xl border border-white/10 bg-black/30 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black text-white">{service.name}</p>

                      {service.description ? (
                        <p className="mt-1 text-xs text-white/45">
                          {service.description}
                        </p>
                      ) : null}
                    </div>

                    <span
                      className={
                        isFree
                          ? 'rounded-full border border-emerald-400/20 bg-emerald-400/15 px-3 py-1 text-[10px] font-black text-emerald-300'
                          : needsConfirmation
                            ? 'rounded-full border border-gold/25 bg-gold/15 px-3 py-1 text-[10px] font-black text-gold'
                            : 'rounded-full border border-sand/25 bg-sand/15 px-3 py-1 text-[10px] font-black text-sand'
                      }
                    >
                      {isFree
                        ? 'FREE'
                        : needsConfirmation
                          ? 'CONFIRM PRICE'
                          : `${moneyFormatter.format(service.unitPrice)} ${
                              service.unitLabel || ''
                            }`}
                    </span>
                  </div>

                  {isFixedPrice ? (
                    <div className="mt-4 grid grid-cols-[120px_1fr] gap-3">
                      <div>
                        <label className="mb-1 block text-xs font-black uppercase text-white/45">
                          Qty
                        </label>

                        <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={quantityInputValue}
                              onFocus={(event) => {
                                event.currentTarget.select();
                              }}
                              onMouseUp={(event) => {
                                event.preventDefault();
                              }}
                              onChange={(event) => {
                                updateQuantityInput(service.code, event.target.value);
                              }}
                              onBlur={() => {
                                normalizeQuantityOnBlur(service.code);
                              }}
                              className="h-11 w-full rounded-2xl border border-gold/40 bg-white px-4 text-base font-black text-black caret-black outline-none selection:bg-gold selection:text-black focus:border-gold focus:ring-2 focus:ring-gold/30"
                            />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-black uppercase text-white/45">
                          Line Total
                        </label>

                        <div className="flex h-11 items-center rounded-2xl border border-white/10 bg-white/8 px-4 text-sm font-black text-sand">
                          {moneyFormatter.format(lineTotal)}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl bg-white/5 p-4 text-sm font-bold text-white/45">
            Select one or more services above.
          </div>
        )}

        {hasFixedPrice ? (
          <div className="mt-5 rounded-2xl border border-gold/30 bg-gold/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-black text-white">
                Total Room Add-ons
              </p>

              <p className="text-xl font-black text-sand">
                {moneyFormatter.format(total)}
              </p>
            </div>

            <label className="mt-4 flex items-start gap-3 text-sm font-bold text-sand">
              <input
                type="checkbox"
                name="chargeConsent"
                value="true"
                required
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
                className="mt-1 size-4 accent-[#B88938]"
              />

              <span>
                I understand that {moneyFormatter.format(total)} will be
                charged to {roomLabel}.
              </span>
            </label>
          </div>
        ) : null}

        {confirmationServices.length ? (
          <div className="mt-5 rounded-2xl border border-gold/20 bg-gold/10 p-4 text-sm font-bold text-sand">
            Some selected services require staff confirmation before billing.
          </div>
        ) : null}

        {freeServices.length &&
        !hasFixedPrice &&
        !confirmationServices.length ? (
          <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-200">
            Selected services are complimentary and will not be added to your
            room bill.
          </div>
        ) : null}
      </div>

              <div>
          <label className="mb-2 block text-xs font-black uppercase tracking-wide text-sand">
            Request Notes
          </label>

          <Textarea
            name="notes"
            placeholder="Add notes, exact need, or urgency"
            className="min-h-28 rounded-2xl border border-gold/20 bg-white text-ink placeholder:text-neutral-400 focus:border-gold focus:ring-gold"
          />
        </div>

      <Button
        size="lg"
        disabled={!selectedServices.length}
        className="w-full rounded-2xl bg-gold text-black shadow-[0_12px_35px_rgba(184,137,56,0.28)] hover:bg-sand disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/35 disabled:shadow-none"
      >
        {selectedServices.length
          ? hasFixedPrice
            ? `Submit & Charge ${moneyFormatter.format(total)}`
            : confirmationServices.length
              ? `Submit ${selectedServices.length} Request${
                  selectedServices.length > 1 ? 's' : ''
                }`
              : `Submit ${selectedServices.length} Free Request${
                  selectedServices.length > 1 ? 's' : ''
                }`
          : 'Select Services'}
      </Button>
    </form>
  );
}