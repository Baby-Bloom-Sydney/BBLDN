// app — the paid product: `katie` · `child-development` · `child-linking` (00-glossary §3; ADR-019). The parent
// module's own type surface is the vocabulary shared across its three sub-modules; each sub-module's types live
// beside it and are re-exported through `index.ts` (01 §2.5).
import type { Result } from "@/modules/shared-types";

export type AppSubModule = "katie" | "child-development" | "child-linking";

export type AppErrorDetails = { readonly reason: string };

export type AppResult<T> = Result<T, AppErrorDetails>;
