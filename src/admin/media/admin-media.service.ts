import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { AppError, Errors } from "../../common/errors";
import { writeAudit } from "../../common/audit";
import { PrismaService } from "../../prisma/prisma.service";
import { AdminActor, auditActorOf } from "../common/admin-actor";
import { ListMediaQuery, UpdateMediaDto, UploadMediaDto } from "./admin-media.dto";
import { validateImageFile } from "./image-validation";
import { generatePublicMediaObjectName, PUBLIC_MEDIA_STORAGE } from "./public-media-storage";
import type { FileStorage } from "../../payments/storage";
import { BRANDING_SLOT_OWNER_IDS } from "../settings/branding-slots";

@Injectable()
export class AdminMediaService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUBLIC_MEDIA_STORAGE) private readonly storage: FileStorage,
  ) {}

  /** Confirms the referenced catalogue row actually exists, so Media never silently points at
   *  nothing. Media.ownerId has no foreign key (polymorphic across seven owner types), so this is
   *  the only integrity check available, and must run before the row is created. */
  private async assertOwnerExists(ownerType: UploadMediaDto["ownerType"], ownerId: string): Promise<void> {
    const exists = await (async () => {
      switch (ownerType) {
        case "DESTINATION":
          return this.prisma.destination.findUnique({ where: { id: ownerId }, select: { id: true } });
        case "HOTEL":
          return this.prisma.hotel.findUnique({ where: { id: ownerId }, select: { id: true } });
        case "ROOM":
          return this.prisma.room.findUnique({ where: { id: ownerId }, select: { id: true } });
        case "TOUR":
          return this.prisma.tour.findUnique({ where: { id: ownerId }, select: { id: true } });
        case "CAR_MODEL":
          return this.prisma.carModel.findUnique({ where: { id: ownerId }, select: { id: true } });
        case "TRANSFER_VEHICLE_CLASS":
          return this.prisma.transferVehicleClass.findUnique({ where: { id: ownerId }, select: { id: true } });
        case "PACKAGE":
          return this.prisma.package.findUnique({ where: { id: ownerId }, select: { id: true } });
        case "SITE_BRANDING":
          return BRANDING_SLOT_OWNER_IDS.includes(ownerId) ? { id: ownerId } : null;
      }
    })();
    if (!exists) throw Errors.notFound("Owner record");
  }

  /** The admin UI's gallery for one owner (a hotel, a room, a tour, …) — every non-deleted image, in
   *  display order, cover first. There is no public equivalent of this: the public catalogue reads
   *  already select and order covers/galleries per product (Milestone 2), this is only for the admin
   *  media-management screens. */
  async list(query: ListMediaQuery) {
    const rows = await this.prisma.media.findMany({
      where: { ownerType: query.ownerType, ownerId: query.ownerId, deletedAt: null },
      orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return rows.map((row) => this.toView(row));
  }

  async upload(dto: UploadMediaDto, file: { buffer: Buffer; size: number }, maxBytes: number, actor: AdminActor) {
    await this.assertOwnerExists(dto.ownerType, dto.ownerId);
    const validated = validateImageFile(file, maxBytes);
    const objectName = generatePublicMediaObjectName(validated.extension);
    const stored = await this.storage.save(objectName, file.buffer);

    const media = await this.prisma.$transaction(async (tx) => {
      if (dto.isCover) {
        await tx.media.updateMany({ where: { ownerType: dto.ownerType, ownerId: dto.ownerId, isCover: true }, data: { isCover: false } });
      }
      const nextSort = await tx.media.count({ where: { ownerType: dto.ownerType, ownerId: dto.ownerId } });
      const row = await tx.media.create({
        data: {
          id: randomUUID(),
          ownerType: dto.ownerType,
          ownerId: dto.ownerId,
          storageKey: stored.storageKey,
          variants: {},
          mimeType: validated.mimeType,
          width: 0,
          height: 0,
          sizeBytes: stored.sizeBytes,
          altText: dto.altText ?? `${dto.ownerType.toLowerCase().replace(/_/g, " ")} image`,
          source: "UPLOAD",
          status: "READY",
          isCover: dto.isCover ?? false,
          sortOrder: nextSort,
          uploadedById: actor.id,
        },
      });
      await writeAudit(tx, {
        actor: auditActorOf(actor),
        action: "media.uploaded",
        aggregateType: "Media",
        aggregateId: row.id,
        after: { ownerType: dto.ownerType, ownerId: dto.ownerId },
      });
      return row;
    });

    return this.toView(media);
  }

  async update(id: string, dto: UpdateMediaDto, actor: AdminActor) {
    const existing = await this.prisma.media.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) throw Errors.notFound("Media");

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.isCover) {
        await tx.media.updateMany({ where: { ownerType: existing.ownerType, ownerId: existing.ownerId, isCover: true, NOT: { id } }, data: { isCover: false } });
      }
      const row = await tx.media.update({
        where: { id },
        data: {
          ...(dto.altText !== undefined ? { altText: dto.altText } : {}),
          ...(dto.isCover !== undefined ? { isCover: dto.isCover } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        },
      });
      await writeAudit(tx, {
        actor: auditActorOf(actor),
        action: "media.updated",
        aggregateType: "Media",
        aggregateId: id,
        after: dto as unknown as Prisma.InputJsonValue,
      });
      return row;
    });
    return this.toView(updated);
  }

  /** Replaces the underlying file of an existing Media row in place: same id, same gallery
   *  position (sortOrder) and cover status, new bytes. The alternative — delete then re-upload —
   *  loses position and cover status, which is why this exists as its own action. The previous
   *  object is left in storage, same as `remove()` leaves its object behind: this module has no
   *  storage-delete primitive (see `FileStorage`), so neither path hard-deletes bytes on disk. */
  async replaceFile(id: string, file: { buffer: Buffer; size: number }, maxBytes: number, actor: AdminActor) {
    const existing = await this.prisma.media.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) throw Errors.notFound("Media");

    const validated = validateImageFile(file, maxBytes);
    const objectName = generatePublicMediaObjectName(validated.extension);
    const stored = await this.storage.save(objectName, file.buffer);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.media.update({
        where: { id },
        data: {
          storageKey: stored.storageKey,
          mimeType: validated.mimeType,
          sizeBytes: stored.sizeBytes,
          width: 0,
          height: 0,
          // The new bytes are a real admin upload now, not whatever this row started as — otherwise
          // toView() would keep serving the old external sourceUrl instead of the replaced file.
          source: "UPLOAD",
          sourceUrl: null,
          attribution: null,
          licenseCode: null,
        },
      });
      await writeAudit(tx, {
        actor: auditActorOf(actor),
        action: "media.replaced",
        aggregateType: "Media",
        aggregateId: id,
        after: { ownerType: existing.ownerType, ownerId: existing.ownerId },
      });
      return row;
    });
    return this.toView(updated);
  }

  async remove(id: string, actor: AdminActor): Promise<void> {
    const existing = await this.prisma.media.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) throw Errors.notFound("Media");
    await this.prisma.$transaction(async (tx) => {
      await tx.media.update({ where: { id }, data: { deletedAt: new Date(), status: "REJECTED" } });
      await writeAudit(tx, {
        actor: auditActorOf(actor),
        action: "media.removed",
        aggregateType: "Media",
        aggregateId: id,
        after: {},
      });
    });
  }

  async readFile(storageKey: string): Promise<{ buffer: Buffer }> {
    try {
      return { buffer: await this.storage.read(storageKey) };
    } catch {
      throw new AppError(HttpStatus.NOT_FOUND, "NOT_FOUND", "File was not found");
    }
  }

  private toView(media: { id: string; ownerType: string; ownerId: string; storageKey: string; source?: string; sourceUrl?: string | null; altText: string; isCover: boolean; sortOrder: number }) {
    return {
      id: media.id,
      ownerType: media.ownerType,
      ownerId: media.ownerId,
      // Seed-imported rows (MediaReader.urlOf mirrors this) point at their real external source —
      // their storageKey is a synthetic reference, not a real stored object, so it can't be served
      // back through this module's own /media/*key route the way an admin upload can.
      url: media.source === "IMPORTED_EXTERNAL" && media.sourceUrl ? media.sourceUrl : `/api/v1/media/${media.storageKey}`,
      altText: media.altText,
      isCover: media.isCover,
      sortOrder: media.sortOrder,
    };
  }
}
