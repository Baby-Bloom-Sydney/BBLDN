import { getMatchesForPosition, getDfyStatus } from "@/lib/actions/matching";
import { getPosition } from "@/lib/actions/parent";
import { MatchResultsClient } from "./MatchResultsClient";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { ClipboardList, Users } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ParentMatchesPage() {
  // Check if parent has an active position
  const { data: position } = await getPosition();

  if (!position) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Matches</h1>
          <p className="mt-1 text-slate-500">
            Nannies matched to your childcare needs
          </p>
        </div>
        <EmptyState
          icon={ClipboardList}
          title="No active childcare position"
          description="Create a childcare position first, then we'll match you with qualified nannies in your area."
          actionLabel="Create a Childcare Position"
          actionHref="/parent/request"
        />
      </div>
    );
  }

  // Run matching + fetch DFY status in parallel
  const [matchResult, dfyStatus] = await Promise.all([
    getMatchesForPosition(),
    getDfyStatus(),
  ]);

  const { data, error } = matchResult;

  if (error || !data) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Matches</h1>
          <p className="mt-1 text-slate-500">
            Nannies matched to your childcare needs
          </p>
        </div>
        <EmptyState
          icon={Users}
          title="Unable to find matches"
          description={error || "Something went wrong. Please try again."}
        />
      </div>
    );
  }

  if (data.matches.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Matches</h1>
          <p className="mt-1 text-slate-500">
            Nannies matched to your childcare needs
          </p>
        </div>
        <EmptyState
          icon={Users}
          title="No matches yet"
          description="There are no verified nannies available right now. Check back soon as more nannies join our platform."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">My Matches</h1>
        <p className="mt-1 text-slate-500">
          Nannies ranked by compatibility with your childcare position
        </p>
      </div>

      <MatchResultsClient
        matches={data.matches}
        stats={data.stats}
        dfyStatus={dfyStatus}
      />
    </div>
  );
}
