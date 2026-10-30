import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import * as path from "path";
import { APP_CONFIG } from "../../config/config.module";
import type { AppConfig } from "../../config/env";
import type { FileStorage, StoredFile } from "../../payments/storage";

export const PUBLIC_MEDIA_STORAGE = Symbol("PUBLIC_MEDIA_STORAGE");

/** Mirrors payments/storage.ts's object-naming discipline: server-generated, never from the
 *  admin's uploaded filename. A different prefix keeps the two storage areas visually distinct
 *  on disk even though they share the same `FileStorage` contract. */
export function generatePublicMediaObjectName(extension: string): string {
  return `public-media/${randomUUID()}.${extension}`;
}

function assertSafeObjectName(name: string): string {
  if (!/^public-media\/[0-9a-f-]{36}\.[a-z0-9]{1,10}$/.test(name)) {
    throw new Error(`refusing to use an unsafe storage object name: ${name}`);
  }
  return name;
}

/**
 * Local-disk storage for admin-uploaded catalogue images (covers, galleries). Public, unlike
 * payment proofs: served back by AdminMediaController's unauthenticated `/media/:key` route, not
 * gated by booking ownership. Kept behind the same `FileStorage` interface as payments/storage.ts
 * so either area can move to S3-compatible object storage later without touching call sites.
 */
@Injectable()
export class LocalPublicMediaStorage implements FileStorage {
  private readonly root: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.root = path.resolve(process.cwd(), config.publicMediaDir);
  }

  async save(objectName: string, data: Buffer): Promise<StoredFile> {
    const safeName = assertSafeObjectName(objectName);
    const full = path.join(this.root, safeName);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
    return { storageKey: safeName, sizeBytes: data.length };
  }

  async read(storageKey: string): Promise<Buffer> {
    const safeName = assertSafeObjectName(storageKey);
    return fs.readFile(path.join(this.root, safeName));
  }
}
