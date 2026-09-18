"use client";
// S-A-xx — the admin road for an Art 17 request that arrived by email (07 §6.1; B-46). Two steps on the screen
// because they are two steps in the road, and the separation is the control: step 1 records the address, step 2
// erases a **request id**. There is no field on this screen that names a person to erase.
//
// The list shows an id, a road and a date and nothing else. These are people who have asked to be forgotten; a
// queue that displayed their names and addresses would gather up and display their identity precisely because
// they asked us to stop holding it.
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import type {
  ErasureRequestRow,
  OpenErasureRequestAction,
  RunErasureRequestAction,
} from "../types";

type Props = {
  readonly requests: ReadonlyArray<ErasureRequestRow>;
  readonly openAction: OpenErasureRequestAction;
  readonly runAction: RunErasureRequestAction;
};

export function ErasurePanel({ requests, openAction, runAction }: Props) {
  const [opened, formAction] = useFormState(openAction, null);

  return (
    <div className="space-y-8">
      <section aria-labelledby="open-request-heading">
        <h2 id="open-request-heading">Record a request</h2>
        <p>
          Type the address the request came from. This records it; it does not
          delete anything.
        </p>
        <form action={formAction}>
          <label htmlFor="erasure-email">Email address</label>
          <input id="erasure-email" name="email" type="email" required />
          <OpenButton />
        </form>
        <div aria-live="polite">
          {opened !== null && !opened.ok ? (
            <p role="alert">{opened.error.message}</p>
          ) : null}
          {opened !== null && opened.ok ? (
            <p>Recorded. It is in the list below, waiting for step 2.</p>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="open-requests-heading">
        <h2 id="open-requests-heading">Requests waiting</h2>
        {requests.length === 0 ? (
          <p>Nothing is waiting.</p>
        ) : (
          <ul>
            {requests.map((request) => (
              <li key={request.requestId}>
                <RunRow request={request} action={runAction} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function RunRow(props: {
  readonly request: ErasureRequestRow;
  readonly action: RunErasureRequestAction;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    // The ONLY thing that travels is the request id. The subject is read off the row inside the connector
    // (ADR-145; 07 §5.4 row 6), so there is nothing here to point at the wrong person.
    const result = await props.action({ requestId: props.request.requestId });
    setBusy(false);
    setMessage(
      result.ok
        ? result.value.outcome === "refused"
          ? `Refused: ${result.value.reason ?? "unknown"}. The person has to act first.`
          : `Done. ${result.value.objectCount} file(s) removed.`
        : result.error.message,
    );
  }

  return (
    <>
      <span>
        {props.request.requestId} · {props.request.road} ·{" "}
        {props.request.requestedAt}
      </span>
      <button type="button" onClick={run} disabled={busy}>
        {busy ? "Erasing…" : "Run this erasure"}
      </button>
      <span aria-live="polite">{message}</span>
    </>
  );
}

function OpenButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? "Recording…" : "Record the request"}
    </button>
  );
}
