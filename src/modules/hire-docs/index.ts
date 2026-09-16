// hire-docs connector (01 §2.5; 03 §10.1) — the hire summary PDFs and their UK-law wording (`04.20`), rendered
// with React-PDF. A leaf: 01 §2.3 allows it `config` · `shared-types` and the service modules and nothing else,
// so every fact it prints arrives as an argument.
export type * from "./types";

export { hireDocs } from "./lib/default-hire-docs";
export { configureHireDocs } from "./lib/configure-hire-docs";
export { stubHireDocs } from "./hire-docs.stub";
