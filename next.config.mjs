/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // strict: build fails on TS errors
    ignoreBuildErrors: false,
  },
  async redirects() {
    return [
      { source: "/signup/nanny", destination: "/apply/nanny", permanent: true },
      {
        source: "/nanny/register",
        destination: "/nanny/profile",
        permanent: true,
      },
    ];
  },
  experimental: {
    serverComponentsExternalPackages: ["sharp"],
    // Runs `src/instrumentation.ts` at start-up so `config/env.ts` parses the environment at boot rather than
    // on the first request — the mechanism behind the `stub-stripe` production guard (07 §5.5 item 2, ADR-108).
    instrumentationHook: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "umkqevipzmoovyrnynrf.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "randomuser.me",
        pathname: "/api/portraits/**",
      },
    ],
  },
};

export default nextConfig;
