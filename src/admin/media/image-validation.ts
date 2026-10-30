import { HttpStatus } from "@nestjs/common";
import { AppError } from "../../common/errors";

/** Public catalogue images only — no PDF (that allowance is specific to InstaPay receipts). */
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

const EXTENSION_OF: Record<AllowedImageType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Same magic-byte sniffing discipline as payments/file-validation.ts: the client's Content-Type
 *  and filename are never trusted, only the file's own first bytes. */
function sniffType(buffer: Buffer): AllowedImageType | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export interface ValidatedImageFile {
  mimeType: AllowedImageType;
  extension: string;
  sizeBytes: number;
}

export function validateImageFile(file: { buffer: Buffer; size: number }, maxBytes: number): ValidatedImageFile {
  if (file.size <= 0 || file.buffer.length === 0) {
    throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, "VALIDATION_FAILED", "Some fields are invalid", undefined, [
      { field: "file", message: "file is empty" },
    ]);
  }
  if (file.size > maxBytes) {
    throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, "VALIDATION_FAILED", "Some fields are invalid", undefined, [
      { field: "file", message: `file must be at most ${maxBytes} bytes` },
    ]);
  }
  const sniffed = sniffType(file.buffer);
  if (!sniffed) {
    throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, "VALIDATION_FAILED", "Some fields are invalid", undefined, [
      { field: "file", message: "file type is not recognised; only JPEG, PNG and WEBP are accepted" },
    ]);
  }
  return { mimeType: sniffed, extension: EXTENSION_OF[sniffed], sizeBytes: file.size };
}
