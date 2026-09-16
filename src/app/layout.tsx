// 01.01 — the root layout and global providers. Brand, base URL and locale come from `config` (L4); the
// Sydney Sentry CDN loader (hardcoded DSN) is gone — ADR-106's error capture is injected at boot (03 §4b), not here.
import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { LOCALE, PUBLIC_FLAGS } from "@/modules/config";
import { AREAS_SOURCE } from "@/modules/config/server";
import {
  JsonLd,
  organizationJsonLd,
  rootMetadata,
} from "@/modules/public-site";
import { fontClassNames } from "./fonts";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { DevToolbar } from "@/components/dev/DevToolbar";
import { DevSidebar } from "@/components/dev/DevSidebar";
import { KatieShell } from "@/components/katie/KatieShell";
import { CookieConsentBanner } from "@/components/legal/CookieConsentBanner";
import { MiniFooter } from "@/components/layout/MiniFooter";

export const metadata: Metadata = rootMetadata;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang={LOCALE.locale} className="overflow-x-hidden">
      <body className={`${fontClassNames} overflow-x-hidden antialiased`}>
        <JsonLd data={organizationJsonLd(AREAS_SOURCE.serviceAreaName)} />
        <SessionProvider>
          {PUBLIC_FLAGS.DEV_MODE && <DevSidebar />}
          <KatieShell footer={<MiniFooter />}>{children}</KatieShell>
          <Analytics />
          <CookieConsentBanner />
          {PUBLIC_FLAGS.DEV_MODE && <DevToolbar />}
        </SessionProvider>
      </body>
    </html>
  );
}
