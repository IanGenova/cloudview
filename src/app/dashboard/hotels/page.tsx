import { PageHeader } from '@/components/dashboard/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { createHotelAction } from './actions';

export default async function HotelsPage() {
  const user = await requireUser();

  if (user.role !== 'SUPER_ADMIN') {
    return <p>Forbidden</p>;
  }

  const hotels = await db.hotel.findMany({
    include: {
      subscription: {
        include: {
          package: true,
        },
      },
      _count: {
        select: {
          rooms: true,
          orders: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return (
    <div>
      <PageHeader
        title="Hotels / Properties"
        description="Super admin controls for client hotels."
      />

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Create hotel</CardTitle>
          </CardHeader>

          <CardContent>
            <form action={createHotelAction} className="space-y-4">
              <label className="grid gap-2">
                <span className="text-sm font-black text-neutral-800">
                  Hotel Name
                </span>
                <Input
                  name="name"
                  placeholder="Enter hotel name"
                  required
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-black text-neutral-800">
                  Hotel Slug
                </span>
                <Input
                  name="slug"
                  placeholder="cloud-view-demo"
                  required
                />
                <span className="text-xs font-medium leading-relaxed text-neutral-500">
                  Used in URLs and internal hotel references. Use lowercase
                  letters, numbers, and hyphens.
                </span>
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-black text-neutral-800">
                  Brand Color
                </span>
                <Input
                  name="brandColor"
                  placeholder="#111111"
                />
                <span className="text-xs font-medium leading-relaxed text-neutral-500">
                  Main hotel brand color. Example: #111111.
                </span>
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-black text-neutral-800">
                  Accent Color
                </span>
                <Input
                  name="accentColor"
                  placeholder="#B88938"
                />
                <span className="text-xs font-medium leading-relaxed text-neutral-500">
                  Secondary highlight color used for buttons, badges, and
                  accents.
                </span>
              </label>

              <Button className="w-full">Create Hotel</Button>
            </form>
          </CardContent>
        </Card>

        <div className="grid gap-4">
          {hotels.map((hotel) => (
            <Card key={hotel.id}>
              <CardContent className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                <div>
                  <h3 className="text-xl font-black">{hotel.name}</h3>
                  <p className="text-sm text-neutral-500">
                    /{hotel.slug} · {hotel._count.rooms} rooms ·{' '}
                    {hotel._count.orders} orders
                  </p>
                </div>

                <p className="rounded-full bg-cream px-4 py-2 text-sm font-bold">
                  {hotel.subscription?.package.name ?? 'No package'}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}