const lanHost = process.env.NEXT_PUBLIC_LAN_IP || '192.168.0.130';

/*
 * ALLOWED_DEV_ORIGINS and SERVER_ACTION_ALLOWED_ORIGINS are documented in
 * .env.example and were read by nothing. Both lists were built from lanHost
 * plus localhost literals, so an operator who set their production domain in
 * either variable changed nothing at all -- and the server-action origin
 * allowlist, which is the one that matters, never contained the production
 * origin on any deployment.
 *
 * Comma-separated, trimmed, empties dropped. The built-in local entries stay
 * so a developer who sets neither variable still has a working dev server.
 */
function fromEnv(name) {
  return (process.env[name] || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/* A bare host for allowedDevOrigins, which does not want a scheme. */
function bareHost(value) {
  try {
    return new URL(value).host;
  } catch {
    return value.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  }
}

const allowedDevOrigins = [
  ...fromEnv('ALLOWED_DEV_ORIGINS').map(bareHost),
  lanHost,
  'localhost',
  '127.0.0.1',
].filter((value, index, all) => value && all.indexOf(value) === index);

const serverActionAllowedOrigins = [
  ...fromEnv('SERVER_ACTION_ALLOWED_ORIGINS').flatMap((entry) => [
    entry,
    bareHost(entry),
  ]),

  lanHost,
  `${lanHost}:3000`,
  `http://${lanHost}:3000`,
  `https://${lanHost}:3000`,

  'localhost',
  'localhost:3000',
  `http://localhost:3000`,
  `https://localhost:3000`,

  '127.0.0.1',
  '127.0.0.1:3000',
  `http://127.0.0.1:3000`,
  `https://127.0.0.1:3000`,
].filter((value, index, all) => value && all.indexOf(value) === index);

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins,

  // Important for PDFKit.
  // This prevents Next/Turbopack from bundling pdfkit and breaking its Helvetica.afm path.
  serverExternalPackages: ['pdfkit'],

  experimental: {
    serverActions: {
      allowedOrigins: serverActionAllowedOrigins,
      bodySizeLimit: '50mb',
    },
  },

  images: {
    /**
     * Only hosts we actually serve images from.
     *
     * A `hostname: '**'` wildcard turns /_next/image into an open proxy for the
     * whole public internet: any URL can be fetched by the server and re-served
     * from our own domain.
     */
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
      },
      {
        protocol: 'http',
        hostname: lanHost,
      },
      {
        protocol: 'https',
        hostname: lanHost,
      },
    ],
  },
};

export default nextConfig;