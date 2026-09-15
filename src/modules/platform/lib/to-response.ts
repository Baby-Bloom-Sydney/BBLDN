// 01 §4c / §4e — the route-handler half: a `Result` → a JSON `Response` (web standard; what a Next.js route
// handler returns). The body is `envelopeOf`; a 204 has no body.
import type { AppErrorDetails, Result } from "@/modules/shared-types";
import type { EnvelopeOptions } from "../types";
import { envelopeOf } from "./envelope-of";

export function toResponse<T, D extends AppErrorDetails = AppErrorDetails>(
  result: Result<T, D>,
  options: EnvelopeOptions,
): Response {
  const { status, body, headers } = envelopeOf(result, options);
  if (body === null) return new Response(null, { status, headers });
  return Response.json(body, { status, headers });
}
