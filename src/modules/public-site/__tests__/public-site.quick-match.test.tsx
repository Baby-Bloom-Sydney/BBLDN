// The front door (01.10; 04 §3.1 step 1) and its query contract with S-X-02: a plain GET to `/results` with
// `day` (0–6, Mon = 0 — 02 §4.4 / ADR-118 (c)), `part`, `area`, `district`; parsed back by one function. Since
// `1b` the area is the ARIA combobox (04 §6.1), which writes `area` + `district` as hidden fields — the four
// named fields are unchanged.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HomeHero } from "../components/HomeHero";
import { parseQuickMatchQuery } from "../lib/parse-quick-match-query";
import { QUICK_MATCH_DAYS } from "../lib/quick-match-days";

describe("public-site — HomeHero front door", () => {
  it("submits a plain GET to /results with the four named fields", () => {
    const { container } = render(<HomeHero serviceAreaName="Somewhere" />);
    const form = container.querySelector("form");
    expect(form).toHaveAttribute("method", "get");
    expect(form).toHaveAttribute("action", "/results");
    expect(screen.getAllByRole("checkbox", { name: /day$/ })).toHaveLength(7);
    expect(screen.getByRole("checkbox", { name: "Monday" })).toHaveAttribute(
      "value",
      "0",
    );
    expect(screen.getByRole("checkbox", { name: "Sunday" })).toHaveAttribute(
      "value",
      "6",
    );
    expect(screen.getByRole("checkbox", { name: /Morning/ })).toHaveAttribute(
      "name",
      "part",
    );
    expect(screen.getByRole("combobox", { name: "Your area" })).toBeRequired();
    expect(container.querySelector("input[name='area']")).toBeInTheDocument();
    expect(
      container.querySelector("input[name='district']"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Show my matches" }),
    ).toHaveAttribute("type", "submit");
    expect(screen.getByText("Somewhere")).toBeInTheDocument();
  });

  it("numbers the days Monday = 0 (02 §4.4)", () => {
    expect(QUICK_MATCH_DAYS[0]).toEqual(
      expect.objectContaining({ value: 0, label: "Monday" }),
    );
    expect(QUICK_MATCH_DAYS.at(-1)).toEqual(
      expect.objectContaining({ value: 6, label: "Sunday" }),
    );
  });
});

describe("public-site — parseQuickMatchQuery (S-X-01 → S-X-02)", () => {
  it("reads back what the form submits, de-duplicated and sorted", () => {
    const query = parseQuickMatchQuery(
      new URLSearchParams(
        "day=4&day=0&day=4&part=morning&part=evening&area= Clapham &district=sw4",
      ),
    );
    expect(query).toEqual({
      days: [0, 4],
      parts: ["morning", "evening"],
      area: "Clapham",
      district: "SW4",
    });
  });

  it("drops what it does not recognise instead of throwing", () => {
    const query = parseQuickMatchQuery(
      new URLSearchParams("day=7&day=x&part=night&district="),
    );
    expect(query).toEqual({ days: [], parts: [], area: "", district: "" });
    expect(parseQuickMatchQuery(new URLSearchParams()).days).toEqual([]);
  });

  it("caps free text so a crafted link cannot carry a payload", () => {
    const long = "a".repeat(500);
    const query = parseQuickMatchQuery(new URLSearchParams({ area: long }));
    expect(query.area.length).toBeLessThanOrEqual(60);
  });
});
