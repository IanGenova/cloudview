import { PageHeader } from '@/components/dashboard/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { StatCard } from '@/components/dashboard/StatCard';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { money } from '@/lib/money';

export default async function AnalyticsPage() {
  const user = await requireUser();
  const where = user.role === 'SUPER_ADMIN' ? {} : { hotelId: user.hotelId! };
  const [sales, orders, requests, popular, roomOrders, poolOrders, inventoryUsage] = await Promise.all([
    db.order.aggregate({ where, _sum: { totalCents: true } }),
    db.order.count({ where }),
    db.serviceRequest.count({ where }),
    db.orderItem.groupBy({ by: ['productNameSnapshot'], _sum: { quantity: true }, orderBy: { _sum: { quantity: 'desc' } }, take: 10 }),
    db.order.count({ where: { ...where, roomId: { not: null } } }),
    db.order.count({ where: { ...where, location: { type: 'POOL' } } }),
    db.inventoryMovement.groupBy({ by: ['itemId'], _sum: { quantity: true }, orderBy: { _sum: { quantity: 'desc' } }, take: 10 })
  ]);
  const inventoryItems = await db.inventoryItem.findMany({ where: { id: { in: inventoryUsage.map((i) => i.itemId) } } });
  const itemMap = new Map(inventoryItems.map((i) => [i.id, i]));

  return (
    <div>
      <PageHeader title="Analytics" description="Sales, guest interactions, service requests, product popularity, and inventory usage." />
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Total sales" value={money(sales._sum.totalCents ?? 0)} />
        <StatCard label="Total orders" value={orders} />
        <StatCard label="Room service orders" value={roomOrders} />
        <StatCard label="Poolside orders" value={poolOrders} />
      </div>
      <div className="mt-8 grid gap-6 xl:grid-cols-3">
        <Card><CardHeader><CardTitle>Popular menu items</CardTitle></CardHeader><CardContent className="space-y-3">{popular.map((p) => <div key={p.productNameSnapshot} className="rounded-2xl bg-neutral-50 p-3 font-bold">{p.productNameSnapshot}<span className="float-right">{p._sum.quantity ?? 0}</span></div>)}</CardContent></Card>
        <Card><CardHeader><CardTitle>Service request count</CardTitle></CardHeader><CardContent><p className="text-6xl font-black">{requests}</p><p className="text-neutral-500">Total guest service interactions</p></CardContent></Card>
        <Card><CardHeader><CardTitle>Inventory usage</CardTitle></CardHeader><CardContent className="space-y-3">{inventoryUsage.map((u) => { const item = itemMap.get(u.itemId); return <div key={u.itemId} className="rounded-2xl bg-neutral-50 p-3 font-bold">{item?.name ?? u.itemId}<span className="float-right">{String(u._sum.quantity ?? 0)} {item?.unit}</span></div>; })}</CardContent></Card>
      </div>
    </div>
  );
}
