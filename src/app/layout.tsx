// 01.01 — the root layout and global providers. Brand, base URL and locale come from `config` (L4); the
// Sydney Sentry CDN loader (hardcoded DSN) is gone — ADR-106's error capture is injected at boot (03 §4b), not here.
import type { Metadata } from "next";
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
import { AnalyticsScripts } from "@/components/legal/AnalyticsScripts";
import { ConsentGate } from "@/components/legal/ConsentGate";
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
          {/* ADR-175 (c): the analytics loader is mounted by JavaScript, only after a choice exists and only
              if that choice was yes. It sat here unconditionally until `3g`. The CSP does not enforce this —
              07 §10.3 says so in as many words — so this component is the control. */}
          <ConsentGate category="analytics">
            <AnalyticsScripts />
          </ConsentGate>
          <CookieConsentBanner />
          {PUBLIC_FLAGS.DEV_MODE && <DevToolbar />}
        </SessionProvider>
      </body>
    </html>
  );
}
