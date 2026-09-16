// 05 §8.3 — generated from the route register, never hand-written.
import type { MetadataRoute } from "next";
import { buildRobots } from "@/modules/public-site";

export default function robots(): MetadataRoute.Robots {
  return buildRobots();
}
