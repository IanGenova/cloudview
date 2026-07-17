import 'server-only';

/**
 * Next.js implements redirect() as an internal control-flow exception.
 * It must not be treated as a payment fulfillment failure, refund trigger,
 * or paid-session review failure.
 */
export function isNextRedirectError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as {
    message?: unknown;
    digest?: unknown;
  };

  const message = String(candidate.message ?? '');
  const digest = String(candidate.digest ?? '');

  return (
    message === 'NEXT_REDIRECT' ||
    message.startsWith('NEXT_REDIRECT;') ||
    digest === 'NEXT_REDIRECT' ||
    digest.startsWith('NEXT_REDIRECT;')
  );
}
