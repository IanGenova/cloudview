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
      className: 'bg-emerald-100 text-emerald-700',
    };
  }

  if (service.billingMode === 'PRICE_ON_CONFIRMATION') {
    return {
      label: 'CONFIRM',
      className: 'bg-amber-100 text-amber-700',
    };
  }

  return {
    label: moneyFormatter.format(service.unitPrice),
    className: 'bg-gold/20 text-ink',
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
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [confirmed, setConfirmed] = useState(false);

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
    const quantity = quantities[service.code] ?? 1;

    return sum + service.unitPrice * quantity;
  }, 0);

  const errorMessage = getErrorMessage(error);
  const successMessage = getSuccessMessage(success, count);

  function toggleService(code: string) {
    setSelectedCodes((currentCodes) => {
      const isSelected = currentCodes.includes(code);

      if (isSelected) {
        setQuantities((currentQuantities) => {
          const nextQuantities = { ...currentQuantities };

          delete nextQuantities[code];

          return nextQuantities;
        });

        return currentCodes.filter((currentCode) => currentCode !== code);
      }

      setQuantities((currentQuantities) => ({
        ...currentQuantities,
        [code]: 1,
      }));

      return [...currentCodes, code];
    });

    setConfirmed(false);
  }

  function updateQuantity(code: string, value: number) {
    if (!Number.isInteger(value) || value < 1) {
      setQuantities((currentQuantities) => ({
        ...currentQuantities,
        [code]: 1,
      }));

      return;
    }

    setQuantities((currentQuantities) => ({
      ...currentQuantities,
      [code]: Math.min(value, 20),
    }));
  }

  return (
    <form action={createServiceRequestAction} className="space-y-6">
      <input type="hidden" name="tagCode" value={tagCode} />

      {selectedServices.map((service) => (
        <div key={service.code}>
          <input type="hidden" name="serviceCodes" value={service.code} />
          <input
            type="hidden"
            name={`quantity_${service.code}`}
            value={quantities[service.code] ?? 1}
          />
        </div>
      ))}

      {errorMessage ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
          {successMessage}
        </div>
      ) : null}

      <Input
        name="guestName"
        placeholder="Guest name optional"
        className="bg-white"
      />

      {services.length ? (
        groupedServices.map((group) => (
          <section key={group.category}>
            <h2 className="mb-3 text-sm font-black text-neutral-700">
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
                        ? 'relative grid min-h-[112px] place-items-center rounded-2xl bg-ink p-3 text-center text-xs font-black text-white shadow-sm ring-2 ring-gold'
                        : 'relative grid min-h-[112px] place-items-center rounded-2xl bg-white p-3 text-center text-xs font-black text-ink shadow-sm ring-2 ring-transparent transition hover:ring-gold/60'
                    }
                  >
                    <span
                      className={`absolute right-2 top-2 rounded-full px-2 py-1 text-[9px] font-black ${
                        isSelected ? 'bg-white/15 text-white' : badge.className
                      }`}
                    >
                      {badge.label}
                    </span>

                    <span>
                      <Icon className="mx-auto mb-2 size-6" />
                      {service.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))
      ) : (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm font-bold text-amber-800">
          No services are available yet. Please contact the front desk.
        </div>
      )}

      <div className="rounded-[2rem] bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase text-neutral-400">
              Selected Requests
            </p>

            <h3 className="mt-1 text-xl font-black text-ink">
              {selectedServices.length
                ? `${selectedServices.length} selected`
                : 'No service selected'}
            </h3>

            <p className="mt-1 text-sm text-neutral-500">
              You may select multiple services before submitting.
            </p>
          </div>

          {selectedServices.length ? (
            <span className="rounded-full bg-ink px-3 py-1 text-xs font-black text-white">
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

              const quantity = quantities[service.code] ?? 1;
              const lineTotal = service.unitPrice * quantity;

              return (
                <div
                  key={service.code}
                  className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black text-ink">{service.name}</p>

                      {service.description ? (
                        <p className="mt-1 text-xs text-neutral-500">
                          {service.description}
                        </p>
                      ) : null}
                    </div>

                    <span
                      className={
                        isFree
                          ? 'rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-black text-emerald-700'
                          : needsConfirmation
                            ? 'rounded-full bg-amber-100 px-3 py-1 text-[10px] font-black text-amber-700'
                            : 'rounded-full bg-gold/20 px-3 py-1 text-[10px] font-black text-ink'
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
                        <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
                          Qty
                        </label>

                        <input
                          type="number"
                          min="1"
                          max="20"
                          step="1"
                          value={quantity}
                          onChange={(event) =>
                            updateQuantity(
                              service.code,
                              Number(event.target.value)
                            )
                          }
                          className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
                          Line Total
                        </label>

                        <div className="flex h-11 items-center rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-black text-ink">
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
          <div className="mt-5 rounded-2xl bg-neutral-50 p-4 text-sm font-bold text-neutral-500">
            Select one or more services above.
          </div>
        )}

        {hasFixedPrice ? (
          <div className="mt-5 rounded-2xl border border-gold/30 bg-gold/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-black text-ink">Total Room Add-ons</p>

              <p className="text-xl font-black text-ink">
                {moneyFormatter.format(total)}
              </p>
            </div>

            <label className="mt-4 flex items-start gap-3 text-sm font-bold text-amber-900">
              <input
                type="checkbox"
                name="chargeConsent"
                value="true"
                required
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
                className="mt-1 size-4"
              />

              <span>
                I understand that {moneyFormatter.format(total)} will be
                charged to {roomLabel}.
              </span>
            </label>
          </div>
        ) : null}

        {confirmationServices.length ? (
          <div className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm font-bold text-amber-800">
            Some selected services require staff confirmation before billing.
          </div>
        ) : null}

        {freeServices.length &&
        !hasFixedPrice &&
        !confirmationServices.length ? (
          <div className="mt-5 rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
            Selected services are complimentary and will not be added to your
            room bill.
          </div>
        ) : null}
      </div>

      <Textarea
        name="notes"
        placeholder="Add notes, exact need, or urgency"
        className="bg-white"
      />

      <Button
        size="lg"
        disabled={!selectedServices.length}
        className="w-full bg-sand text-ink hover:bg-gold disabled:cursor-not-allowed disabled:opacity-50"
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