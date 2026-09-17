// The money arithmetic and the presets, alone. Every claim this unit's merge rests on about *what a family is
// charged* is here, because a bill computed one pence wrong is not a bug a screenshot catches.
import { describe, expect, it } from "vitest";
import { OFFER, PRICES } from "@/modules/config";
import { balancePence } from "../lib/balance-pence";
import { firstWeekWagesPence } from "../lib/first-week-wages-pence";
import { presetPrices } from "../lib/preset-prices";

describe("the bill (ADR-094 / 097 / 100)", () => {
  it("is the fee less the deposit paid and the nanny's first week", () => {
    // Arrange · Act · Assert — £1,500 − £150 − £600.
    expect(balancePence(150_000, 15_000, 60_000)).toBe(75_000);
  });

  it("never goes below zero, so a generous first week is a discount and never a payment out", () => {
    expect(balancePence(150_000, 15_000, 900_000)).toBe(0);
  });

  it("credits the deposit wherever it was paid — the same bill with and without it differs by the deposit", () => {
    const withDeposit = balancePence(PRICES.feePence, PRICES.depositPence, 0);
    const without = balancePence(PRICES.feePence, 0, 0);
    expect(without - withDeposit).toBe(PRICES.depositPence);
  });
});

describe("the first week's wages (ADR-100)", () => {
  it("is the contracted hours at the contracted rate", () => {
    expect(
      firstWeekWagesPence({ weeklyHours: 30, hourlyRatePence: 1_400 }),
    ).toBe(42_000);
  });

  it("caps the hours at OFFER.firstWeekMaxHours and the rate at OFFER.firstWeekMaxRatePence", () => {
    expect(
      firstWeekWagesPence({ weeklyHours: 60, hourlyRatePence: 2_500 }),
    ).toBe(OFFER.firstWeekMaxHours * OFFER.firstWeekMaxRatePence);
  });

  it("is nothing at all when the placement carries no contracted terms — never a guessed discount", () => {
    expect(firstWeekWagesPence(null)).toBe(0);
    expect(
      firstWeekWagesPence({ weeklyHours: null, hourlyRatePence: 1_500 }),
    ).toBe(0);
    expect(firstWeekWagesPence({ weeklyHours: 40, hourlyRatePence: null })).toBe(
      0,
    );
  });

  it("the ADR-100 maximum is £600", () => {
    expect(OFFER.firstWeekMaxHours * OFFER.firstWeekMaxRatePence).toBe(60_000);
  });
});

describe("prices() (L4 — config, never a literal)", () => {
  const prices = presetPrices();

  it("renders only the presets PRICES states an amount for", () => {
    expect([...new Set(prices.map((p) => p.preset))].sort()).toEqual([
      "deposit",
      "self-serve-app",
    ]);
  });

  it("takes every amount from PRICES", () => {
    const deposit = prices.find((p) => p.preset === "deposit");
    expect(deposit?.total.pence).toBe(PRICES.depositPence);
    const upfront = prices.find(
      (p) => p.preset === "self-serve-app" && p.shape.kind === "upfront",
    );
    expect(upfront?.total.pence).toBe(PRICES.selfServeAppUpfrontPence);
    const monthly = prices.find(
      (p) => p.preset === "self-serve-app" && p.shape.kind === "instalments",
    );
    expect(monthly?.perPayment.pence).toBe(PRICES.selfServeAppMonthlyPence);
    expect(monthly?.total.pence).toBe(
      PRICES.selfServeAppMonthlyPence * PRICES.bundleMonthlyCount,
    );
  });

  it("carries a copy key, never the copy (00-glossary §6)", () => {
    for (const price of prices) expect(price.label).toMatch(/^price\./u);
  });

  it("has no nanny bonus anywhere in the offer (ADR-099)", () => {
    expect(OFFER).not.toHaveProperty("nannyBonusPence");
  });
});
