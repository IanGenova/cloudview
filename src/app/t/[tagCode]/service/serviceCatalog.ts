export type ServiceBillingMode =
  | 'FREE'
  | 'FIXED_PRICE'
  | 'PRICE_ON_CONFIRMATION';

export type ServiceCatalogItem = {
  code: string;
  type: string;
  group: string;
  iconKey: string;
  billingMode: ServiceBillingMode;
  unitPrice: number;
  unitLabel?: string;
  description: string;
};

export const SERVICE_GROUPS: {
  group: string;
  items: ServiceCatalogItem[];
}[] = [
  {
    group: 'Housekeeping',
    items: [
      {
        code: 'EXTRA_TOWELS',
        type: 'Extra Towels',
        group: 'Housekeeping',
        iconKey: 'Waves',
        billingMode: 'FIXED_PRICE',
        unitPrice: 50,
        unitLabel: 'per set',
        description: 'Extra towel set delivered to your room.',
      },
      {
        code: 'ROOM_CLEANING',
        type: 'Room Cleaning',
        group: 'Housekeeping',
        iconKey: 'Sparkles',
        billingMode: 'FREE',
        unitPrice: 0,
        description: 'Standard room cleaning request.',
      },
      {
        code: 'LAUNDRY',
        type: 'Laundry',
        group: 'Housekeeping',
        iconKey: 'Shirt',
        billingMode: 'PRICE_ON_CONFIRMATION',
        unitPrice: 0,
        description: 'Laundry service. Final price depends on item count.',
      },
    ],
  },
  {
    group: 'Room Assistance',
    items: [
      {
        code: 'MAINTENANCE',
        type: 'Maintenance',
        group: 'Room Assistance',
        iconKey: 'Hammer',
        billingMode: 'FREE',
        unitPrice: 0,
        description: 'Report an issue inside the room.',
      },
      {
        code: 'EXTRA_AMENITIES',
        type: 'Extra Amenities',
        group: 'Room Assistance',
        iconKey: 'PackagePlus',
        billingMode: 'FIXED_PRICE',
        unitPrice: 80,
        unitLabel: 'per set',
        description: 'Extra room amenities delivered to your room.',
      },
      {
        code: 'BABY_COT',
        type: 'Baby Cot',
        group: 'Room Assistance',
        iconKey: 'Baby',
        billingMode: 'FIXED_PRICE',
        unitPrice: 300,
        unitLabel: 'per night',
        description: 'Baby cot setup in the room.',
      },
    ],
  },
  {
    group: 'Concierge',
    items: [
      {
        code: 'AIRPORT_TRANSFER',
        type: 'Airport Transfer',
        group: 'Concierge',
        iconKey: 'Car',
        billingMode: 'PRICE_ON_CONFIRMATION',
        unitPrice: 0,
        description:
          'Airport transfer request. Price will be confirmed by staff.',
      },
      {
        code: 'TOILETRIES',
        type: 'Toiletries',
        group: 'Concierge',
        iconKey: 'SprayCan',
        billingMode: 'FIXED_PRICE',
        unitPrice: 50,
        unitLabel: 'per set',
        description: 'Additional toiletries delivered to your room.',
      },
      {
        code: 'LATE_CHECKOUT',
        type: 'Late Checkout',
        group: 'Concierge',
        iconKey: 'Clock',
        billingMode: 'PRICE_ON_CONFIRMATION',
        unitPrice: 0,
        description:
          'Late checkout request subject to availability and confirmation.',
      },
    ],
  },
  {
    group: 'Essentials',
    items: [
      {
        code: 'WATER_REFILL',
        type: 'Water refill',
        group: 'Essentials',
        iconKey: 'Droplets',
        billingMode: 'FREE',
        unitPrice: 0,
        description: 'Water refill request.',
      },
      {
        code: 'EXTRA_PILLOW',
        type: 'Extra pillow',
        group: 'Essentials',
        iconKey: 'BedDouble',
        billingMode: 'FIXED_PRICE',
        unitPrice: 75,
        unitLabel: 'per pillow',
        description: 'Extra pillow delivered to your room.',
      },
      {
        code: 'OTHER_REQUEST',
        type: 'Other request',
        group: 'Essentials',
        iconKey: 'ConciergeBell',
        billingMode: 'PRICE_ON_CONFIRMATION',
        unitPrice: 0,
        description: 'Custom request. Staff will review and confirm details.',
      },
    ],
  },
];

export const SERVICE_ITEMS = SERVICE_GROUPS.flatMap((group) => group.items);

export function getServiceCatalogItem(code: string) {
  return SERVICE_ITEMS.find((item) => item.code === code);
}