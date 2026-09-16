// `no-restricted-imports` takes gitignore-style pattern groups: the bans come first, the allowances are
// negations and the last match wins. These suites pin the group the generator builds for one business module,
// one service module and `config` itself (05 §7 rules 1–2; 01 §2.3, §2.4).
import { describe, expect, it } from "vitest";
import { restrictedImportGroup } from "../lib/restricted-import-group";
import { allowedSpecifiers } from "../lib/allowed-specifiers";

describe("allowedSpecifiers", () => {
  it("gives a business module its row, the services, the universals and its own inside", () => {
    expect(allowedSpecifiers("matching")).toEqual([
      "@/modules/config",
      "@/modules/config/server",
      "@/modules/shared-types",
      "@/modules/areas",
      "@/modules/auth",
      "@/modules/comms",
      "@/modules/platform",
      "@/modules/positions",
      "@/modules/scoring",
      "@/modules/matching",
      "@/modules/matching/**",
    ]);
  });

  it("gives a tier-1 service the universals, the platform kernel and its own inside (01 §2.4; ADR-116)", () => {
    expect(allowedSpecifiers("comms")).toEqual([
      "@/modules/config",
      "@/modules/config/server",
      "@/modules/shared-types",
      "@/modules/platform",
      "@/modules/comms",
      "@/modules/comms/**",
    ]);
  });

  it("keeps the platform kernel itself a true leaf (ADR-116)", () => {
    expect(allowedSpecifiers("platform")).toEqual([
      "@/modules/config",
      "@/modules/config/server",
      "@/modules/shared-types",
      "@/modules/platform",
      "@/modules/platform/**",
    ]);
  });

  it("does not repeat `config`'s own entry points in `config`'s own row", () => {
    expect(allowedSpecifiers("config")).toEqual([
      "@/modules/shared-types",
      "@/modules/config",
      "@/modules/config/**",
    ]);
  });
});

describe("restrictedImportGroup", () => {
  const group = restrictedImportGroup("matching");

  it("bans every module path before negating the allowed ones", () => {
    expect(group[0]).toBe("@/modules/*");
    expect(group[1]).toBe("@/modules/*/**");
  });

  it("negates exactly the allowed specifiers, in order", () => {
    expect(group.slice(2)).toEqual(
      allowedSpecifiers("matching").map((specifier) => `!${specifier}`),
    );
  });

  it("never negates a module the row does not name", () => {
    expect(group).not.toContain("!@/modules/connections");
    expect(group).not.toContain("!@/modules/positions/**");
  });
});
