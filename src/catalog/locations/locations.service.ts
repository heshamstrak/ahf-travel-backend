import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { PUBLIC_DESTINATION } from "../destinations/destinations.repository";
import { pageOffset, Page, toPage } from "../common/query";
import { ListLocationsQuery } from "./locations.dto";

export interface LocationSummary {
  id: string;
  code: string | null;
  name: string;
  type: "AIRPORT" | "CAR_BRANCH" | "ZONE";
  latitude: string | null;
  longitude: string | null;
  destination: { id: string; slug: string; name: string };
}

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListLocationsQuery): Promise<Page<LocationSummary>> {
    const where: Prisma.LocationWhereInput = {
      status: "PUBLISHED",
      deletedAt: null,
      destination: {
        ...PUBLIC_DESTINATION,
        ...(query.destination ? { slug: query.destination } : {}),
      },
      ...(query.type ? { type: query.type } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.location.findMany({
        where,
        include: { destination: { select: { id: true, slug: true, name: true } } },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: pageOffset(query.page, query.pageSize),
        take: query.pageSize,
      }),
      this.prisma.location.count({ where }),
    ]);
    const items = rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      type: row.type,
      latitude: row.latitude?.toString() ?? null,
      longitude: row.longitude?.toString() ?? null,
      destination: row.destination,
    }));
    return toPage(items, query, total);
  }
}
