// The slice registry (03 §2.1, §2.5) — the dependency inversion that keeps `positions` from importing
// `call-layer`: a slice hands its `TransitionHandler`s in at boot and `advance` dispatches into them.
//
// One handler per `TransitionId`. Registration is boot-time and last-wins, so a test (or a second boot in the
// same process) can replace a slice with a stub without tearing the registry down — which is exactly what swap
// test 1 does. The entity kind a slice declares is kept so `advance` can say which slice is missing.
import type {
  SliceRegistration,
  TransitionHandler,
  TransitionId,
} from "@/modules/shared-types";

type Registered = {
  readonly entity: SliceRegistration["entity"];
  readonly handler: TransitionHandler;
};

const handlers = new Map<TransitionId, Registered>();

export const SLICE_REGISTRY = Object.freeze({
  register: (slice: SliceRegistration): void => {
    for (const handler of slice.handlers) {
      handlers.set(handler.id, { entity: slice.entity, handler });
    }
  },
  handlerFor: (transition: TransitionId): TransitionHandler | undefined =>
    handlers.get(transition)?.handler,
  registered: (): ReadonlyArray<TransitionId> =>
    Object.freeze([...handlers.keys()]),
  clear: (): void => {
    handlers.clear();
  },
});
