// A real one-pixel JPEG (07 §5.3 rule 3: the road re-encodes images with `sharp`, so a fixture that is only the
// magic bytes is rightly refused as unreadable). Built once per suite from the same library.
export async function tinyJpeg(): Promise<Uint8Array> {
  const { default: sharp } = await import("sharp");
  const buffer = await sharp({
    create: {
      width: 2,
      height: 2,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .jpeg()
    .toBuffer();
  return new Uint8Array(buffer);
}
