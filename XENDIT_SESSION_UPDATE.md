# Xendit Payment Session Update

This update applies one consistent Payment Session policy to:

- Guest food ordering
- Guest service requests
- Dashboard POS
- Front-desk guest-stay checkout

## Session decision policy

Before a new Xendit Payment Session is created, CloudView now checks the matching pending local session and its current Xendit status:

- **ACTIVE + same payment intent:** continue with the exact existing checkout URL.
- **COMPLETED:** synchronize the payment locally and continue confirmation/finalization.
- **EXPIRED or CANCELED:** close the local pending record and create a replacement.
- **Changed cart/charges:** cancel the old ACTIVE Xendit session first, then create a replacement.
- **Still preparing:** temporarily block duplicate creation while the first request is finishing.
- **Unverifiable but locally unexpired:** keep using the stored link instead of risking a duplicate payable session.

A deterministic payment-intent fingerprint is stored with each session so the server can decide whether a returning user is continuing the same payment or has changed the transaction.

## Browser-back and cancel handling

POS and guest service checkout store the local payment-session ID in browser session storage. Returning from or backing out of Xendit therefore reuses the same session when it is still valid.

Cancel-return actions now verify the remote Xendit state before marking a local session canceled. A payment that completed during a cancel race is synchronized as paid and is never overwritten as canceled.

## Webhooks

The webhook handler now accepts successful Payment Session lifecycle notifications through:

- `payment_session.completed`
- `payment.succeeded`
- `payment.capture`

Existing `payment_session.expired`, failure, and refund handling remains in place.

## Local verification

Run these commands in an environment with internet access and the project database configuration:

```bash
npm install
npx prisma generate
npm run build
```

No Prisma schema change or database migration is required for this update.
