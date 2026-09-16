// 05 §8.3 — generated from the route register, never hand-written. Per-nanny and per-position entries wait
// on the reads those screens need (L-007 PROGRESS, 1a gap 1).
import type { MetadataRoute } from "next";
import { buildSitemap } from "@/modules/public-site";

export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemap();
}
