import { OrderStatus, ServiceRequestStatus } from '@prisma/client';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { StatCard } from '@/components/dashboard/StatCard';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { money } from '@/lib/money';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';

export default async function DashboardHome() {
  const user = await requireUser();
  const hotelWhere = user.role === 'SUPER_ADMIN' ? {} : { hotelId: user.hotelId! };
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [ordersToday, pendingRequests, salesAgg, lowStock, recentOrders, popular] = await Promise.all([
    db.order.count({ where: { ...hotelWhere, createdAt: { gte: today } } }),
    db.serviceRequest.count({ where: { ...hotelWhere, status: { in: [ServiceRequestStatus.NEW, ServiceRequestStatus.IN_PROGRESS] } } }),
    db.order.aggregate({ where: { ...hotelWhere, status: { not: OrderStatus.CANCELLED }, createdAt: { gte: today } }, _sum: { totalCents: true } }),
    db.inventoryItem.findMany({ where: { ...hotelWhere }, take: 5, orderBy: { stockQuantity: 'asc' } }),
    db.order.findMany({ where: hotelWhere, include: { room: true, location: true, hotel: true }, orderBy: { createdAt: 'desc' }, take: 6 }),
    db.orderItem.groupBy({ by: ['productNameSnapshot'], _sum: { quantity: true }, orderBy: { _sum: { quantity: 'desc' } }, take: 5 })
  ]);

  return (
    <div>
      <PageHeader title="Overview" description="Today’s hotel operations at a glance." />
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Today’s orders" value={ordersToday} />
        <StatCard label="Pending requests" value={pendingRequests} />
        <StatCard label="Total sales today" value={money(salesAgg._sum.totalCents ?? 0)} />
        <StatCard label="Inventory alerts" value={lowStock.filter((i) => Number(i.stockQuantity) <= Number(i.reorderLevel)).length} />
      </div>
      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Recent Orders</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {recentOrders.map((order) => (
              <div key={order.id} className="flex items-center justify-between rounded-2xl bg-neutral-50 p-4">
                <div>
                  <p className="font-black">{order.orderCode}</p>
                  <p className="text-sm text-neutral-500">{order.hotel.name} · {order.room?.number || order.location?.name || 'Guest location'}</p>
                </div>
                <div className="text-right">
                  <StatusBadge status={order.status} />
                  <p className="mt-1 text-sm font-bold">{money(order.totalCents)}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Popular Products & Low Stock</CardTitle></CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            <div className="space-y-3">
              <h4 className="font-black">Popular products</h4>
              {popular.map((item) => <p key={item.productNameSnapshot} className="rounded-2xl bg-neutral-50 p-3 text-sm font-semibold">{item.productNameSnapshot} · {item._sum.quantity ?? 0} sold</p>)}
            </div>
            <div className="space-y-3">
              <h4 className="font-black">Inventory watch</h4>
              {lowStock.map((item) => <p key={item.id} className="rounded-2xl bg-neutral-50 p-3 text-sm font-semibold">{item.name}: {String(item.stockQuantity)} {item.unit}</p>)}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
