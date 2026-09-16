// 05 §8.3 — `/sitemap.xml` lists every live, indexable S-X route from the register, on the one base URL (L4).
// Dynamic screens (S-X-11 · S-X-12) have a `[param]` in their path and no crawlable URL of their own; their
// per-id entries wait on the nanny / position reads (L-007 PROGRESS, 1a gap 1).
import type { MetadataRoute } from "next";
import { URLS } from "@/modules/config";
import type { PublicRoute } from "../types";
import { PUBLIC_ROUTES } from "./public-routes";

type Weight = {
  readonly changeFrequency: "daily" | "weekly" | "monthly" | "yearly";
  readonly priority: number;
};

const weightOf = (route: PublicRoute): Weight => {
  if (route.id === "S-X-01") return { changeFrequency: "weekly", priority: 1 };
  if (route.id === "S-X-10") return { changeFrequency: "daily", priority: 0.9 };
  if (route.id === "S-X-25")
    return { changeFrequency: "yearly", priority: 0.3 };
  if (route.group === "public")
    return { changeFrequency: "monthly", priority: 0.7 };
  return { changeFrequency: "monthly", priority: 0.5 };
};

export function buildSitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.filter(
    (route) => route.index && !route.path.includes("["),
  ).map((route) => ({
    url: `${URLS.app}${route.path === "/" ? "" : route.path}`,
    ...weightOf(route),
  }));
}
