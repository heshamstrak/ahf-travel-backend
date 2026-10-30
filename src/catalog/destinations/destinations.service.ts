import { Injectable } from "@nestjs/common";
import { Errors } from "../../common/errors";
import { IdOrSlug } from "../common/identifiers";
import { MediaReader, PublicImage } from "../common/media";
import { Page, toPage } from "../common/query";
import { DestinationsRepository } from "./destinations.repository";
import { ListDestinationsQuery } from "./destinations.dto";

export interface DestinationSummary {
  id: string;
  slug: string;
  name: string;
  countryCode: string;
  description: string | null;
  isFeatured: boolean;
  image: PublicImage | null;
  productCounts: { hotels: number; tours: number; packages: number };
}

export type DestinationDetail = DestinationSummary;

@Injectable()
export class DestinationsService {
  constructor(
    private readonly repo: DestinationsRepository,
    private readonly media: MediaReader,
  ) {}

  async list(query: ListDestinationsQuery): Promise<Page<DestinationSummary>> {
    const { rows, total } = await this.repo.list({
      featured: query.featured,
      q: query.q,
      sort: query.sort ?? "sortOrder",
      page: query.page,
      pageSize: query.pageSize,
    });
    const ids = rows.map((row) => row.id);
    const [covers, counts] = await Promise.all([
      this.media.coversByOwner("DESTINATION", ids),
      this.repo.productCounts(ids),
    ]);
    const items = rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      countryCode: row.countryCode,
      description: row.description,
      isFeatured: row.isFeatured,
      image: covers.get(row.id) ?? null,
      productCounts: {
        hotels: counts.hotels.get(row.id) ?? 0,
        tours: counts.tours.get(row.id) ?? 0,
        packages: counts.packages.get(row.id) ?? 0,
      },
    }));
    return toPage(items, query, total);
  }

  async detail(key: IdOrSlug): Promise<DestinationDetail> {
    const row = await this.repo.findPublic(key);
    if (!row) throw Errors.notFound("Destination");
    const [covers, counts] = await Promise.all([
      this.media.coversByOwner("DESTINATION", [row.id]),
      this.repo.productCounts([row.id]),
    ]);
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      countryCode: row.countryCode,
      description: row.description,
      isFeatured: row.isFeatured,
      image: covers.get(row.id) ?? null,
      productCounts: {
        hotels: counts.hotels.get(row.id) ?? 0,
        tours: counts.tours.get(row.id) ?? 0,
        packages: counts.packages.get(row.id) ?? 0,
      },
    };
  }
}
