# Cloud View Hotel — Xendit Integration Report

Date: July 13, 2026

## Result

The active PayMongo checkout implementation was replaced with Xendit across the Cloud View Hotel application while preserving historical PayMongo records.

New Xendit payments now cover:

1. Dashboard POS
2. Guest food ordering
3. Guest service requests
4. Guest-stay folio checkout

The implementation uses Xendit Payment Sessions in `PAYMENT_LINK` mode for a hosted checkout, Xendit payment/refund webhooks for authoritative status changes, and xenPlatform Split Rules for hotel/platform settlement routing.

## Main architecture

```text
Cloud View checkout
  -> server creates Xendit Payment Session
  -> guest/customer opens Xendit hosted checkout
  -> card/e-wallet/QR payment is completed
  -> Xendit sends payment.capture webhook
  -> Cloud View validates payment ID, request ID, amount, currency, and session
  -> Cloud View finalizes the POS sale, food order, service request, or guest checkout
  -> Xendit sends split.payment result for settlement reconciliation
```

The supported explicit hosted-checkout channel allowlist is:

- Cards
- GCash
- QRPh
- ShopeePay
- GrabPay
- Maya (`PAYMAYA`)

When the allowlist environment variable is empty, Xendit decides which compatible and activated channels to display.

## Split settlement design

Each hotel can be configured from **Dashboard -> Settings** with:

- Split enabled/disabled
- Hotel xenPlatform Business ID
- Percentage or fixed Cloud View commission
- Fee bearer: Hotel or Cloud View

### Hotel bears Xendit processing fees

The Payment Session is created on the hotel sub-account using `for-user-id`. The Split Rule routes Cloud View's commission to the master account. Xendit fees and tax remain on the hotel/source balance.

### Cloud View bears Xendit processing fees

The Payment Session is created on the Cloud View master account. The Split Rule routes the hotel's calculated share to the hotel sub-account. Xendit fees and tax remain on the Cloud View/source balance.

Split settings are snapshotted into each stored payment payload so a later settings change does not rewrite the terms of an earlier transaction.

## Provider cutover and historical data

Existing database table and column names containing `PayMongo` are intentionally retained with Prisma `@map`/`@@map` mappings. This avoids destructive table renames and preserves old payment history.

A `paymentProvider` discriminator was added:

- Existing rows migrate as `PAYMONGO`
- New rows default to `XENDIT`

Existing PayMongo records therefore remain readable, while all new checkout and status operations are scoped to Xendit records.

## Important files

### Core Xendit modules

- `src/lib/xendit.ts`
  - Basic-auth API client
  - Payment Session creation and cancellation
  - Hosted channel validation
  - Refund creation
  - Timeout and API error handling

- `src/lib/xendit-split.ts`
  - xenPlatform Business ID validation
  - Split Rule creation and reuse
  - `for-user-id` and `with-split-rule` routing
  - Split configuration snapshots

- `src/lib/xendit-split-calculator.ts`
  - Pure commission/share calculation
  - Percentage and fixed commission validation
  - Hotel/Cloud View fee-bearer routing

- `src/lib/xendit-payout.ts`
  - Server-side Xendit Payouts v3 scaffold
  - Bank/e-wallet destination routing fields
  - Idempotency and timeout handling

- `src/lib/guest-xendit-refund.ts`
  - Automatic/manual guest refund handling
  - Correct sub-account routing for refunds
  - QRPh manual-refund guard

### Checkout flows

- `src/app/dashboard/pos/xendit-actions.ts`
- `src/app/t/[tagCode]/food-xendit-actions.ts`
- `src/app/t/[tagCode]/service-xendit-actions.ts`
- `src/app/dashboard/guest-stays/actions.ts`

### Webhook

- `src/app/api/xendit/webhook/route.ts`

The webhook verifies `x-callback-token`, deduplicates deliveries, and handles:

- `payment.capture`
- `payment.failure`
- `payment_session.expired`
- `refund.succeeded`
- `refund.failed`
- `split.payment`

A successful redirect is never treated as proof of payment. Only the verified server webhook can mark a transaction paid.

## Payment validation and failure handling

Before a transaction becomes paid, Cloud View requires:

- Status `SUCCEEDED`
- Valid Xendit Payment ID (`py-...`)
- Valid Payment Request ID (`pr-...`)
- Exact gross amount match
- Exact PHP currency match
- Matching internal/checkout session

A paid event with inconsistent details becomes `PAID_REVIEW_REQUIRED` rather than being fulfilled silently.

Guest payments that succeeded at Xendit but cannot be safely fulfilled can enter the automatic refund workflow. POS review cases remain available for finance/admin reconciliation.

If the original payment succeeds but the split fails, the transaction remains paid and the split is recorded as failed with a manual-settlement warning. A failed split must not reverse guest service fulfillment.

## Refund limitations

Refunds are sent using the original Payment Request ID and, when appropriate, the same hotel sub-account through `for-user-id`.

QRPh does not currently support API refunds. QRPh refund cases must be settled manually and recorded in Cloud View.

Xendit Split Rules are not automatically reversed when the original payment is refunded. Cloud View finance must account for the previously routed commission/share or implement a compensating transfer policy.

## Guest-stay folio classification

The guest-stay payment enum now includes `EWALLET` so ShopeePay, GrabPay, and other supported wallets are not mislabeled as card payments. GCash, Maya, and QRPh retain their specific classifications.

## Payout status

`src/lib/xendit-payout.ts` is a production-oriented server helper for deliberate outgoing payouts using Xendit Payouts v3.

It is **not yet connected to an automatic hotel withdrawal screen**, because the supplied Cloud View project does not contain verified hotel beneficiary/KYC data, bank/e-wallet routing details, payout approval controls, or a complete payout ledger.

Before enabling automatic withdrawals, add:

- Hotel payout destination model
- Encrypted/masked beneficiary account details
- KYC/capability status
- Payout request and approval ledger
- Payout webhook/status reconciliation
- Role-based finance approval
- Daily limits, duplicate prevention, and negative-balance controls

Automatic Split Rules already route settlement between Xendit account balances. Payouts are a separate operation that sends available balance to a bank or supported wallet.

## Database migration

Migration added:

`prisma/migrations/20260713_xendit_payment_cutover/migration.sql`

It:

- Adds `XENDIT` to relevant payment enums
- Adds `EWALLET` to guest-stay payment classifications
- Adds Xendit payment request and split reconciliation fields
- Adds provider indexes
- Preserves existing rows as PayMongo history
- Makes new rows Xendit-owned by default

The migration assumes the current production database already has the existing PayMongo session/settings tables represented in the supplied Prisma schema. Because the archive does not include a complete known production baseline, test this migration against a database backup/staging clone before production deployment.

## Validation performed

- TypeScript/TSX syntax parsing across the application
- Split calculator valid and invalid scenario tests
- Active PayMongo endpoint/import audit
- Xendit provider discriminator audit
- Environment-secret exclusion audit
- ZIP integrity validation

A full dependency-aware Next.js build was not possible from the supplied archive because it does not include `package.json`, a lockfile, or `tsconfig.json`. Run the final build inside the complete project repository before deployment.

## Security finding

The original uploaded archive contained live-looking `.env` and `.env.production` files. They are excluded from the returned project package.

Rotate all credentials that appeared in the upload, including database, authentication, PayMongo, webhook, Centrifugo, cron, and any other secret values. Do not reuse the previous secrets for Xendit production deployment.
