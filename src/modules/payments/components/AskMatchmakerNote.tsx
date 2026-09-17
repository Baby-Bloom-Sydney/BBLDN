// The line every screen shows when the next move is not the parent's (04 §6.2 S-P-10 "link expired → ask your
// matchmaker"). It is deliberately the same sentence in every state that reaches it: a parent who has just read
// "a payment didn't go through" and a parent whose link has run out both need the same one thing, and giving
// each its own wording would invent two support paths where there is one.
//
// Refunds are never self-serve (money-model): Contact Us → a call → the refund by hand. So there is no button
// here, only the road to a person.
import { URLS } from "@/modules/config";
import { SENDERS } from "@/modules/config/server";

export function AskMatchmakerNote() {
  return (
    <p className="mt-8 rounded-lg border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600">
      Anything not right, or nothing arrived? Your matchmaker will sort it —{" "}
      <a
        className="font-semibold text-violet-700 underline underline-offset-2 hover:text-violet-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700"
        href={`mailto:${SENDERS.support.address}`}
      >
        {SENDERS.support.address}
      </a>{" "}
      or the{" "}
      <a
        className="font-semibold text-violet-700 underline underline-offset-2 hover:text-violet-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700"
        href={URLS.paths.support}
      >
        contact form
      </a>
      .
    </p>
  );
}
