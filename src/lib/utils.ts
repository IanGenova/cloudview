import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

function normalizeBrowserOrigin(value: string | undefined) {
  const raw = String(value || '').trim();

  if (!raw) {
    return null;
  }

  try {
    const url = new URL(raw);
    const lanHost = String(process.env.NEXT_PUBLIC_LAN_IP || '').trim();

    if (['0.0.0.0', '::', '[::]'].includes(url.hostname)) {
      if (lanHost) {
        url.hostname = lanHost;
      } else {
        url.hostname = 'localhost';
      }
    }

    return url.origin;
  } catch {
    return null;
  }
}

export function appUrl() {
  const configured =
    normalizeBrowserOrigin(process.env.NEXT_PUBLIC_APP_URL) ||
    normalizeBrowserOrigin(process.env.APP_URL);

  if (configured) {
    return configured;
  }

  const lanHost = String(process.env.NEXT_PUBLIC_LAN_IP || '').trim();

  return lanHost ? `http://${lanHost}:3000` : 'http://localhost:3000';
}

export function publicAppUrl() {
  return appUrl();
}

export function nfcUrl(code: string) {
  return `${publicAppUrl()}/t/${encodeURIComponent(code)}`;
}

export function baseUrlFromHost(host: string | null, protocol = 'http') {
  if (!host) {
    return appUrl();
  }

  const normalizedHost = host.startsWith('0.0.0.0')
    ? host.replace('0.0.0.0', process.env.NEXT_PUBLIC_LAN_IP || 'localhost')
    : host;

  return `${protocol}://${normalizedHost}`.replace(/\/$/, '');
}

export function randomCode(prefix = 'CV') {
  const value = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${value}`;
}
