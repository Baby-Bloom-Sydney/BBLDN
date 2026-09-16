// 05 §8.3 — `/robots.txt` disallows `/parent`, `/nanny`, `/admin`, `/api`, `/invite`, `/subscribe-for`, plus the
// register's `noindex` screens; the sitemap URL is built on the one base URL (L4).
import type { MetadataRoute } from "next";
import { URLS } from "@/modules/config";
import { PUBLIC_ROUTES } from "./public-routes";

const PRIVATE_PREFIXES: ReadonlyArray<string> = Object.freeze([
  "/parent",
  "/nanny",
  "/admin",
  "/api",
  "/invite",
  "/subscribe-for",
]);

export function buildRobots(): MetadataRoute.Robots {
  const noindexPaths = PUBLIC_ROUTES.filter((route) => !route.index).map(
    (route) => route.path,
  );
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [...PRIVATE_PREFIXES, ...new Set(noindexPaths)],
      },
    ],
    sitemap: `${URLS.app}/sitemap.xml`,
  };
}
