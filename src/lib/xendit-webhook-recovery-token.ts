import 'server-only';

/**
 * Module-private capability used to keep trusted payment recovery functions
 * inaccessible through their generated Server Action endpoints. Browser calls
 * cannot serialize or recreate this object identity.
 */
export const XENDIT_WEBHOOK_RECOVERY_TOKEN = Object.freeze({
  scope: 'cloudview-xendit-webhook-recovery',
});

export function assertXenditWebhookRecoveryToken(token: unknown) {
  if (token !== XENDIT_WEBHOOK_RECOVERY_TOKEN) {
    throw new Error('Forbidden trusted Xendit recovery call.');
  }
}
