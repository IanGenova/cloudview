import { PrismaClient, Role, TagType, TagStatus, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('Password123!', 12);

  const starter = await prisma.subscriptionPackage.upsert({
    where: { name: 'Starter MVP' },
    update: {},
    create: {
      name: 'Starter MVP',
      description: 'For one hotel property with NFC guest portal, orders, requests, inventory, and mock POS.',
      priceCents: 499900,
      maxHotels: 1,
      maxRooms: 80
    }
  });

  const hotel = await prisma.hotel.upsert({
    where: { slug: 'cloud-view-demo' },
    update: {},
    create: {
      name: 'Cloud View Demo Hotel',
      slug: 'cloud-view-demo',
      brandColor: '#111111',
      accentColor: '#B88938',
      settings: {
        create: {
          currency: 'PHP',
          taxRate: new Prisma.Decimal(0.12),
          serviceChargeRate: new Prisma.Decimal(0.10),
          wifiName: 'CloudView-Guest',
          wifiPassword: 'one-tap-away',
          checkInTime: '2:00 PM',
          checkOutTime: '12:00 PM',
          poolHours: '7:00 AM - 9:00 PM',
          poolRules: 'No running. Children must be supervised. Shower before entering. No glassware in the pool area.',
          policies: 'Quiet hours begin at 10:00 PM. Please contact staff for assistance, extra towels, or maintenance.',
          guideText: 'Amenities: pool, restaurant, cafe, lobby lounge. Transportation and tourist information are available at the front desk.',
          contactPhone: '+63 900 000 0000',
          contactEmail: 'frontdesk@cloudview.test'
        }
      },
      subscription: { create: { packageId: starter.id, status: 'TRIALING' } }
    }
  });

  await prisma.user.upsert({ where: { email: 'admin@cloudview.test' }, update: {}, create: { name: 'Super Admin', email: 'admin@cloudview.test', passwordHash, role: Role.SUPER_ADMIN } });
  await prisma.user.upsert({ where: { email: 'hoteladmin@cloudview.test' }, update: {}, create: { name: 'Hotel Admin', email: 'hoteladmin@cloudview.test', passwordHash, role: Role.HOTEL_ADMIN, hotelId: hotel.id } });
  await prisma.user.upsert({ where: { email: 'staff@cloudview.test' }, update: {}, create: { name: 'Front Desk Staff', email: 'staff@cloudview.test', passwordHash, role: Role.STAFF, hotelId: hotel.id } });
  await prisma.user.upsert({ where: { email: 'kitchen@cloudview.test' }, update: {}, create: { name: 'Kitchen User', email: 'kitchen@cloudview.test', passwordHash, role: Role.KITCHEN, hotelId: hotel.id } });

  const room = await prisma.room.upsert({
    where: { hotelId_number: { hotelId: hotel.id, number: '305' } },
    update: {},
    create: { hotelId: hotel.id, number: '305', name: 'Deluxe Room 305', floor: '3rd Floor' }
  });

  const pool =
    (await prisma.location.findFirst({ where: { hotelId: hotel.id, name: 'Pool Deck' } })) ??
    (await prisma.location.create({ data: { hotelId: hotel.id, name: 'Pool Deck', type: TagType.POOL, description: 'Poolside NFC panel for food, towels, and pool info.' } }));

  await prisma.nfcTag.upsert({
    where: { code: 'room-305-main-panel' },
    update: {},
    create: { hotelId: hotel.id, code: 'room-305-main-panel', label: 'Room 305 Main Panel', tagType: TagType.ROOM, status: TagStatus.ACTIVE, roomId: room.id }
  });
  await prisma.nfcTag.upsert({
    where: { code: 'pool-deck-main-panel' },
    update: {},
    create: { hotelId: hotel.id, code: 'pool-deck-main-panel', label: 'Pool Deck Main Panel', tagType: TagType.POOL, status: TagStatus.ACTIVE, locationId: pool.id }
  });

  async function category(name: string, sortOrder: number) {
    return (await prisma.menuCategory.findFirst({ where: { hotelId: hotel.id, name } })) ??
      prisma.menuCategory.create({ data: { hotelId: hotel.id, name, sortOrder } });
  }

  const breakfast = await category('Breakfast', 1);
  const mains = await category('Mains', 2);
  const drinks = await category('Drinks', 3);

  async function product(name: string, categoryId: string, priceCents: number, description: string, imageUrl: string) {
    const found = await prisma.menuProduct.findFirst({ where: { hotelId: hotel.id, name } });
    if (found) return found;
    return prisma.menuProduct.create({ data: { hotelId: hotel.id, categoryId, name, priceCents, description, imageUrl, prepTimeMinutes: 15 } });
  }

  const club = await product('Cloud Club Sandwich', mains.id, 32000, 'Chicken, bacon, egg, lettuce, tomato, and fries.', 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af');
  const burger = await product('Signature Burger', mains.id, 38000, 'Beef patty, cheese, lettuce, tomato, and house sauce.', 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd');
  const pancakes = await product('Breakfast Pancakes', breakfast.id, 26000, 'Pancakes with butter, syrup, and fresh fruit.', 'https://images.unsplash.com/photo-1528207776546-365bb710ee93');
  const tea = await product('Iced Tea', drinks.id, 12000, 'Freshly brewed iced tea served cold.', 'https://images.unsplash.com/photo-1556679343-c7306c1976bc');

  async function inventory(name: string, unit: string, qty: number, reorder: number) {
    return prisma.inventoryItem.upsert({
      where: { hotelId_name: { hotelId: hotel.id, name } },
      update: {},
      create: { hotelId: hotel.id, name, unit, stockQuantity: new Prisma.Decimal(qty), reorderLevel: new Prisma.Decimal(reorder), supplier: 'Demo Supplier' }
    });
  }

  const bread = await inventory('Sandwich Bread', 'pcs', 120, 30);
  const chicken = await inventory('Chicken Portion', 'pcs', 80, 20);
  const bun = await inventory('Burger Bun', 'pcs', 100, 25);
  const patty = await inventory('Beef Patty', 'pcs', 60, 15);
  const cup = await inventory('Cold Cup', 'pcs', 200, 40);
  const teaStock = await inventory('Brewed Tea', 'ml', 20000, 4000);

  async function recipe(productId: string, inventoryItemId: string, quantity: number) {
    await prisma.productInventoryRecipe.upsert({
      where: { productId_inventoryItemId: { productId, inventoryItemId } },
      update: { quantity: new Prisma.Decimal(quantity) },
      create: { productId, inventoryItemId, quantity: new Prisma.Decimal(quantity) }
    });
  }

  await recipe(club.id, bread.id, 2);
  await recipe(club.id, chicken.id, 1);
  await recipe(burger.id, bun.id, 1);
  await recipe(burger.id, patty.id, 1);
  await recipe(tea.id, cup.id, 1);
  await recipe(tea.id, teaStock.id, 300);
  await recipe(pancakes.id, bread.id, 1);

  await prisma.posIntegration.upsert({
    where: { hotelId: hotel.id },
    update: {},
    create: { hotelId: hotel.id, providerName: 'Cloud View Mock POS', enabled: false }
  });

  console.log('Seed complete. Demo URL: /t/room-305-main-panel');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
