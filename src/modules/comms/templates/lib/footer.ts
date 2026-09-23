// 03 §8.1's third rendering helper. The one footer, in both bodies, built from `config` alone — brand name and
// every path (L4; the config-literal gate reddens a brand or domain literal anywhere outside `config`).
import { BRAND, URLS } from "@/modules/config";
import { appUrl } from "./app-url";

type Footer = { readonly html: string; readonly text: string };

export function footer(): Footer {
  const privacy = appUrl(URLS.paths.legal.privacy);
  const contact = appUrl(URLS.paths.support);
  return Object.freeze({
    html:
      `<hr style="border:0;border-top:1px solid #e5e5e5;margin:32px 0 16px" />` +
      `<p style="color:#6b6b6b;font-size:12px;line-height:1.5;margin:0">` +
      `${BRAND.longName}<br />` +
      `<a href="${privacy}" style="color:#6b6b6b">Privacy</a> · ` +
      `<a href="${contact}" style="color:#6b6b6b">Contact us</a>` +
      `</p>`,
    text: `\n—\n${BRAND.longName}\nPrivacy: ${privacy}\nContact us: ${contact}\n`,
  });
}
