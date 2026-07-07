import { DashboardModule, Role } from '@prisma/client';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { db } from '@/lib/db';
import { requireDashboardPermission } from '@/lib/dashboard-permissions';
import { ServicesModuleClient } from './ServicesModuleClient';

function getMessage(error?: string, success?: string) {
  if (success) {
    const messages: Record<string, string> = {
      created: 'Service item created successfully.',
      updated: 'Service item updated successfully.',
      deleted: 'Service item deleted successfully.',
      seeded: 'Default service items added successfully.',
    };

    return {
      type: 'success' as const,
      text: messages[success] ?? 'Action completed successfully.',
    };
  }

  if (error) {
    const messages: Record<string, string> = {
      'hotel-required': 'Hotel is required.',
      'name-required': 'Service name is required.',
      'category-required': 'Category is required.',
      'billing-mode-required': 'Billing mode is required.',
      'unit-price-invalid': 'Unit price must be a valid amount.',
      'unit-price-required':
        'Fixed-price add-ons require a unit price greater than zero.',
      'code-required': 'Service code is required.',
      'item-required': 'Service item is required.',
      'item-not-found': 'Service item was not found.',
    };

    return {
      type: 'error' as const,
      text: messages[error] ?? 'Something went wrong.',
    };
  }

  return null;
}

export default async function ServicesModulePage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    success?: string;
  }>;
}) {
  const { error, success } = await searchParams;

  const user = await requireDashboardPermission(
    DashboardModule.SERVICES_MODULE,
    'canView'
  );

  const message = getMessage(error, success);

  const [hotels, services] = await Promise.all([
    user.role === Role.SUPER_ADMIN
      ? db.hotel.findMany({
          select: {
            id: true,
            name: true,
          },
          orderBy: {
            name: 'asc',
          },
        })
      : db.hotel.findMany({
          where: {
            id: user.hotelId!,
          },
          select: {
            id: true,
            name: true,
          },
        }),

    db.serviceCatalogItem.findMany({
      where:
        user.role === Role.SUPER_ADMIN
          ? {}
          : {
              hotelId: user.hotelId!,
            },
      include: {
        hotel: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [
        {
          hotel: {
            name: 'asc',
          },
        },
        {
          sortOrder: 'asc',
        },
        {
          category: 'asc',
        },
        {
          name: 'asc',
        },
      ],
    }),
  ]);

  const defaultHotelId =
    user.role === Role.SUPER_ADMIN ? hotels[0]?.id ?? '' : user.hotelId!;

  return (
    <div>
      <PageHeader
        title="Services Module"
        description="Manage the services and room add-ons shown in the Guest Portal."
      />

      <ServicesModuleClient
        hotels={hotels}
        services={services.map((service) => ({
          id: service.id,
          hotelId: service.hotelId,
          hotelName: service.hotel.name,
          name: service.name,
          code: service.code,
          category: service.category,
          description: service.description ?? '',
          iconKey: service.iconKey,
          billingMode: service.billingMode,
          unitPrice: Number(service.unitPrice),
          unitLabel: service.unitLabel ?? '',
          isActive: service.isActive,
          sortOrder: service.sortOrder,
        }))}
        message={message}
        defaultHotelId={defaultHotelId}
        canChangeHotel={user.role === Role.SUPER_ADMIN}
      />
    </div>
  );
}
