import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Two projects, because the two kinds of test need different worlds (05 §9 stages 3 and 5):
//   `unit`        — jsdom, no database, runs on every push and in CI's `test` job (`npm test`).
//   `integration` — node, talks to the applied migration set (`supabase start` + `supabase db reset`),
//                   runs as `npm run test:db`. `db.constraints` is listed first so a renamed or
//                   dropped constraint fails before any other suite spends time (HANDOFF §6.5).
// `npm test` names `--project unit` deliberately: a bare `vitest run` would try the integration
// project too and fail on a machine with no local stack, which would make the gate a coin toss.
const alias = {
  "@": path.resolve(__dirname, "./src"),
  // `server-only` throws outside an RSC graph; under vitest every module is server (tests/stubs/server-only.ts).
  "server-only": path.resolve(__dirname, "./tests/stubs/server-only.ts"),
};

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "unit",
          environment: "jsdom",
          globals: true,
          setupFiles: ["./vitest.setup.ts"],
          // `scripts/**` carries the boundary-lint generator's suites (S6); `src/**` everything else.
          include: [
            "src/**/*.{test,spec}.{ts,tsx}",
            "scripts/**/*.{test,spec}.{ts,tsx}",
          ],
          exclude: ["**/node_modules/**", "**/.next/**", "**/tests/e2e/**"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          environment: "node",
          globals: true,
          include: [
            "supabase/__tests__/constraints.test.ts",
            "supabase/__tests__/*.test.ts",
          ],
          exclude: ["**/node_modules/**"],
          // every suite here shares one database; parallel files would fight over it
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      exclude: [
        "node_modules/**",
        ".next/**",
        "tests/e2e/**",
        "supabase/**",
        "**/*.config.*",
        "**/*.d.ts",
      ],
    },
  },
});
