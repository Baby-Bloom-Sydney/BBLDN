// S-X-10 · S-X-11 as executable claims (04 §6.1; `01.17` · `01.18` · `02.14`): browse lists every marketplace-safe
// nanny most experienced first with the DBS badge, keeps the lead magnet (ADR-056) pointing at S-X-03, and
// sends a signed-in parent's cards to S-P-07; empty and error are lines with one action, never blank. The profile
// shows the guest CTAs of T-1.8b/d — "Sign up to see availability" → S-X-06, Connect → the one entry point —
// hides availability from a guest, shows it to a parent, and never shows a rate. Plus the two parsers and the
// path pinning between `public-site`'s register and `matching`'s routes.
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FUNNEL_PATHS } from "@/modules/matching";
import type { PublicNanny } from "@/modules/matching";
import type { NannyId } from "@/modules/shared-types";
import { BrowseNannies } from "../components/BrowseNannies";
import { NannyProfile } from "../components/NannyProfile";
import { parseFunnelQuery } from "../lib/parse-funnel-query";
import { parseAreaQuery } from "../lib/parse-area-query";
import { PUBLIC_ROUTES } from "../lib/public-routes";

const connectAction = vi.fn(async () => undefined as never);
const NANNY_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as NannyId;

const nanny = (id: string, over: Partial<PublicNanny> = {}): PublicNanny => ({
  nannyId: id as NannyId,
  firstName: "Amara",
  area: { area: "Clapham", district: "SW4" },
  photoUrl: null,
  bio: "Early-years nanny.",
  yearsExperience: 4,
  qualification: "Level 3 childcare",
  certificates: ["Paediatric first aid"],
  languages: ["English", "French"],
  hasCar: false,
  hasDrivingLicence: true,
  isNonSmoker: true,
  comfortableWithPets: null,
  availability: [{ day: 0, part: "morning" }],
  availableFrom: null,
  verificationLevel: "L3_PROVISIONALLY_VERIFIED",
  ...over,
});

describe("S-X-10 — BrowseNannies", () => {
  it("lists nannies most experienced first with the badge, and keeps the lead magnet → S-X-03", () => {
    render(
      <BrowseNannies
        nannies={[
          nanny("b", { firstName: "Bea", yearsExperience: 1 }),
          nanny(NANNY_A, { yearsExperience: 6 }),
        ]}
        viewer="guest"
        serviceAreaName="Somewhere"
        matchmakingHref={FUNNEL_PATHS.onboarding}
      />,
    );
    const names = screen
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    expect(names).toEqual(["Amara", "Bea"]);
    expect(screen.getAllByText("DBS")).toHaveLength(2);
    expect(
      screen.getByRole("link", { name: "Try Free Matchmaking" }),
    ).toHaveAttribute("href", "/matchmaking/onboarding");
    expect(
      screen.getByRole("link", { name: "See Amara's profile" }),
    ).toHaveAttribute("href", `/nannies/${NANNY_A}`);
  });

  it("sends a signed-in parent's cards to S-P-07", () => {
    render(
      <BrowseNannies
        nannies={[nanny(NANNY_A)]}
        viewer="parent"
        serviceAreaName="Somewhere"
        matchmakingHref="/x"
      />,
    );
    expect(
      screen.getByRole("link", { name: "See Amara's profile" }),
    ).toHaveAttribute("href", `/parent/browse/${NANNY_A}`);
  });

  it("empty is a line with one action; error is announced with a retry", () => {
    const { rerender } = render(
      <BrowseNannies
        nannies={[]}
        viewer="guest"
        serviceAreaName="Somewhere"
        matchmakingHref="/x"
      />,
    );
    expect(
      screen.getByText(/Nannies near you are being added/),
    ).toBeInTheDocument();
    rerender(
      <BrowseNannies
        nannies={[]}
        viewer="guest"
        serviceAreaName="Somewhere"
        matchmakingHref="/x"
        failed
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "We couldn't load the nannies",
    );
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
      "href",
      "/nannies",
    );
  });
});

describe("S-X-11 — NannyProfile", () => {
  it("guest: sign-up CTAs, Connect through the entry point, availability withheld, no rate", () => {
    const { container } = render(
      <NannyProfile
        nanny={nanny(NANNY_A)}
        viewer="guest"
        connectAction={connectAction}
        leadId={null}
        src="std"
      />,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Amara",
    );
    expect(screen.getByText("Clapham, SW4")).toBeInTheDocument();
    expect(screen.getByText("Enhanced DBS-checked")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Sign up to see availability" }),
    ).toHaveAttribute("href", "/signup?src=std");
    expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute(
      "href",
      "/signup?src=std",
    );
    const form = screen
      .getByRole("button", { name: "Connect with Amara" })
      .closest("form");
    expect(form?.querySelector("input[name='nannyId']")).toHaveAttribute(
      "value",
      NANNY_A,
    );
    expect(form?.querySelector("input[name='surface']")).toHaveAttribute(
      "value",
      "browse",
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\u00a3|per hour|\/h\b/);
  });

  it("parent: the availability grid shows, the sign-up CTAs do not", () => {
    render(
      <NannyProfile
        nanny={nanny(NANNY_A)}
        viewer="parent"
        connectAction={connectAction}
        leadId={null}
        src={null}
      />,
    );
    expect(
      screen.getByRole("table", { name: /Amara is available/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Sign up" }),
    ).not.toBeInTheDocument();
  });
});

describe("public-site — the two parsers", () => {
  it("parseFunnelQuery keeps std|adv and a uuid lead, drops the rest", () => {
    const lead = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    expect(parseFunnelQuery({ src: "adv", lead })).toEqual({
      src: "adv",
      lead,
    });
    expect(parseFunnelQuery({ src: "evil", lead: "1; drop" })).toEqual({
      src: null,
      lead: null,
    });
    expect(parseFunnelQuery({ src: ["std"] })).toEqual({
      src: null,
      lead: null,
    });
  });

  it("parseAreaQuery trims, caps and treats empty as list-all", () => {
    expect(parseAreaQuery(new URLSearchParams("q=  cla "))).toEqual({
      q: "cla",
    });
    expect(parseAreaQuery(new URLSearchParams("q="))).toEqual({ q: null });
    expect(
      parseAreaQuery(new URLSearchParams({ q: "x".repeat(200) })).q?.length,
    ).toBe(40);
  });
});

describe("public-site ↔ matching — the shared routes cannot drift (04 §2.1)", () => {
  it("pins the register's funnel paths to FUNNEL_PATHS", () => {
    const pathOf = (id: string) =>
      PUBLIC_ROUTES.find((route) => route.id === id)?.path;
    expect(pathOf("S-X-02")).toBe(FUNNEL_PATHS.results);
    expect(pathOf("S-X-03")).toBe(FUNNEL_PATHS.onboarding);
    expect(pathOf("S-X-04")).toBe(FUNNEL_PATHS.matches);
    expect(pathOf("S-X-05")).toBe(FUNNEL_PATHS.matchmakingSignup);
    expect(pathOf("S-X-06")).toBe(FUNNEL_PATHS.signup);
    expect(PUBLIC_ROUTES.find((route) => route.id === "S-X-11")?.prefix).toBe(
      `${FUNNEL_PATHS.nannyProfile}/`,
    );
  });
});
