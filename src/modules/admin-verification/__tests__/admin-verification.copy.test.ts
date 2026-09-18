// ADR-124 folded in: admin screens may use the team's own words (kickoff §4.5 — the nanny list binds nanny
// surfaces), but a Sydney check name, the city, or a currency sign has no place here either, and the queue must
// say that a person decides (07 §2.6). Read from the source.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const COMPONENTS = resolve(__dirname, "../components");
const listFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
const BANNED = [
  /\bWWCC\b/,
  /\bOCG\b/,
  /\bSydney\b/,
  /\bNSW\b/,
  /\$\s?\d/,
  /\bpolice check\b/i,
];
/** the copy, not the comments — a comment may name what the screen replaced */
const copyOf = (file: string): string =>
  readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*|\/\*|import )/.test(line))
    .join("\n");

describe("admin-verification — copy", () => {
  const files = listFiles(COMPONENTS).filter((f) => f.endsWith(".tsx"));
  it.each(files.map((f) => [f.replace(COMPONENTS, "")]))(
    "%s carries no Sydney check name, city or currency sign",
    (rel) => {
      const text = copyOf(join(COMPONENTS, rel));
      for (const pattern of BANNED)
        expect(text, `${rel} matches ${pattern}`).not.toMatch(pattern);
    },
  );
  it("the queue says a person decides and a reveal is recorded (07 §2.6; §4.32)", () => {
    const text = files.map((f) => copyOf(f)).join("\n");
    expect(text).toMatch(/Needs a person/);
    expect(text).toMatch(/recorded against your admin login/);
  });
});
