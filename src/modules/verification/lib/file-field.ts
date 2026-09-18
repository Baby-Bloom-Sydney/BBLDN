// A `File` as a server action receives it from `FormData` (the browser's `File`, or Node's), judged by shape so
// the check does not depend on which realm's `File` class is in scope. Emptiness and the transport cap are the
// two rules here; the type comes from the bytes later (07 §4.16).
//
// The cap is `UPLOADS.maxUploadBytes`, not `maxBytes` (REVIEW-3 R-5): the number a request can actually carry,
// not the number an object at rest may weigh. Refusing at the schema costs nothing and gives her the field name
// the summary takes focus on, and `upload-evidence.ts` re-checks it against the bytes rather than the claim —
// `file.size` is the browser's word for it, and 07 §4.16 says the browser's claims travel as claims.
import { z } from "zod";
import { UPLOADS } from "@/modules/config";

const isFileLike = (value: unknown): value is File =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as File).arrayBuffer === "function" &&
  typeof (value as File).size === "number";

export function fileField(label: string) {
  return z
    .custom<File>(isFileLike, { message: `Choose a file for the ${label}.` })
    .refine((file) => file.size > 0, `Choose a file for the ${label}.`)
    .refine(
      (file) => file.size <= UPLOADS.maxUploadBytes,
      `That ${label} is too large.`,
    );
}
