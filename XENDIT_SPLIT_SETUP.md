# Cloud View Hotel — Xendit Setup and Deployment Guide

Date: July 13, 2026

## 1. Xendit products to activate

Ask Xendit to enable the following for the Cloud View account:

- Payment Sessions / hosted checkout
- Required Philippine channels: Cards, GCash, Maya, QRPh, ShopeePay, GrabPay
- xenPlatform master account
- Hotel sub-accounts
- Split Payments / Split Rules
- Refunds for supported channels
- Payouts only if Cloud View will send deliberate bank/e-wallet withdrawals

Every hotel that receives settlement through a sub-account must complete Xendit's applicable onboarding, KYC, and capability activation.

## 2. Environment variables

Copy the Xendit section from `.env.example` into the real server environment:

```env
XENDIT_SECRET_KEY=xnd_development_replace_me
XENDIT_WEBHOOK_TOKEN=replace-with-the-token-from-xendit-webhook-settings
XENDIT_LIVEMODE=false

XENDIT_PAYMENT_METHODS=CARDS,GCASH,QRPH,SHOPEEPAY,GRABPAY,PAYMAYA
XENDIT_GUEST_PAYMENT_METHODS=GCASH,QRPH,SHOPEEPAY,GRABPAY,PAYMAYA

XENDIT_MASTER_ACCOUNT_ID=5f27a14a9bf05c73dd040bc8

XENDIT_AUTO_REFUND_ON_FULFILLMENT_FAILURE=true
XENDIT_REFUND_CRON_SECRET=replace-with-a-long-random-secret

POS_XENDIT_RETURN_URL=https://your-cloudview-domain.example
```

Rules:

- Never prefix the secret key or webhook token with `NEXT_PUBLIC_`.
- Development keys begin with `xnd_development_`.
- Production keys begin with `xnd_production_`.
- Set `XENDIT_LIVEMODE=true` only with a production key.
- `XENDIT_MASTER_ACCOUNT_ID` is the 24-character Business ID of the Cloud View xenPlatform master account.
- Leave either payment-method variable empty to let Xendit show every compatible channel activated on the account.
- Use HTTPS public URLs in production.

## 3. Configure the webhook

Use this public endpoint:

```text
https://your-cloudview-domain.example/api/xendit/webhook
```

Subscribe/configure the relevant Xendit webhook groups for:

- Payments
- Payment Sessions
- Refunds
- Split Payments

Copy the webhook verification token from Xendit Dashboard into `XENDIT_WEBHOOK_TOKEN`.

The endpoint must be publicly reachable by Xendit. A LAN IP or localhost address is insufficient for real webhooks. Use a staging HTTPS domain or an approved tunnel for development testing.

## 4. Run the database migration

Back up the production database first, then run inside the complete Cloud View repository:

```bash
npx prisma migrate deploy
npx prisma generate
npm run build
```

The included migration assumes the existing PayMongo session/settings tables already exist. Test it first against a staging clone of the real database.

## 5. Configure each hotel

Log in as `SUPER_ADMIN` and open:

```text
Dashboard -> Settings -> Select Hotel -> Xendit Split Settlement
```

Enter:

- **Enable split**: On
- **Hotel Linked Account ID**: the hotel's 24-character xenPlatform Business ID
- **Commission Type**: Percentage commission or Fixed amount
- **Cloud View Commission Value**: e.g. `10` for 10%, or `50` for PHP 50
- **Processing Fee Bearer**: Hotel or Cloud View

Save the hotel settings before creating a checkout.

### Fee bearer behavior

**Hotel**

- Payment is created on the hotel sub-account.
- Cloud View commission is routed to the master account.
- Hotel/source balance pays Xendit fees and tax.

**Cloud View**

- Payment is created on the Cloud View master account.
- Hotel share is routed to the hotel sub-account.
- Cloud View/source balance pays Xendit fees and tax.

A Split Rule must always leave enough balance on the source account for Xendit fees and tax. Never configure a 100% route. Fixed commission/share settings also need sufficient remainder.

## 6. Test-mode checklist

Test each flow separately:

1. Dashboard POS
2. Guest food order
3. Guest service request
4. Guest-stay folio checkout

For each flow, verify:

- Payment Session is created
- Hosted checkout opens
- Correct hotel and amount are displayed
- Successful payment sends `payment.capture`
- Cloud View changes the session to paid/completed only after webhook validation
- Order/service/POS/checkout finalizes only once
- Duplicate webhook delivery does not duplicate fulfillment
- `split.payment` becomes `COMPLETED`
- Split amount and destination match the hotel configuration
- Xendit failure leaves the transaction retryable
- Expired checkout releases staged resources
- Refund works for a refundable wallet/card channel
- QRPh refund is held for manual handling

Test both split directions:

- Hotel bears fee
- Cloud View bears fee

Test both commission modes:

- Percentage
- Fixed

## 7. Production cutover

Before switching to live mode:

- Confirm all hotel sub-accounts are live and can receive transfers
- Confirm every selected payment channel is activated
- Confirm the master Business ID and every hotel Business ID
- Replace development key with production key
- Set `XENDIT_LIVEMODE=true`
- Use the production webhook token
- Use HTTPS return URLs
- Run a low-value real transaction for every important channel
- Reconcile Xendit Dashboard, Cloud View records, and hotel balances
- Keep PayMongo disabled but preserve its historical rows for reporting

## 8. Refund and split accounting policy

Xendit does not automatically reverse an earlier split when the original payment is refunded. Adopt one written policy before launch:

- Deduct the hotel's previously routed share from its next settlement
- Maintain a hotel reserve balance
- Create a compensating transfer
- Require manual finance settlement

QRPh does not support API refunds. A QRPh refund must be paid manually and recorded against the Cloud View transaction.

## 9. Outgoing payouts

Split Payments and Payouts are different:

- **Split Rule**: routes settlement between Cloud View and hotel Xendit balances after customer payment
- **Payout**: sends available balance to an external bank or supported e-wallet destination

A server helper exists at `src/lib/xendit-payout.ts`, but automatic hotel withdrawals should remain disabled until the system has verified beneficiary data, payout approvals, a payout ledger, limits, and payout status webhooks.

## 10. Troubleshooting

### Checkout cannot be created

Check:

- `XENDIT_SECRET_KEY`
- live/development mode mismatch
- HTTPS return URL in production
- activated payment channels
- valid 24-character Business IDs
- hotel split configuration

### Payment succeeds but Cloud View shows review required

Compare:

- Gross amount
- PHP currency
- `py-...` Payment ID
- `pr-...` Payment Request ID
- internal reference/session ID

Do not manually mark a mismatched transaction complete until it has been reconciled.

### Payment succeeds but split fails

The customer payment remains valid. Check the split failure code, source balance, fees/tax remainder, destination account capabilities, and Split Rule configuration. Settle the hotel manually if necessary.

### Webhook returns 401

The incoming `x-callback-token` does not match `XENDIT_WEBHOOK_TOKEN`.

### Webhook returns 503

Cloud View intentionally asks Xendit to retry when processing or database reconciliation fails. Review server logs using the event ID returned by the endpoint.
