import { Transform } from "class-transformer";
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { PageQueryDto, toBoolean, toTrimmed } from "../common/query";

export class ListDestinationsQuery extends PageQueryDto {
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @Transform(toTrimmed)
  @IsString()
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @IsIn(["sortOrder", "name"])
  sort?: "sortOrder" | "name";
}
