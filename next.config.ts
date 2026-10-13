import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    // Lint is a real gate now: the flat config carries TypeScript-aware rules,
    // so keeping `ignoreDuringBuilds: true` would have thrown that away.
    // CI also runs `npm run lint` explicitly.
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  // Allow access to remote image placeholder.
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**', // This allows any path under the hostname
      },
      {
        protocol: 'https',
        hostname: 'warcraft.wiki.gg',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'wow.zamimg.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
  transpilePackages: ['motion'],
  webpack: (config, {dev}) => {
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    // Do not modify—file watching is disabled to prevent flickering during agent edits.
    if (dev && process.env.DISABLE_HMR === 'true') {
      config.watchOptions = {
        ignored: /.*/,
      };
    }
    if (dev) {
      // Persistent FS cache (PackFileCacheStrategy) OOMs on this codebase's
      // route graph when accumulating .next/cache/webpack packs across hot
      // reloads. Keep HMR/rebuild fast by relying on the in-memory cache only.
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;
