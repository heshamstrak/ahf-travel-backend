import { randomUUID } from "crypto";
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Errors } from "../../common/errors";
import { writeAudit } from "../../common/audit";
import { PrismaService } from "../../prisma/prisma.service";
import { PageQueryDto, pageMeta } from "../../catalog/common/query";
import { MediaReader } from "../../catalog/common/media";
import { AdminActor, auditActorOf } from "../common/admin-actor";
import { ContentStatusCode } from "../common/set-status.dto";
import { CreateDestinationDto, UpdateDestinationDto } from "./admin-destinations.dto";

@Injectable()
export class AdminDestinationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaReader,
  ) {}

  async list(query: PageQueryDto) {
    const where: Prisma.DestinationWhereInput = { deletedAt: null };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.destination.findMany({
        where,
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { _count: { select: { hotels: { where: { deletedAt: null } }, tours: { where: { deletedAt: null } }, packages: true } } },
      }),
      this.prisma.destination.count({ where }),
    ]);
    const covers = await this.media.coversByOwner(
      "DESTINATION",
      rows.map((r) => r.id),
    );
    const items = rows.map((r) => ({ ...r, relatedProductCount: r._count.hotels + r._count.tours + r._count.packages, cover: covers.get(r.id) ?? null }));
    return { items, meta: pageMeta(query.page, query.pageSize, total) };
  }

  async get(id: string) {
    const row = await this.prisma.destination.findUnique({ where: { id } });
    if (!row || row.deletedAt) throw Errors.notFound("Destination");
    return row;
  }

  async create(dto: CreateDestinationDto, actor: AdminActor) {
    const existing = await this.prisma.destination.findUnique({ where: { slug: dto.slug } });
    if (existing) throw Errors.conflict("SLUG_TAKEN", "This slug is already in use");
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.destination.create({
        data: {
          id: randomUUID(),
          slug: dto.slug,
          name: dto.name,
          nameAr: dto.nameAr ?? null,
          countryCode: dto.countryCode,
          description: dto.description ?? null,
          isFeatured: dto.isFeatured ?? false,
          sortOrder: dto.sortOrder ?? 0,
          status: dto.status ?? "DRAFT",
          createdById: actor.id,
          updatedById: actor.id,
        },
      });
      await writeAudit(tx, { actor: auditActorOf(actor), action: "destination.created", aggregateType: "Destination", aggregateId: row.id, after: { slug: row.slug } });
      return row;
    });
  }

  async update(id: string, dto: UpdateDestinationDto, actor: AdminActor) {
    await this.get(id);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.destination.update({
        where: { id },
        data: { ...dto, updatedById: actor.id },
      });
      await writeAudit(tx, { actor: auditActorOf(actor), action: "destination.updated", aggregateType: "Destination", aggregateId: id, after: dto as unknown as Prisma.InputJsonValue });
      return row;
    });
  }

  async setStatus(id: string, status: ContentStatusCode, actor: AdminActor) {
    await this.get(id);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.destination.update({ where: { id }, data: { status, updatedById: actor.id } });
      await writeAudit(tx, { actor: auditActorOf(actor), action: "destination.status_changed", aggregateType: "Destination", aggregateId: id, after: { status } });
      return row;
    });
  }

  async remove(id: string, actor: AdminActor): Promise<void> {
    await this.get(id);
    const [hotels, tours, packages, locations] = await Promise.all([
      this.prisma.hotel.count({ where: { destinationId: id, deletedAt: null } }),
      this.prisma.tour.count({ where: { destinationId: id, deletedAt: null } }),
      this.prisma.package.count({ where: { destinations: { some: { id } } } }),
      this.prisma.location.count({ where: { destinationId: id, deletedAt: null } }),
    ]);
    if (hotels + tours + packages + locations > 0) {
      throw Errors.conflict("DESTINATION_IN_USE", "This destination still has active hotels, tours, packages or locations");
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.destination.update({ where: { id }, data: { deletedAt: new Date(), status: "ARCHIVED", updatedById: actor.id } });
      await writeAudit(tx, { actor: auditActorOf(actor), action: "destination.deleted", aggregateType: "Destination", aggregateId: id, after: {} });
    });
  }
}
