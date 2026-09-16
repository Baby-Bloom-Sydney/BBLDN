// The register and what is generated from it (04 §2.1; 05 §8.3): unique paths, the index rule, robots'
// disallow set, the sitemap on the one base URL, page metadata from the register, root metadata from config.
import { describe, expect, it } from "vitest";
import { BRAND, LOCALE, URLS } from "@/modules/config";
import { PUBLIC_ROUTES } from "../lib/public-routes";
import { isPublicSitePath } from "../lib/is-public-site-path";
import { publicPageMetadata } from "../lib/public-page-metadata";
import { rootMetadata } from "../lib/root-metadata";
import { buildRobots } from "../lib/build-robots";
import { buildSitemap } from "../lib/build-sitemap";

const NOINDEX_PATHS = ["/login", "/forgot-password", "/apply"];
const PRIVATE_PREFIXES = [
  "/parent",
  "/nanny",
  "/admin",
  "/api",
  "/invite",
  "/subscribe-for",
];

describe("public-site — the route register (04 §2.1)", () => {
  it("has unique paths and only S-X ids", () => {
    const paths = PUBLIC_ROUTES.map((route) => route.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const route of PUBLIC_ROUTES) expect(route.id).toMatch(/^S-X-\d\d$/);
  });

  it("marks the 05 §8.3 noindex screens and nothing public", () => {
    for (const route of PUBLIC_ROUTES) {
      expect(route.index, route.path).toBe(!NOINDEX_PATHS.includes(route.path));
    }
  });

  it("gives every live page a unique title and description", () => {
    const titles = PUBLIC_ROUTES.map((route) => `${route.title}|${route.path}`);
    expect(new Set(titles).size).toBe(titles.length);
    for (const route of PUBLIC_ROUTES) {
      expect(route.description.length).toBeGreaterThan(20);
    }
  });

  it("knows which pathnames wear the public chrome", () => {
    expect(isPublicSitePath("/")).toBe(true);
    expect(isPublicSitePath("/about")).toBe(true);
    expect(isPublicSitePath("/nannies/abc")).toBe(true);
    expect(isPublicSitePath("/legal/privacy-policy")).toBe(true);
    expect(isPublicSitePath("/login")).toBe(false);
    expect(isPublicSitePath("/results")).toBe(false);
    expect(isPublicSitePath("/parent")).toBe(false);
  });
});

describe("public-site — robots + sitemap (05 §8.3)", () => {
  it("disallows the six private prefixes and the noindex paths, and points at the one base URL", () => {
    const robots = buildRobots();
    const rule = Array.isArray(robots.rules) ? robots.rules[0] : robots.rules;
    const disallow = rule?.disallow ?? [];
    for (const prefix of PRIVATE_PREFIXES) expect(disallow).toContain(prefix);
    for (const path of NOINDEX_PATHS) expect(disallow).toContain(path);
    expect(robots.sitemap).toBe(`${URLS.app}/sitemap.xml`);
  });

  it("lists every indexable static route on the base URL and no noindex or dynamic one", () => {
    const urls = buildSitemap().map((entry) => entry.url);
    expect(urls).toContain(URLS.app);
    expect(urls).toContain(`${URLS.app}/about`);
    expect(urls).toContain(`${URLS.app}/pricing`);
    expect(urls).toContain(`${URLS.app}${URLS.paths.legal.privacy}`);
    for (const url of urls) expect(url.startsWith(URLS.app)).toBe(true);
    for (const path of NOINDEX_PATHS)
      expect(urls).not.toContain(`${URLS.app}${path}`);
    expect(urls.some((url) => url.includes("[id]"))).toBe(false);
    expect(new Set(urls).size).toBe(urls.length);
  });
});

describe("public-site — metadata from config (05 §8.3; L4)", () => {
  it("builds the root metadata on the one base URL with the brand and locale", () => {
    expect(String(rootMetadata.metadataBase)).toBe(`${URLS.app}/`);
    expect(rootMetadata.title).toEqual(
      expect.objectContaining({ template: `%s | ${BRAND.name}` }),
    );
    expect(rootMetadata.openGraph).toEqual(
      expect.objectContaining({
        siteName: BRAND.longName,
        locale: LOCALE.locale.replace("-", "_"),
      }),
    );
  });

  it("gives a page its canonical, OG tags and the noindex rule from the register", () => {
    const about = publicPageMetadata("/about");
    expect(about.alternates).toEqual({ canonical: "/about" });
    expect(about.openGraph).toEqual(
      expect.objectContaining({ url: "/about", title: "About" }),
    );
    expect(about.robots).toBeUndefined();
    expect(publicPageMetadata("/login").robots).toEqual({
      index: false,
      follow: false,
    });
    expect(publicPageMetadata("/").title).toEqual({
      absolute: expect.stringContaining(BRAND.longName),
    });
    expect(() => publicPageMetadata("/no-such-route")).toThrow();
  });
});
