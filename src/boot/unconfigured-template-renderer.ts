// The template seam of `comms` (03 §8.1 "one file per template"), fail-closed: no template file exists yet
// (F-b README gap 3), and a renderer that produced a placeholder body would send a real person a real email
// with nothing in it. Every `render` answers `renderer-not-configured` — the reason `comms/types.ts` reserves —
// until the Phase 1 sub-phases write the templates their screens fire (03 §8.3).
import { err } from "@/modules/platform";
import type { CommsErrorDetails, TemplateRenderer } from "@/modules/comms";

export const unconfiguredTemplateRenderer: TemplateRenderer = Object.freeze({
  render: async () =>
    err<CommsErrorDetails>("INTERNAL", "That message cannot be rendered yet", {
      reason: "renderer-not-configured",
    }),
});
