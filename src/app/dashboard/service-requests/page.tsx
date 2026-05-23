import { ServiceRequestStatus } from '@prisma/client';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { updateServiceRequestAction } from './actions';

export default async function ServiceRequestsPage() {
  const user = await requireUser();
  const where = user.role === 'SUPER_ADMIN' ? {} : { hotelId: user.hotelId! };
  const [requests, staff] = await Promise.all([
    db.serviceRequest.findMany({ where, include: { hotel: true, room: true, location: true, assignedTo: true }, orderBy: { createdAt: 'desc' }, take: 60 }),
    db.user.findMany({ where: user.role === 'SUPER_ADMIN' ? { role: { in: ['STAFF', 'HOTEL_ADMIN'] } } : { hotelId: user.hotelId!, role: { in: ['STAFF', 'HOTEL_ADMIN'] } }, orderBy: { name: 'asc' } })
  ]);

  return (
    <div>
      <PageHeader title="Service Requests" description="Housekeeping, towels, toiletries, maintenance, water refill, and guest support." />
      <div className="space-y-4">
        {requests.map((request) => (
          <Card key={request.id}>
            <CardContent className="grid gap-4 xl:grid-cols-[1fr_420px] xl:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2"><h3 className="text-xl font-black">{request.requestCode}</h3><StatusBadge status={request.status} /></div>
                <p className="text-sm text-neutral-500">{request.hotel.name} · {request.room ? `Room ${request.room.number}` : request.location?.name || 'Guest location'} · {request.createdAt.toLocaleString()}</p>
                <p className="mt-3 font-bold">{request.type}</p>
                {request.notes ? <p className="text-neutral-600">{request.notes}</p> : null}
                <p className="mt-2 text-sm text-neutral-500">Assigned: {request.assignedTo?.name ?? 'Unassigned'}</p>
              </div>
              <form action={updateServiceRequestAction} className="grid gap-2 md:grid-cols-3">
                <input type="hidden" name="requestId" value={request.id} />
                <Select name="status" defaultValue={request.status}>{Object.values(ServiceRequestStatus).map((s) => <option key={s} value={s}>{s}</option>)}</Select>
                <Select name="assignedToId" defaultValue={request.assignedToId ?? ''}><option value="">Unassigned</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
                <Button>Update</Button>
              </form>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
