// Boot installs the dispatcher this module's server action fires K-1 through (see `connections-dispatch.ts`).
import type { AdvanceFn } from "../types";
import { CONNECTIONS_DISPATCH } from "./connections-dispatch";

export const configureConnectionsDispatch = (advance: AdvanceFn): void => {
  CONNECTIONS_DISPATCH.set(advance);
};
