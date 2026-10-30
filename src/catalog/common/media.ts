import { Inject, Injectable } from "@nestjs/common";
import type { MediaOwnerType } from "@prisma/client";
import { APP_CONFIG } from "../../config/config.module";
import type { AppConfig } from "../../config/env";
import { PrismaService } from "../../prisma/prisma.service";

/** Public image representation. Storage keys, uploader ids and internal status never leave the server. */
export interface PublicImage {
  url: string;
  altText: string;
  width: number;
  height: number;
  attribution: string | null;
  license: string | null;
  isCover: boolean;
}

interface MediaRow {
  ownerId: string;
  source: string;
  sourceUrl: string | null;
  storageKey: string;
  altText: string;
  width: number;
  height: number;
  attribution: string | null;
  licenseCode: string | null;
  isCover: boolean;
}

const READY_MEDIA = { status: "READY" as const, deletedAt: null };
const ORDER = [{ isCover: "desc" as const }, { sortOrder: "asc" as const }, { id: "asc" as const }];

/**
 * Reads public images for catalogue products. Every method issues one query for any number of
 * owners, so list pages never run one query per product.
 */
@Injectable()
export class MediaReader {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Imported images use their recorded source. Uploaded images are served from the CDN. */
  private urlOf(row: Pick<MediaRow, "source" | "sourceUrl" | "storageKey">): string {
    if (row.source === "IMPORTED_EXTERNAL" && row.sourceUrl) return row.sourceUrl;
    return `${this.config.mediaCdnBaseUrl}/${row.storageKey}`;
  }

  private toPublic(row: MediaRow): PublicImage {
    return {
      url: this.urlOf(row),
      altText: row.altText,
      width: row.width,
      height: row.height,
      attribution: row.attribution,
      license: row.licenseCode,
      isCover: row.isCover,
    };
  }

  async coversByOwner(ownerType: MediaOwnerType, ownerIds: string[]): Promise<Map<string, PublicImage>> {
    const covers = new Map<string, PublicImage>();
    if (ownerIds.length === 0) return covers;
    const rows = await this.prisma.media.findMany({
      where: { ownerType, ownerId: { in: ownerIds }, ...READY_MEDIA },
      orderBy: ORDER,
    });
    for (const row of rows) {
      if (!covers.has(row.ownerId)) covers.set(row.ownerId, this.toPublic(row));
    }
    return covers;
  }

  async galleriesByOwner(ownerType: MediaOwnerType, ownerIds: string[]): Promise<Map<string, PublicImage[]>> {
    const galleries = new Map<string, PublicImage[]>();
    if (ownerIds.length === 0) return galleries;
    const rows = await this.prisma.media.findMany({
      where: { ownerType, ownerId: { in: ownerIds }, ...READY_MEDIA },
      orderBy: ORDER,
    });
    for (const row of rows) {
      const list = galleries.get(row.ownerId) ?? [];
      list.push(this.toPublic(row));
      galleries.set(row.ownerId, list);
    }
    return galleries;
  }
}
