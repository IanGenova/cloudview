import { ServiceRequestStatus } from '@prisma/client';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { updateServiceRequestAction } from './actions';

const moneyFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
});

export default async function ServiceRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
  }>;
}) {
  const { error } = await searchParams;
  const user = await requireUser();

  const where = user.role === 'SUPER_ADMIN' ? {} : { hotelId: user.hotelId! };

  const requests = await db.serviceRequest.findMany({
    where,
    include: {
      hotel: true,
      room: true,
      location: true,
      assignedTo: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 60,
  });

  const requestIds = requests.map((request) => request.id);

  const [staff, charges] = await Promise.all([
    db.user.findMany({
      where:
        user.role === 'SUPER_ADMIN'
          ? {
              role: {
                in: ['STAFF', 'HOTEL_ADMIN'],
              },
            }
          : {
              hotelId: user.hotelId!,
              role: {
                in: ['STAFF', 'HOTEL_ADMIN'],
              },
            },
      orderBy: {
        name: 'asc',
      },
    }),

    requestIds.length
      ? db.roomAddOnCharge.findMany({
          where: {
            serviceRequestId: {
              in: requestIds,
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        })
      : [],
  ]);

  const chargesByRequestId = new Map(
    charges.map((charge) => [charge.serviceRequestId, charge])
  );

  const billedRequests = requests.filter((request) =>
    chargesByRequestId.has(request.id)
  );

  const notBilledRequests = requests.filter(
    (request) => !chargesByRequestId.has(request.id)
  );

  const totalBilledAmount = charges.reduce(
    (sum, charge) => sum + Number(charge.totalAmount),
    0
  );

  return (
    <div>
      <PageHeader
        title="Service Requests & Room Add-ons"
        description="Manage guest requests, assign staff, and post billable add-ons directly to the guest room."
      />
      {error ? (
              <div className="mb-5 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
                {error === 'unit-price-required'
                  ? 'Unit price is required when marking a request as billable.'
                  : error === 'quantity-required'
                    ? 'Quantity is required when marking a request as billable.'
                    : error === 'item-required'
                      ? 'Add-on item name is required when marking a request as billable.'
                      : error === 'no-room'
                        ? 'This request cannot be billed because it is not linked to a room.'
                        : error === 'request-not-found'
                          ? 'Service request was not found.'
                          : 'Invalid service request update.'}
              </div>
            ) : null}

      <div className="mb-5 grid gap-3 md:grid-cols-4">
        <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-neutral-500">Total Requests</p>
          <p className="mt-2 text-3xl font-black text-neutral-950">
            {requests.length}
          </p>
        </div>

        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <p className="text-sm font-bold text-emerald-700">Billed Requests</p>
          <p className="mt-2 text-3xl font-black text-emerald-900">
            {billedRequests.length}
          </p>
        </div>

        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <p className="text-sm font-bold text-amber-700">Not Billed Requests</p>
          <p className="mt-2 text-3xl font-black text-amber-900">
            {notBilledRequests.length}
          </p>
        </div>

        <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-neutral-500">
            Total Billed Amount
          </p>
          <p className="mt-2 text-3xl font-black text-neutral-950">
            {moneyFormatter.format(totalBilledAmount)}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {requests.map((request) => {
          const charge = chargesByRequestId.get(request.id);
          const hasRoom = Boolean(request.roomId);
          const isBilled = Boolean(charge);

          return (
            <Card key={request.id}>
              <CardContent className="grid gap-5 xl:grid-cols-[1fr_560px] xl:items-start">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-xl font-black">
                      {request.requestCode}
                    </h3>

                    <StatusBadge status={request.status} />

                    {isBilled ? (
                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">
                        BILLED
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-700">
                        NOT BILLED
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-neutral-500">
                    {request.hotel.name} ·{' '}
                    {request.room
                      ? `Room ${request.room.number}`
                      : request.location?.name || 'Guest location'}{' '}
                    · {request.createdAt.toLocaleString()}
                  </p>

                  <p className="mt-3 font-bold">{request.type}</p>

                  {request.notes ? (
                    <p className="text-neutral-600">{request.notes}</p>
                  ) : null}

                  <p className="mt-2 text-sm text-neutral-500">
                    Assigned: {request.assignedTo?.name ?? 'Unassigned'}
                  </p>

                  {!hasRoom ? (
                    <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                      This request is not linked to a room. It cannot be charged
                      as a room add-on.
                    </p>
                  ) : null}

                  {charge ? (
                    <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
                      <p className="font-black text-emerald-800">
                        Room Add-on Charge
                      </p>

                      <p className="mt-1 text-xs font-bold text-emerald-700">
                        Charge Code: {charge.chargeCode}
                      </p>

                      <p className="mt-2 text-emerald-700">
                        {charge.itemName} · Qty {charge.quantity} ·{' '}
                        {moneyFormatter.format(Number(charge.unitPrice))} each
                      </p>

                      <p className="mt-1 font-black text-emerald-900">
                        Total:{' '}
                        {moneyFormatter.format(Number(charge.totalAmount))}
                      </p>

                      <p className="mt-1 text-xs font-bold text-emerald-700">
                        Payment Status: {charge.paymentStatus}
                      </p>
                    </div>
                  ) : hasRoom ? (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">
                      <p className="font-black text-amber-800">
                        Not yet billed to room
                      </p>

                      <p className="mt-1 text-amber-700">
                        This request has no room add-on charge yet. Mark it as
                        billable if this should be added to the room bill.
                      </p>
                    </div>
                  ) : null}
                </div>

                <form
                  action={updateServiceRequestAction}
                  className="rounded-[1.5rem] border border-neutral-200 bg-neutral-50 p-4"
                >
                  <input type="hidden" name="requestId" value={request.id} />

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
                        Request Status
                      </label>

                      <Select name="status" defaultValue={request.status}>
                        {Object.values(ServiceRequestStatus).map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </Select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
                        Assigned Staff
                      </label>

                      <Select
                        name="assignedToId"
                        defaultValue={request.assignedToId ?? ''}
                      >
                        <option value="">Unassigned</option>

                        {staff.map((staffMember) => (
                          <option key={staffMember.id} value={staffMember.id}>
                            {staffMember.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>

                  <div className="mt-3">
                    <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
                      Staff Note
                    </label>

                    <input
                      name="note"
                      placeholder="Optional internal update note"
                      className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400"
                    />
                  </div>

                  <div className="mt-5 border-t border-neutral-200 pt-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-black">
                          Room Add-on / Sales Charge
                        </p>
                        <p className="text-xs text-neutral-500">
                          Optional. Use only when the request should be charged
                          to the guest room.
                        </p>
                      </div>
                    </div>

                    <label className="mb-4 flex items-center gap-2 text-sm font-bold">
                      <input
                        type="checkbox"
                        name="postCharge"
                        value="true"
                        defaultChecked={Boolean(charge)}
                        disabled={!hasRoom}
                        className="size-4"
                      />
                      Mark as billable room add-on
                    </label>

                    <div className="grid gap-3 md:grid-cols-[1fr_90px_130px]">
                      <div>
                        <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
                          Add-on Item
                        </label>

                        <input
                          name="chargeItemName"
                          defaultValue={charge?.itemName ?? request.type}
                          placeholder="e.g. Extra Towels, Laundry, Water Refill"
                          disabled={!hasRoom}
                          className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400 disabled:cursor-not-allowed disabled:bg-neutral-100"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
                          Qty
                        </label>

                        <input
                          name="chargeQuantity"
                          type="number"
                          min="1"
                          step="1"
                          defaultValue={charge?.quantity ?? 1}
                          disabled={!hasRoom}
                          className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400 disabled:cursor-not-allowed disabled:bg-neutral-100"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
                          Unit Price
                        </label>

                        <input
                          name="chargeUnitPrice"
                          type="number"
                          min="0"
                          step="0.01"
                          defaultValue={charge ? String(charge.unitPrice) : ''}
                          placeholder="0.00"
                          disabled={!hasRoom}
                          className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400 disabled:cursor-not-allowed disabled:bg-neutral-100"
                        />
                      </div>
                    </div>

                    <div className="mt-3">
                      <label className="mb-1 block text-xs font-black uppercase text-neutral-500">
                        Billing Note
                      </label>

                      <input
                        name="chargeDescription"
                        defaultValue={charge?.description ?? request.notes ?? ''}
                        placeholder="Optional billing description"
                        disabled={!hasRoom}
                        className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold outline-none focus:border-neutral-400 disabled:cursor-not-allowed disabled:bg-neutral-100"
                      />
                    </div>

                    <p className="mt-2 text-xs text-neutral-500">
                      Total amount is computed on save: quantity × unit price.
                    </p>
                  </div>

                  <div className="mt-4">
                    <Button className="w-full">
                      {charge ? 'Update Request / Charge' : 'Update Request'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}