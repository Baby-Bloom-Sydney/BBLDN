// Header + footer (01.02 · 01.03): brand from config, nav from the register, the right-hand side rendered from
// the pathname alone (01 §4d "defence in depth") — no auth context is consulted, so none is mocked.
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BRAND, URLS } from "@/modules/config";
import { PublicHeader } from "../components/PublicHeader";
import { PublicFooter } from "../components/PublicFooter";

const state = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));

beforeEach(() => {
  state.pathname = "/";
});

describe("public-site — PublicHeader (01.02)", () => {
  it("names the brand from config and links home", () => {
    render(<PublicHeader />);
    const home = screen.getByRole("link", {
      name: `${BRAND.longName} — home`,
    });
    expect(home).toHaveAttribute("href", "/");
    expect(home).toHaveTextContent(BRAND.name);
  });

  it("always shows Sign in and Get started, whatever the session", () => {
    render(<PublicHeader />);
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.getByRole("link", { name: "Get started" })).toHaveAttribute(
      "href",
      "/signup",
    );
  });

  it("marks the current page in the main navigation from the pathname", () => {
    state.pathname = "/about";
    render(<PublicHeader />);
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    const about = screen.getByRole("link", { name: "About" });
    expect(nav).toContainElement(about);
    expect(about).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByRole("link", { name: "Our service" }),
    ).not.toHaveAttribute("aria-current");
  });
});

describe("public-site — PublicFooter (01.03)", () => {
  it("links the legal pages from URLS.paths.legal and names the brand", () => {
    render(<PublicFooter />);
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute(
      "href",
      URLS.paths.legal.privacy,
    );
    expect(screen.getByRole("link", { name: "Client terms" })).toHaveAttribute(
      "href",
      URLS.paths.legal.clientTerms,
    );
    expect(screen.getByRole("link", { name: "Contact us" })).toHaveAttribute(
      "href",
      URLS.paths.support,
    );
    expect(
      screen.getByText(`© ${new Date().getFullYear()} ${BRAND.longName}`),
    ).toBeInTheDocument();
  });
});
