/**
 * Position funnel logger.
 * Toggle via NEXT_PUBLIC_FUNNEL_LOG env var.
 * Set NEXT_PUBLIC_FUNNEL_LOG=true in .env.local to enable.
 * Remove or set to false for production to avoid unnecessary log volume.
 */

const ENABLED = process.env.NEXT_PUBLIC_FUNNEL_LOG === 'true';

export function funnelLog(
  action: string,
  id: string,
  message: string,
  data?: Record<string, unknown>
): void {
  if (!ENABLED) return;
  const payload = data ? ` | ${JSON.stringify(data)}` : '';
  console.log(`[Funnel:${action}] ${id} | ${message}${payload}`);
}

export function funnelError(
  action: string,
  id: string,
  message: string,
  error?: unknown
): void {
  // Errors always log regardless of toggle — you always want to see failures
  const errMsg = error instanceof Error ? error.message : String(error ?? '');
  console.error(`[Funnel:${action}] ${id} | ERROR: ${message}${errMsg ? ` | ${errMsg}` : ''}`);
}
