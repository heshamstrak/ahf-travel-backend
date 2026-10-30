import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { pageOffset } from "../common/query";

const PUBLIC_LOCATION: Prisma.LocationWhereInput = { status: "PUBLISHED", deletedAt: null };

export interface RateFilter {
  originLocationId: string;
  destinationLocationId: string;
  date: Date;
  passengers: number;
  luggage: number;
  page: number;
  pageSize: number;
}

@Injectable()
export class TransfersRepository {
  constructor(private readonly prisma: PrismaService) {}

  private where(filter: RateFilter): Prisma.TransferRateWhereInput {
    return {
      isActive: true,
      originLocationId: filter.originLocationId,
      destinationLocationId: filter.destinationLocationId,
      origin: PUBLIC_LOCATION,
      destination: PUBLIC_LOCATION,
      validFrom: { lte: filter.date },
      OR: [{ validTo: null }, { validTo: { gte: filter.date } }],
      vehicleClass: {
        isActive: true,
        passengersMax: { gte: filter.passengers },
        luggageMax: { gte: filter.luggage },
      },
    };
  }

  async rates(filter: RateFilter) {
    const where = this.where(filter);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.transferRate.findMany({
        where,
        orderBy: [{ amount: "asc" }, { id: "asc" }],
        skip: pageOffset(filter.page, filter.pageSize),
        take: filter.pageSize,
        include: {
          origin: { select: { id: true, name: true, code: true, type: true } },
          destination: { select: { id: true, name: true, code: true, type: true } },
          vehicleClass: true,
        },
      }),
      this.prisma.transferRate.count({ where }),
    ]);
    return { rows, total };
  }

  vehicleClasses() {
    return this.prisma.transferVehicleClass.findMany({
      where: { isActive: true },
      orderBy: [{ passengersMax: "asc" }, { code: "asc" }],
    });
  }
}
