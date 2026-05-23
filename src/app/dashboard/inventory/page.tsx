import { InventoryMovementType } from '@prisma/client';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { createInventoryItemAction, linkRecipeAction, stockMovementAction } from './actions';

export default async function InventoryPage() {
  const user = await requireUser();
  const where = user.role === 'SUPER_ADMIN' ? {} : { hotelId: user.hotelId! };
  const [hotels, items, products, movements] = await Promise.all([
    db.hotel.findMany({ where: user.role === 'SUPER_ADMIN' ? {} : { id: user.hotelId! } }),
    db.inventoryItem.findMany({ where, include: { hotel: true }, orderBy: { name: 'asc' } }),
    db.menuProduct.findMany({ where, include: { hotel: true }, orderBy: { name: 'asc' } }),
    db.inventoryMovement.findMany({ where, include: { item: true, user: true }, orderBy: { createdAt: 'desc' }, take: 10 })
  ]);

  return (
    <div>
      <PageHeader title="Inventory Management" description="Stock quantity, reorder levels, movements, and product recipe deductions." />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card><CardHeader><CardTitle>Add inventory item</CardTitle></CardHeader><CardContent><form action={createInventoryItemAction} className="space-y-3">
          {user.role === 'SUPER_ADMIN' ? <Select name="hotelId">{hotels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</Select> : null}
          <Input name="name" placeholder="Burger Bun" required />
          <Input name="sku" placeholder="SKU optional" />
          <Input name="unit" placeholder="pcs / ml / kg" required />
          <Input name="stockQuantity" type="number" step="0.001" placeholder="100" required />
          <Input name="reorderLevel" type="number" step="0.001" placeholder="20" required />
          <Input name="supplier" placeholder="Supplier" />
          <Button className="w-full">Add Item</Button>
        </form></CardContent></Card>
        <Card><CardHeader><CardTitle>Stock in/out</CardTitle></CardHeader><CardContent><form action={stockMovementAction} className="space-y-3">
          <Select name="itemId">{items.map((i) => <option key={i.id} value={i.id}>{i.hotel.name} · {i.name}</option>)}</Select>
          <Select name="type">{Object.values(InventoryMovementType).filter(t => t !== 'ORDER_DEDUCTION').map((t) => <option key={t} value={t}>{t}</option>)}</Select>
          <Input name="quantity" type="number" step="0.001" placeholder="10" required />
          <Input name="reason" placeholder="Delivery / correction / spoilage" />
          <Button className="w-full">Save Movement</Button>
        </form></CardContent></Card>
        <Card><CardHeader><CardTitle>Recipe / Stock deduction</CardTitle></CardHeader><CardContent><form action={linkRecipeAction} className="space-y-3">
          <Select name="productId">{products.map((p) => <option key={p.id} value={p.id}>{p.hotel.name} · {p.name}</option>)}</Select>
          <Select name="inventoryItemId">{items.map((i) => <option key={i.id} value={i.id}>{i.hotel.name} · {i.name}</option>)}</Select>
          <Input name="quantity" type="number" step="0.001" placeholder="1" required />
          <Button className="w-full">Link Recipe</Button>
        </form></CardContent></Card>
      </div>
      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_420px]">
        <Card><CardHeader><CardTitle>Stock</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">{items.map((item) => {
          const low = Number(item.stockQuantity) <= Number(item.reorderLevel);
          return <div key={item.id} className="rounded-2xl bg-neutral-50 p-4"><div className="flex justify-between gap-2"><b>{item.name}</b>{low ? <Badge tone="red">Low stock</Badge> : <Badge tone="green">OK</Badge>}</div><p className="text-sm text-neutral-500">{item.hotel.name} · {String(item.stockQuantity)} {item.unit} · reorder {String(item.reorderLevel)}</p></div>;
        })}</CardContent></Card>
        <Card><CardHeader><CardTitle>Recent stock history</CardTitle></CardHeader><CardContent className="space-y-3">{movements.map((m) => <div key={m.id} className="rounded-2xl bg-neutral-50 p-3 text-sm"><b>{m.type.replaceAll('_', ' ')}</b> · {String(m.quantity)} {m.item.unit}<p className="text-neutral-500">{m.item.name} · {m.reason}</p></div>)}</CardContent></Card>
      </div>
    </div>
  );
}
