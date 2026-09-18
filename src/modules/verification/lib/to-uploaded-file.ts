// A `File` from the form → the bytes the inside works on (`UploadedFile`): the browser's claims travel as
// claims and are never trusted (07 §4.16).
import type { UploadedFile } from "../types";

export async function toUploadedFile(file: File): Promise<UploadedFile> {
  return {
    bytes: new Uint8Array(await file.arrayBuffer()),
    ...(file.type ? { contentType: file.type } : {}),
    ...(file.name ? { fileName: file.name } : {}),
  };
}
