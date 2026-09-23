// 03 §8.1's second rendering helper. Every link in every email is built from the one base in `config` (`URLS`),
// so the London domain is a value that changes once and no template changes with it (L4).
import { URLS } from "@/modules/config";

export function appUrl(path = ""): string {
  if (path === "") return URLS.app;
  return `${URLS.app}${path.startsWith("/") ? path : `/${path}`}`;
}
