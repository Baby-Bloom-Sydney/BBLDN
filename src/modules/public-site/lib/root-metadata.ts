// 01.01 / 01.25 — the root `metadata`: brand, base URL and locale from `config` only (L4; ADR-033, ADR-029).
// The icon links are declared so Safari stops probing the two `apple-touch-icon` paths on every load.
import type { Metadata } from "next";
import { BRAND, LOCALE, URLS } from "@/modules/config";
import { PUBLIC_ROUTES } from "./public-routes";

const home = PUBLIC_ROUTES.find((route) => route.id === "S-X-01");
if (home === undefined) throw new Error("public-site: S-X-01 missing");

export const rootMetadata: Metadata = {
  metadataBase: new URL(URLS.app),
  title: {
    template: `%s | ${BRAND.name}`,
    default: home.title,
  },
  description: home.description,
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/logo.svg",
  },
  openGraph: {
    siteName: BRAND.longName,
    locale: LOCALE.locale.replace("-", "_"),
    type: "website",
  },
};
