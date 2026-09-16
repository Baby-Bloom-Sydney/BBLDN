// 05 §8.3 — every live S-X page has a unique title, description, canonical URL and OG tags, from the register.
// The root layout's `metadataBase` (root-metadata.ts) resolves the relative canonical against `URLS.app`.
import type { Metadata } from "next";
import { PUBLIC_ROUTES } from "./public-routes";

export function publicPageMetadata(path: string): Metadata {
  const route = PUBLIC_ROUTES.find((candidate) => candidate.path === path);
  if (route === undefined)
    throw new Error(`public-site: no register row for path ${path}`);
  const title = route.absoluteTitle ? { absolute: route.title } : route.title;
  return {
    title,
    description: route.description,
    alternates: { canonical: route.path },
    openGraph: {
      title: route.title,
      description: route.description,
      url: route.path,
    },
    ...(route.index ? {} : { robots: { index: false, follow: false } }),
  };
}
