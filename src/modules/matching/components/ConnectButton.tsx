// The Connect form (ADR-126; 04 §3.3 (d)): a plain POST to the one entry point, so it works with no script and
// the server decides where the parent goes. Hidden fields carry the nanny, the surface and the lead if any.
import type { LeadId, NannyId } from "@/modules/shared-types";
import type { ConnectSurface } from "../types";

export type ConnectButtonProps = {
  readonly action: (formData: FormData) => Promise<never>;
  readonly nannyId: NannyId;
  readonly surface: ConnectSurface;
  readonly leadId?: LeadId | null;
  readonly label?: string;
};

export function ConnectButton({
  action,
  nannyId,
  surface,
  leadId,
  label,
}: ConnectButtonProps) {
  return (
    <form action={action} className="inline">
      <input type="hidden" name="nannyId" value={nannyId} />
      <input type="hidden" name="surface" value={surface} />
      {leadId !== undefined && leadId !== null ? (
        <input type="hidden" name="leadId" value={leadId} />
      ) : null}
      <button
        type="submit"
        className="inline-flex h-9 items-center rounded-md bg-violet-500 px-4 text-sm font-medium text-white transition-colors hover:bg-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
      >
        {label ?? "Connect"}
      </button>
    </form>
  );
}
