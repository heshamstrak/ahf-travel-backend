import { Injectable } from "@nestjs/common";
import { CarCategory, Prisma, Transmission } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { IdOrSlug, idOrSlugWhere } from "../common/identifiers";
import { pageOffset } from "../common/query";
import { CarSort } from "./cars.dto";

export const PUBLIC_CAR: Prisma.CarModelWhereInput = { status: "PUBLISHED", deletedAt: null };

export interface CarListFilter {
  driverAge?: number;
  categories?: string[];
  transmission?: string;
  minPassengers?: number;
  minBags?: number;
  airConditioning?: boolean;
  brands?: string[];
  maxPrice?: number;
  sort: CarSort;
  page: number;
  pageSize: number;
}

const ORDER: Record<CarSort, Prisma.CarModelOrderByWithRelationInput[]> = {
  recommended: [{ pricePerDay: "asc" }, { name: "asc" }, { id: "asc" }],
  "price-asc": [{ pricePerDay: "asc" }, { id: "asc" }],
  "price-desc": [{ pricePerDay: "desc" }, { id: "asc" }],
};

@Injectable()
export class CarsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private listWhere(filter: CarListFilter): Prisma.CarModelWhereInput {
    return {
      ...PUBLIC_CAR,
      ...(filter.driverAge !== undefined ? { minDriverAge: { lte: filter.driverAge } } : {}),
      ...(filter.categories?.length ? { category: { in: filter.categories as CarCategory[] } } : {}),
      ...(filter.transmission && filter.transmission !== "ANY"
        ? { transmission: filter.transmission as Transmission }
        : {}),
      ...(filter.minPassengers !== undefined ? { passengers: { gte: filter.minPassengers } } : {}),
      ...(filter.minBags !== undefined ? { bags: { gte: filter.minBags } } : {}),
      ...(filter.airConditioning ? { hasAirConditioning: true } : {}),
      ...(filter.brands?.length ? { brand: { in: filter.brands } } : {}),
      ...(filter.maxPrice !== undefined ? { pricePerDay: { lte: filter.maxPrice } } : {}),
    };
  }

  async list(filter: CarListFilter) {
    const where = this.listWhere(filter);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.carModel.findMany({
        where,
        orderBy: ORDER[filter.sort],
        skip: pageOffset(filter.page, filter.pageSize),
        take: filter.pageSize,
      }),
      this.prisma.carModel.count({ where }),
    ]);
    return { rows, total };
  }

  findPublic(key: IdOrSlug) {
    return this.prisma.carModel.findFirst({
      where: { ...idOrSlugWhere(key), ...PUBLIC_CAR },
      include: { cancellationPolicy: { select: { code: true, name: true, description: true, rules: true } } },
    });
  }
}
