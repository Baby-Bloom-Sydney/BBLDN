/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // strict: build fails on TS errors
    ignoreBuildErrors: false,
  },
  // No redirects: `/signup/nanny` is S-X-07 and `/nanny/register` is S-N-18 (04 §2.1 / §2.3) — the two Sydney
  // redirects that contradicted them were removed by L-008 `2a` (kickoff §2 debt 1).
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
        // The one Supabase project (01 §3.2 rule 2 — per-environment values come from env), never a literal.
        hostname: new URL(
          process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost",
        ).hostname,
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
