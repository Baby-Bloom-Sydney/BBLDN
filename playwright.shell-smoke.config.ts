import { defineConfig, type PlaywrightTestConfig } from "@playwright/test";

// Playwright declares `TestConfigWebServer` but does not export it, so it is derived from the one place it is
// reachable — the config's own `webServer` field, which is `T | T[]`.
type WebServer = Extract<
  NonNullable<PlaywrightTestConfig["webServer"]>,
  ReadonlyArray<unknown>
>[number];

// The E1 shell smoke (05 §9 stage 6). A config of its own rather than a project inside `playwright.config.ts`,
// because this suite needs two servers of its own and the legacy Katie / visual suites must keep running exactly
// as they do today. Run it with `npm run test:shell-smoke` — that wrapper sources the placeholder environment
// (`scripts/ci/lib/smoke-env.sh`) so the runner and the servers agree on the bearers.
//
// Two servers, because the app behaves differently in the two environments 06 §2.5 names and both behaviours are
// part of the acceptance:
//   preview     (VERCEL_ENV=preview)     — the ordinary shape: gate, cron / webhook / agent / admin shells.
//   production  (VERCEL_ENV=production)  — 07 §5.5 layer 3: the stub purchase route must not exist.
// Both serve the same `.next/`, so `npm run build` must have run first; `shell-smoke-server.sh` fails loudly if
// it has not, rather than falling back to `next dev` and asserting something other than the built application.

const SERVER_TIMEOUT_MS = 180_000;

/**
 * A port override has to be a port. `Number("abc")` is `NaN` and — the one that actually bites in CI —
 * `Number("")` is `0`, so a declared-but-empty variable would be baked into both the probe URL and the shell
 * command, and the failure would surface far from its cause as a webServer boot timeout
 * (typescript-reviewer MEDIUM 3).
 */
function portFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535)
    throw new Error(
      `${name} must be a port number, not ${JSON.stringify(raw)}`,
    );
  return port;
}

const PREVIEW_PORT = portFromEnv("SHELL_SMOKE_PREVIEW_PORT", 3101);
const PRODUCTION_PORT = portFromEnv("SHELL_SMOKE_PRODUCTION_PORT", 3102);

const origin = (port: number) => `http://127.0.0.1:${port}`;
// Annotated, so Playwright's own shape is checked here rather than indirectly at the `webServer: [...]` call
// site — which is also what lets the `"pipe"` literals stay narrow without an `as const` (typescript-reviewer
// MEDIUM 4).
const server = (mode: "preview" | "production", port: number): WebServer => ({
  command: `bash scripts/ci/shell-smoke-server.sh ${mode} ${port}`,
  url: `${origin(port)}/api/health`,
  reuseExistingServer: !process.env.CI,
  timeout: SERVER_TIMEOUT_MS,
  stdout: "pipe",
  stderr: "pipe",
});

export default defineConfig({
  testDir: "./tests/e2e/shell-smoke",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // A shell smoke must be deterministic: there is no data, no animation and no third party in it, so a test that
  // only passes on a retry is a real defect, not flake (05 §9 retry note).
  retries: 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["html", { open: "never", outputFolder: "playwright-report/shell-smoke" }],
    ["list"],
  ],
  outputDir: "test-results/shell-smoke",
  // `trace` says what it means: with `retries: 0` an "on-first-retry" trace would never be captured, and a
  // config that quietly does nothing is worse than one that says so (security-reviewer LOW 3). It also means no
  // artefact ever holds a request header, placeholder bearer or not.
  use: { trace: "off", screenshot: "only-on-failure" },
  projects: [
    {
      name: "shell-smoke",
      testIgnore: "**/production/**",
      use: { baseURL: origin(PREVIEW_PORT) },
    },
    {
      name: "shell-smoke-production",
      testMatch: "**/production/**/*.spec.ts",
      use: { baseURL: origin(PRODUCTION_PORT) },
    },
  ],
  webServer: [
    server("preview", PREVIEW_PORT),
    server("production", PRODUCTION_PORT),
  ],
});
