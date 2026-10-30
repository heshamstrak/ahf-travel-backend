import { Transform } from "class-transformer";
import { IsIn, IsInt, IsOptional, Matches, Max, Min } from "class-validator";
import { PageQueryDto, toInt, toTrimmed } from "../common/query";

export const PACKAGE_SORTS = ["recommended", "price-asc", "price-desc"] as const;
export type PackageSort = (typeof PACKAGE_SORTS)[number];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class ListPackagesQuery extends PageQueryDto {
  @IsOptional()
  @Transform(toTrimmed)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: "must be a lowercase slug" })
  destination?: string;

  /** short: up to 3 nights. medium: 4 to 6 nights. long: 7 or more nights. */
  @IsOptional()
  @IsIn(["any", "short", "medium", "long"])
  duration?: "any" | "short" | "medium" | "long";

  @IsOptional()
  @IsIn(["any", "budget", "mid", "luxury"])
  budget?: "any" | "budget" | "mid" | "luxury";

  /** Only packages with an open departure on or after this date. */
  @IsOptional()
  @Matches(DATE, { message: "must be a date (YYYY-MM-DD)" })
  date?: string;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(10)
  travellers?: number;

  @IsOptional()
  @IsIn(PACKAGE_SORTS)
  sort?: PackageSort;
}

export class PackageDeparturesQuery {
  @Matches(DATE, { message: "must be a date (YYYY-MM-DD)" })
  from!: string;

  @Matches(DATE, { message: "must be a date (YYYY-MM-DD)" })
  to!: string;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(10)
  travellers?: number;
}
