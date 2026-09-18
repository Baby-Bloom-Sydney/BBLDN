// 07 §4.16 / §5.3 rule 3 — the MIME type comes from the magic bytes, never from the file name or the browser's
// claim. Only the types `config/uploads.ts` admits for `verification-documents` are recognised; anything else
// is `null`, and `null` is `invalid_type`.
const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];
const FTYP = [0x66, 0x74, 0x79, 0x70]; // ftyp
const HEIC_BRANDS = [
  "heic",
  "heix",
  "hevc",
  "mif1",
  "msf1",
  "heim",
  "heis",
  "hevm",
  "hevs",
];

const startsWith = (
  bytes: Uint8Array,
  magic: ReadonlyArray<number>,
  at = 0,
): boolean =>
  bytes.length >= at + magic.length &&
  magic.every((value, index) => bytes[at + index] === value);

const ascii = (bytes: Uint8Array, from: number, length: number): string =>
  String.fromCharCode(...bytes.subarray(from, from + length));

export function sniffMime(bytes: Uint8Array): string | null {
  if (startsWith(bytes, JPEG)) return "image/jpeg";
  if (startsWith(bytes, PNG)) return "image/png";
  if (startsWith(bytes, PDF)) return "application/pdf";
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8))
    return "image/webp";
  if (bytes.length >= 12 && startsWith(bytes, FTYP, 4)) {
    const brand = ascii(bytes, 8, 4).toLowerCase();
    if (HEIC_BRANDS.includes(brand)) return "image/heic";
  }
  return null;
}
