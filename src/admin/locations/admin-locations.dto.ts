import { Transform } from "class-transformer";
import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Length } from "class-validator";
import { PageQueryDto } from "../../catalog/common/query";
import { toNumber, toTrimmed } from "../../catalog/common/query";

const LOCATION_TYPES = ["AIRPORT", "CAR_BRANCH", "ZONE"] as const;

export class ListLocationsQuery extends PageQueryDto {
  @IsOptional()
  @IsUUID()
  destinationId?: string;

  @IsOptional()
  @IsIn(LOCATION_TYPES)
  type?: (typeof LOCATION_TYPES)[number];
}

export class CreateLocationDto {
  @IsIn(LOCATION_TYPES)
  type!: (typeof LOCATION_TYPES)[number];

  @IsOptional()
  @Transform(toTrimmed)
  @IsString()
  @Length(2, 10)
  code?: string;

  @IsString()
  @Length(1, 160)
  name!: string;

  @IsUUID()
  destinationId!: string;

  @IsOptional()
  @Transform(toNumber)
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @Transform(toNumber)
  @IsNumber()
  longitude?: number;
}

export class UpdateLocationDto {
  @IsOptional()
  @IsString()
  @Length(1, 160)
  name?: string;

  @IsOptional()
  @Transform(toNumber)
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @Transform(toNumber)
  @IsNumber()
  longitude?: number;
}
