import { Transform } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Matches, Min } from "class-validator";
import { toBoolean, toInt, toTrimmed } from "../../catalog/common/query";

const STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;

export class CreateDestinationDto {
  @Transform(toTrimmed)
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: "must be a lowercase slug" })
  @Length(1, 80)
  slug!: string;

  @IsString()
  @Length(1, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  nameAr?: string;

  @Transform(toTrimmed)
  @Matches(/^[A-Z]{2}$/, { message: "must be an ISO 3166-1 alpha-2 code" })
  countryCode!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];
}

export { SetStatusDto } from "../common/set-status.dto";

export class UpdateDestinationDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  nameAr?: string;

  @IsOptional()
  @Transform(toTrimmed)
  @Matches(/^[A-Z]{2}$/, { message: "must be an ISO 3166-1 alpha-2 code" })
  countryCode?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
