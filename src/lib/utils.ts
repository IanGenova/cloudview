import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

export function publicAppUrl() {
  const rawUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const lanIp = process.env.NEXT_PUBLIC_LAN_IP;

  if (rawUrl.includes('0.0.0.0')) {
    if (lanIp) return `http://${lanIp}:3000`;
    return 'http://localhost:3000';
  }

  return rawUrl.replace(/\/$/, '');
}

export function nfcUrl(code: string) {
  return `${publicAppUrl()}/t/${code}`;
}

export function baseUrlFromHost(host: string | null, protocol = 'http') {
  const fallback = appUrl();
  if (!host) return fallback;
  return `${protocol}://${host}`.replace(/\/$/, '');
}

export function randomCode(prefix = 'CV') {
  const value = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${value}`;
}
