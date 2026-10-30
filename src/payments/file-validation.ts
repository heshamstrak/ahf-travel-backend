import { AppError } from "../common/errors";
import { HttpStatus } from "@nestjs/common";

/**
 * Allowed InstaPay proof file types. Deliberately narrow: no executables, no scripts, no HTML
 * (which a browser could render and that could carry script content), no Office formats.
 */
export const ALLOWED_PROOF_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export type AllowedProofType = (typeof ALLOWED_PROOF_TYPES)[number];

const EXTENSION_OF: Record<AllowedProofType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/**
 * Sniffs the real type from the file's first bytes. Never trusts the client-supplied Content-Type
 * or the original filename/extension: both are attacker-controlled and are used only for display.
 */
function sniffType(buffer: Buffer): AllowedProofType | null {
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
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  return null;
}

export interface ValidatedProofFile {
  mimeType: AllowedProofType;
  extension: string;
  sizeBytes: number;
}

/**
 * Validates an uploaded InstaPay proof: size against the configured ceiling, and type by sniffing
 * magic bytes, never by trusting `file.mimetype` (client Content-Type header) or `file.originalname`.
 * A mismatch between the claimed type and the sniffed type is also rejected, since that is exactly
 * the pattern used to smuggle an executable past a naive extension check.
 */
export function validateProofFile(file: { buffer: Buffer; size: number }, maxBytes: number): ValidatedProofFile {
  if (file.size <= 0 || file.buffer.length === 0) {
    throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, "VALIDATION_FAILED", "Some fields are invalid", undefined, [
      { field: "proof", message: "file is empty" },
    ]);
  }
  if (file.size > maxBytes) {
    throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, "VALIDATION_FAILED", "Some fields are invalid", undefined, [
      { field: "proof", message: `file must be at most ${maxBytes} bytes` },
    ]);
  }
  const sniffed = sniffType(file.buffer);
  if (!sniffed) {
    throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, "VALIDATION_FAILED", "Some fields are invalid", undefined, [
      { field: "proof", message: "file type is not recognised; only JPEG, PNG, WEBP and PDF are accepted" },
    ]);
  }
  return { mimeType: sniffed, extension: EXTENSION_OF[sniffed], sizeBytes: file.size };
}
