import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import * as path from "path";
import { APP_CONFIG } from "../config/config.module";
import type { AppConfig } from "../config/env";

export interface StoredFile {
  storageKey: string;
  sizeBytes: number;
}

/**
 * Behind this interface so a later production deployment can swap in S3-compatible object storage
 * without touching the payments module. `objectName` is always server-generated (see
 * `generateProofObjectName`); nothing here ever derives a path from client input.
 */
export interface FileStorage {
  save(objectName: string, data: Buffer): Promise<StoredFile>;
  read(storageKey: string): Promise<Buffer>;
}

export const FILE_STORAGE = Symbol("FILE_STORAGE");

/** A random, extension-only object name. Never built from the client's filename. */
export function generateProofObjectName(extension: string): string {
  return `payment-proofs/${randomUUID()}.${extension}`;
}

/** Rejects anything that is not the simple `payment-proofs/<uuid>.<ext>` shape this module itself
 *  generates: defense-in-depth against path traversal, even though no caller passes user input here. */
function assertSafeObjectName(name: string): string {
  if (!/^payment-proofs\/[0-9a-f-]{36}\.[a-z0-9]{1,10}$/.test(name)) {
    throw new Error(`refusing to use an unsafe storage object name: ${name}`);
  }
  return name;
}

/**
 * Local-disk implementation for development. Files are written under a directory that is never
 * mounted into Express's static middleware (this app registers none), so the only way to read one
 * back is through the access-controlled proof endpoint, never a guessable public URL.
 */
@Injectable()
export class LocalFileStorage implements FileStorage {
  private readonly root: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.root = path.resolve(process.cwd(), config.paymentProofDir);
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
