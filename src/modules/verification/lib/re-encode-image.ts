// 07 §5.3 rule 3 — "images re-encoded and EXIF-stripped server-side; 2000 px max edge". `sharp` drops every
// metadata block unless asked to keep it; `rotate()` first applies the EXIF orientation so the stripped image
// still reads the right way up. Loaded lazily with `webpackIgnore` (the `platform/unit-of-work` precedent for a
// Node builtin): `sharp` is native and server-only, and the boot file that wires this module is bundled for the
// Edge runtime too, where webpack would otherwise try to carry `node:child_process` along.
//
// **Two failures, and they are not the same failure** (REVIEW-3 H-1). A file `sharp` cannot decode (a truncated
// image, a HEIC on a build without libheif) is `null` — refused as unreadable, never stored, and the nanny is
// told to try another photo, which is true and actionable. A `sharp` that will not **load** is
// `"encoder-unavailable"`: that is our runtime, not her file, and it takes down every image in the whole
// wizard at once — identity document, selfie, DBS certificate, right-to-work document. Until this split the
// two shared one `catch { return null }`, so an outage on the one road every nanny must pass to reach level 1
// arrived as a sentence blaming her camera, with no log line and no alert to tell anyone on call it had
// happened. `sharp` is native, carried by `serverComponentsExternalPackages` and imported past the bundler on
// purpose, which is exactly the arrangement where a missing platform binary shows up at call time.
//
// The caller maps `"encoder-unavailable"` onto the same `PROVIDER_ERROR` arm the scanner's `unavailable`
// verdict already uses — an outage is an outage whichever provider is down — so this adds no user-facing state.
import { UPLOADS } from "@/modules/config";
import { log } from "@/modules/platform";

/**
 * The encoded image · `null` when the bytes are unreadable · `"encoder-unavailable"` when we are. Written
 * inline rather than as two exported names: L1 gives this file exactly one export, and the only caller
 * (`upload-evidence.ts`) narrows it by value.
 */
export async function reEncodeImage(
  bytes: Uint8Array,
): Promise<
  | { readonly bytes: Uint8Array; readonly mime: "image/jpeg" }
  | null
  | "encoder-unavailable"
> {
  let sharp: typeof import("sharp");
  try {
    ({ default: sharp } = await import(/* webpackIgnore: true */ "sharp"));
  } catch (cause) {
    log.error("the image re-encoder could not be loaded", {
      module: "verification",
      action: "reEncodeImage",
      alert: "ALERT_PROVIDER_DOWN",
      cause: cause instanceof Error ? cause.message : String(cause),
    });
    return "encoder-unavailable";
  }
  try {
    const output = await sharp(Buffer.from(bytes))
      .rotate()
      .resize({
        width: UPLOADS.maxImageEdgePx,
        height: UPLOADS.maxImageEdgePx,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 90 })
      .toBuffer();
    return { bytes: new Uint8Array(output), mime: "image/jpeg" };
  } catch (cause) {
    // Her file, as far as anything here can tell — but said out loud, because a *flood* of these is our
    // problem and the one sentence she sees cannot tell one apart from a thousand.
    log.warn("the image re-encoder refused the bytes as unreadable", {
      module: "verification",
      action: "reEncodeImage",
      cause: cause instanceof Error ? cause.message : String(cause),
    });
    return null;
  }
}
