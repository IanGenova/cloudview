import 'server-only';

export type GuestReturnFlow = 'food' | 'service';
export type GuestReturnResult = 'success' | 'cancelled' | 'failed';

function readAbsoluteUrl(value: string | undefined, variableName: string) {
  const normalized = value?.trim();

  if (!normalized) {
    throw new Error(`${variableName} is not configured.`);
  }

  try {
    return new URL(normalized);
  } catch {
    throw new Error(`${variableName} must be an absolute URL.`);
  }
}

function getXenditPublicUrl() {
  const url = readAbsoluteUrl(process.env.APP_URL, 'APP_URL');

  if (url.protocol !== 'https:') {
    throw new Error(
      'APP_URL must use HTTPS because Xendit return URLs must be public HTTPS URLs.'
    );
  }

  return url;
}

function getGuestAppUrl() {
  const url = readAbsoluteUrl(
    process.env.NEXT_PUBLIC_APP_URL,
    'NEXT_PUBLIC_APP_URL'
  );

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('NEXT_PUBLIC_APP_URL must use HTTP or HTTPS.');
  }

  return url;
}

export function buildGuestXenditReturnUrl(input: {
  tagCode: string;
  sessionId: string;
  flow: GuestReturnFlow;
  result: GuestReturnResult;
}) {
  const url = new URL('/api/xendit/guest-return', getXenditPublicUrl());

  url.searchParams.set('tag', input.tagCode);
  url.searchParams.set('session', input.sessionId);
  url.searchParams.set('flow', input.flow);
  url.searchParams.set('result', input.result);

  return url.toString();
}

export function buildGuestPaymentDestinationUrl(input: {
  tagCode: string;
  sessionId: string;
  flow: GuestReturnFlow;
  result: GuestReturnResult;
}) {
  const destination = new URL(
    `/t/${encodeURIComponent(input.tagCode)}/payment`,
    getGuestAppUrl()
  );

  destination.searchParams.set('session', input.sessionId);
  destination.searchParams.set('flow', input.flow);
  destination.searchParams.set('result', input.result);

  return destination;
}