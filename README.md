# Cloud View MVP

Cloud View — Smart Hospitality, One Tap Away.

This is a production-ready MVP starter for an NFC-powered hotel guest portal and operations dashboard. Guests tap an NFC wall panel or scan a QR code and open a mobile web portal without installing an app.

## Included MVP features

- NFC URL routing: `/t/[tagCode]`
- QR fallback image generation
- Guest mobile portal
- Digital menu and cart checkout
- Optional guest name and notes
- Payment method placeholder: room charge, pay at counter, cash, POS
- Order tracking page
- Guest service requests
- Pool information
- Hotel guide and contact page
- Secure dashboard login with cookie JWT sessions
- Role-based access control
- Super Admin, Hotel Admin, Staff, Kitchen roles
- Hotels/properties management
- Rooms and locations management
- NFC tag management
- Menu categories/products
- Inventory items and stock movement history
- Product recipe/stock deduction mapping
- Order workflow and kitchen display
- Inventory auto-deduction when an order is released to the kitchen
- Mock POS integration and POS sync logs
- Analytics dashboard
- Hotel settings for branding, Wi-Fi, rules, policies, tax, service charge
- Prisma MySQL schema and seed data
- Hostinger deployment notes

## Tech stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Prisma ORM
- MySQL
- Secure custom auth with `jose` JWT + `bcryptjs`
- Zod validation
- Hostinger VPS / Node.js-compatible hosting ready

## Folder structure

```txt
cloud-view-mvp/
├─ prisma/
│  ├─ schema.prisma
│  └─ seed.ts
├─ src/
│  ├─ app/
│  │  ├─ api/qr/route.ts
│  │  ├─ api/pos/mock/route.ts
│  │  ├─ dashboard/...
│  │  └─ t/[tagCode]/...
│  ├─ components/
│  │  ├─ dashboard/
│  │  ├─ guest/
│  │  └─ ui/
│  └─ lib/
│     ├─ auth.ts
│     ├─ db.ts
│     ├─ inventory.ts
│     ├─ pos.ts
│     └─ validators.ts
├─ .env.example
├─ next.config.mjs
├─ package.json
└─ README.md
```

## Step-by-step local setup

### 1. Install Node.js

Use Node.js 20+.

### 2. Install dependencies

```bash
npm install
```

### 3. Create MySQL database

Create a database named `cloudview`.

Example MySQL commands:

```sql
CREATE DATABASE cloudview CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'cloudview_user'@'%' IDENTIFIED BY 'strong_password';
GRANT ALL PRIVILEGES ON cloudview.* TO 'cloudview_user'@'%';
FLUSH PRIVILEGES;
```

### 4. Configure environment variables

Copy the example file:

```bash
cp .env.example .env
```

Update `.env`:

```env
DATABASE_URL="mysql://cloudview_user:strong_password@localhost:3306/cloudview"
AUTH_SECRET="replace-with-a-long-random-secret"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
MOCK_POS_SHARED_SECRET="dev-pos-secret"
```

Generate a strong auth secret:

```bash
openssl rand -base64 32
```

### 5. Generate Prisma client

```bash
npx prisma generate
```

### 6. Run migration

```bash
npx prisma migrate deploy
```

> **`migrate dev` will not work with the grant above.** It creates a temporary
> shadow database, and `GRANT ALL PRIVILEGES ON cloudview.*` does not permit
> creating databases -- you get `P3014`. Either use `migrate deploy` as shown,
> or grant `CREATE` on `*.*` to the user first.

> **Known issue:** the committed migration chain does not currently apply to an
> empty database, and several tables the application uses are created by no
> migration at all. See `.flow/ULTRA-2026-09-10.md`, BLOCKER 2. Until that is
> reconciled, `npx prisma db push` is the way to get a working development
> database from `schema.prisma`.

### 7. Seed demo data

```bash
npm run db:seed
```

Seed accounts:

```txt
Super Admin: admin@cloudview.test / Password123!
Hotel Admin: hoteladmin@cloudview.test / Password123!
Staff: staff@cloudview.test / Password123!
Kitchen: kitchen@cloudview.test / Password123!
```

### 8. Start development server

```bash
npm run dev
```

Open the dashboard:

```txt
http://localhost:3000/dashboard/login
```

For the guest portal, use the launch URLs the seed prints. They carry the tag's
scan secret, which is what creates the guest session:

```txt
/n/pool-deck-main-panel?k=<secret printed by npm run db:seed>
```

`/t/<code>` on its own is not a way in -- it is gated by an NFC session and
redirects to `/nfc-access-denied`. The room tag additionally needs an active
guest stay with a room passcode; the pool tag does not, so it is the quicker
demo.

## MVP test flow

1. Log in as `hoteladmin@cloudview.test`.
2. Open **Rooms & Locations** and confirm Room 305 exists.
3. Open **NFC Tags** and copy the NFC URL.
4. Open `/t/room-305-main-panel` as a guest.
5. Order food from the digital menu.
6. Open **Orders** or **Kitchen Display**.
7. Click **Accept & Prepare** on the order, which moves it to PREPARING.
8. Inventory is deducted based on product recipes. (Deduction fires on the move
   to PREPARING/READY/DELIVERED, not on ACCEPTED -- moving an order to ACCEPTED
   deducts nothing.)
9. POS sync is logged as pending if POS is disabled, or sent if enabled.
10. Open the guest order tracking URL to see status changes.

## NFC tag setup

Write this URL into the physical NFC tag:

```txt
https://your-domain.com/t/room-305-main-panel
```

Use the same URL for QR fallback.

Each tag identifies:

- Hotel
- Room or location
- Tag type: room, pool, restaurant, lobby, amenity
- Available guest services

## POS integration

The MVP includes a reusable POS adapter in:

```txt
src/lib/pos.ts
```

> **There is no POS Integration screen.** Nothing in the dashboard reads or
> writes the `PosIntegration` row, so `enabled` cannot be turned on and
> `apiEndpoint` cannot be set without editing MySQL directly. Every order
> therefore logs a PENDING `PosSyncLog` with "POS integration disabled", and
> the mock endpoint below is unreachable. The adapter and the log rows are
> real; the screens are not. See `.flow/ULTRA-2026-09-10.md`, MAJOR 28.

Once those screens exist, testing the mock POS would be:

1. Go to **Dashboard → POS Integration**.
2. Enable POS sync.
3. Set API endpoint to:

```txt
https://your-domain.com/api/pos/mock
```

For local testing:

```txt
http://localhost:3000/api/pos/mock
```

4. Accept a new order.
5. Check POS sync logs.

## Inventory deduction logic

Recipes are stored in `ProductInventoryRecipe`.

Example:

```txt
Signature Burger uses:
- 1 Burger Bun
- 1 Beef Patty
```

When staff release an order to the kitchen, `deductInventoryForOrder()` checks inventory, prevents deduction if stock is insufficient, deducts stock, creates `InventoryMovement` records, and marks `inventoryDeductedAt` so the same order is not deducted twice.

## Security notes

- Dashboard routes are protected.
- Guest portal does not expose admin records.
- Passwords are hashed with bcrypt.
- Sessions use HTTP-only cookies.
- Inputs are validated with Zod and sanitized.
- Prisma protects against SQL injection.
- Add production rate limiting before public launch, especially for guest order and service request actions.
- Store real POS keys encrypted using a proper key management strategy before production.

## Hostinger deployment

### Recommended option: Hostinger VPS or Node.js-compatible hosting

This Next.js app needs a Node.js server runtime because it uses server actions, auth cookies, Prisma, API routes, and dynamic guest/order pages.

Recommended deployment steps:

```bash
git clone YOUR_REPO_URL
cd cloud-view-mvp
npm install
cp .env.example .env
npx prisma generate
npx prisma migrate deploy
npm run db:seed
npm run build
pm2 start ecosystem.production.cjs
```

> Do **not** use `npm run start` on a server. It runs `next start` on port
> **3001** behind `local-ssl-proxy --hostname 192.168.0.130`, which is a
> developer's LAN-HTTPS harness -- the VPS does not hold that address, and
> `concurrently` and `local-ssl-proxy` are devDependencies a production install
> omits. `ecosystem.production.cjs` runs `next start -H 127.0.0.1 -p 3000`,
> which is what `deploy/deploy.sh` and the nginx config expect.

For a VPS, run the app with PM2:

```bash
npm install -g pm2
pm2 start ecosystem.production.cjs
pm2 save
```

That starts three processes: the Next.js server, the scheduled-release worker,
and the refund-retry worker. The last one drives
`/api/xendit/refunds/retry`; without it a guest refund that fails once is never
retried.

Then use Nginx or Hostinger's reverse proxy setup to point your domain to the Node.js app port.

### Shared hosting workaround

Traditional shared hosting that only supports PHP/static files is not enough for this app because the backend runs inside Next.js. Use one of these options:

1. Hostinger VPS with Node.js.
2. Hostinger Node.js Web App hosting if available for your plan.
3. Deploy frontend/server to Vercel or another Node-compatible platform and keep MySQL on Hostinger.

## Production checklist

- Replace seed passwords.
- Add real file upload storage for logos/product images.
- Add email/SMS/Push notifications.
- Add rate limiting in guest actions.
- Add audit log screens.
- Add WebSocket or SSE for real-time kitchen updates.
- Encrypt POS API keys.
- Add billing/subscription integration for Super Admin.
- Add printer integration for kitchen tickets.
- Add tests before production launch.
