import { validateProofFile } from "./file-validation";

function png(): Buffer {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
}
function jpeg(): Buffer {
  return Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3]);
}
function webp(): Buffer {
  const buf = Buffer.alloc(16);
  buf.write("RIFF", 0, "ascii");
  buf.write("WEBP", 8, "ascii");
  return buf;
}
function pdf(): Buffer {
  return Buffer.from("%PDF-1.4\n...", "ascii");
}

describe("validateProofFile (InstaPay receipt validation)", () => {
  it("accepts a PNG by its magic bytes", () => {
    const result = validateProofFile({ buffer: png(), size: png().length }, 1_000_000);
    expect(result).toEqual({ mimeType: "image/png", extension: "png", sizeBytes: png().length });
  });

  it("accepts a JPEG, a WEBP and a PDF", () => {
    expect(validateProofFile({ buffer: jpeg(), size: jpeg().length }, 1_000_000).mimeType).toBe("image/jpeg");
    expect(validateProofFile({ buffer: webp(), size: webp().length }, 1_000_000).mimeType).toBe("image/webp");
    expect(validateProofFile({ buffer: pdf(), size: pdf().length }, 1_000_000).mimeType).toBe("application/pdf");
  });

  it("never trusts a claimed type: content with no recognised signature is rejected regardless of filename", () => {
    const fake = Buffer.from("just some text pretending to be anything", "utf8");
    expect(() => validateProofFile({ buffer: fake, size: fake.length }, 1_000_000)).toThrow();
  });

  it("rejects an executable disguised with an image-like name (no magic bytes match)", () => {
    // MZ header: a Windows PE executable. Nothing in ALLOWED_PROOF_TYPES starts with this signature.
    const exe = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03]);
    expect(() => validateProofFile({ buffer: exe, size: exe.length }, 1_000_000)).toThrow();
  });

  it("rejects a file over the configured size ceiling", () => {
    expect(() => validateProofFile({ buffer: png(), size: 10 }, 5)).toThrow();
  });

  it("rejects an empty file", () => {
    expect(() => validateProofFile({ buffer: Buffer.alloc(0), size: 0 }, 1_000_000)).toThrow();
  });
});
