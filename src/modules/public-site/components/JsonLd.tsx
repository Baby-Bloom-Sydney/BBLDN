// One `application/ld+json` script (05 §8.3). The payload is ours, never user input; `<` is escaped so a
// string value can never close the script element.
import type { ReactElement } from "react";

export function JsonLd({
  data,
}: {
  readonly data: Readonly<Record<string, unknown>>;
}): ReactElement {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
