// The specs need the bearers the running servers are checking against. They come from the **same** file the
// servers read (`scripts/ci/lib/smoke-env.sh`, sourced by `scripts/ci/shell-smoke.sh`), never restated here —
// a second copy would drift and the authorised branch would quietly stop being asserted.
//
// `requiredSecret` throws rather than returning undefined on purpose: an absent bearer would still produce the
// 401 every refusal case expects, so the suite would go green having proved nothing about the authorised path.

export function requiredSecret(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "")
    throw new Error(
      `${name} is not set: run the shell smoke through 'npm run test:shell-smoke' so scripts/ci/lib/smoke-env.sh is sourced`,
    );
  return value;
}
