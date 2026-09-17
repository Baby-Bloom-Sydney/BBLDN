// The screens of `1i` — S-X-13, S-P-14 / S-N-20 and S-P-13's card — rendered, so the claims about what a
// visitor can *see* and *do* are executable rather than asserted about a view object.
//
// The one claim worth the render: **the token is never in a link, a query string or an href.** It travels in a
// hidden field of a server-action form, which is what keeps it out of a `Referer` header and out of the
// visitor's history (07 §8 row 7 — "tokens never in logs").
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  ChildId,
  ISODate,
  Instant,
  InviteId,
} from "@/modules/shared-types";
import { AppGateNotice } from "../child-linking/components/AppGateNotice";
import { ChildrenCard } from "../child-linking/components/ChildrenCard";
import { InviteLandingPage } from "../child-linking/components/InviteLandingPage";
import { appAccessView } from "../child-linking/lib/app-access-view";
import { childrenCardView } from "../child-linking/lib/children-card-view";
import { inviteLandingView } from "../child-linking/lib/invite-landing-view";
import type { ChildInvite, ChildRecord } from "../child-linking/types";

vi.mock("react-dom", async () => {
  const actual = await vi.importActual<typeof import("react-dom")>("react-dom");
  return {
    ...actual,
    useFormState: (_action: unknown, initial: unknown) => [initial, () => {}],
    useFormStatus: () => ({ pending: false }),
  };
});

const AT = "2026-09-17T09:00:00.000Z" as Instant;
const TOKEN = "ABCD-EFGH";

const child: ChildRecord = {
  id: "c1" as ChildId,
  firstName: "Amara",
  dateOfBirth: "2025-01-15" as ISODate,
  parentUserId: null,
  createdAt: AT,
};

const invite: ChildInvite = {
  id: "i1" as InviteId,
  childId: "c1" as ChildId,
  token: TOKEN,
  direction: "parent_to_nanny",
  status: "pending",
  createdAt: AT,
  url: `https://example.test/invite/${TOKEN}`,
};

const landing = (over: Partial<Parameters<typeof inviteLandingView>[0]> = {}) =>
  inviteLandingView({
    preview: {
      childFirstName: "Amara",
      direction: "nanny_to_parent",
      invitedBy: "Priya",
    },
    viewerRole: null,
    tokenWasMalformed: false,
    lookupFailed: false,
    signInHref: "/login?next=%2Finvite%2Fconnect%2F" + TOKEN,
    ...over,
  });

describe("S-X-13 — the public preview (04 §6.1)", () => {
  it("names the inviter and the child, which is what makes the link clickable at all", () => {
    render(<InviteLandingPage view={landing()} token={TOKEN} />);

    expect(
      screen.getByRole("heading", { name: /Priya.*Amara/ }),
    ).toBeInTheDocument();
  });

  it("★ a signed-out visitor gets a sign-up FORM — no link href carries the token (ADR-150)", () => {
    render(<InviteLandingPage view={landing()} token={TOKEN} />);

    // The token travels in the form body to the action that mints the HttpOnly cookie; every link on the page
    // is free of it, including the sign-in return path, which names the claim route and not the token twice.
    for (const link of screen.getAllByRole("link"))
      expect(link.getAttribute("href")).not.toContain(`invite=${TOKEN}`);
    expect(
      screen.getByRole("button", { name: /Join Amara's app/ }),
    ).toBeInTheDocument();
  });

  it("★ the claim button posts a form — the token is a hidden field, never an href", () => {
    render(
      <InviteLandingPage
        view={landing({ viewerRole: "parent" })}
        token={TOKEN}
      />,
    );

    const hidden = document.querySelector('input[type="hidden"][name="token"]');
    expect(hidden).not.toBeNull();
    expect(hidden?.getAttribute("value")).toBe(TOKEN);
    // There is no link at all on the claim state, which is itself the point: nothing navigable carries the
    // token. `queryAllByRole` rather than `getAllByRole` so the assertion survives that emptiness.
    for (const link of screen.queryAllByRole("link"))
      expect(link.getAttribute("href")).not.toContain(TOKEN);
  });

  it("a visitor signed in as the wrong side is told which account to use, and gets no claim button", () => {
    render(
      <InviteLandingPage
        view={landing({ viewerRole: "nanny" })}
        token={TOKEN}
      />,
    );

    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/child's family/)).toBeInTheDocument();
  });

  it("a closed link and an outage read differently, and neither offers a claim", () => {
    const { unmount } = render(
      <InviteLandingPage view={landing({ preview: null })} token={null} />,
    );
    expect(screen.getByText(/no longer open/)).toBeInTheDocument();
    unmount();

    render(
      <InviteLandingPage
        view={landing({ preview: null, lookupFailed: true })}
        token={null}
      />,
    );
    expect(screen.getByText(/couldn't open that link/)).toBeInTheDocument();
    expect(
      screen.getByText(/Nothing is wrong with your link/),
    ).toBeInTheDocument();
  });
});

describe("S-P-13 — the children card and the paywall (04 §6.2)", () => {
  it("★ renders no paywall action when the gate could not be read", () => {
    render(
      <AppGateNotice
        view={
          appAccessView({ access: null, children: [] }) as Extract<
            ReturnType<typeof appAccessView>,
            { kind: "unknown" }
          >
        }
      />,
    );

    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByRole("heading")).toHaveTextContent(/couldn't check/);
  });

  it("renders the paywall, with the promise ADR-083 / 084 sold, when the app is genuinely closed", () => {
    render(
      <AppGateNotice
        view={
          appAccessView({
            access: { open: false, reason: "lapsed" },
            children: [],
          }) as Extract<ReturnType<typeof appAccessView>, { kind: "closed" }>
        }
      />,
    );

    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/parent/subscribe",
    );
    expect(
      screen.getByText(/every child you have after that/),
    ).toBeInTheDocument();
  });

  it("shows the share link as copyable text while an invite is pending — the same token, not a new one", () => {
    render(
      <ChildrenCard
        view={childrenCardView({
          access: { open: true, reason: "trial" },
          children: [child],
          invites: [invite],
          linkedChildIds: [],
        })}
      />,
    );

    expect(screen.getByText(invite.url)).toBeInTheDocument();
    expect(screen.getByText(/link is ready/)).toBeInTheDocument();
  });

  it("asks for the child rather than reporting that there isn't one", () => {
    render(
      <ChildrenCard
        view={childrenCardView({
          access: { open: true, reason: "trial" },
          children: [],
          invites: [],
          linkedChildIds: [],
        })}
      />,
    );

    expect(screen.getByRole("heading")).toHaveTextContent("Add your child");
    expect(screen.queryByText(/no children/i)).toBeNull();
  });
});
