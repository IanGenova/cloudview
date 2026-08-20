const lanHost = process.env.NEXT_PUBLIC_LAN_IP || '192.168.0.130';

const allowedDevOrigins = [
  lanHost,
  'localhost',
  '127.0.0.1',
];

const serverActionAllowedOrigins = [
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
];

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