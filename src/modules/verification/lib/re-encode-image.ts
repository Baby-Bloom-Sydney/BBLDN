// 07 §5.3 rule 3 — "images re-encoded and EXIF-stripped server-side; 2000 px max edge". `sharp` drops every
// metadata block unless asked to keep it; `rotate()` first applies the EXIF orientation so the stripped image
// still reads the right way up. Loaded lazily with `webpackIgnore` (the `platform/unit-of-work` precedent for a
// Node builtin): `sharp` is native and server-only, and the boot file that wires this module is bundled for the
// Edge runtime too, where webpack would otherwise try to carry `node:child_process` along. A file `sharp` cannot
// decode (a truncated image, a HEIC on a build without libheif) is `null` — refused as unreadable, never stored.
import { UPLOADS } from "@/modules/config";

export async function reEncodeImage(
  bytes: Uint8Array,
): Promise<{ readonly bytes: Uint8Array; readonly mime: "image/jpeg" } | null> {
  try {
    const { default: sharp } = await import(/* webpackIgnore: true */ "sharp");
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
  } catch {
    return null;
  }
}
