import { Transform } from "class-transformer";
import { IsIn, IsOptional, IsString, Length, Matches } from "class-validator";
import { PageQueryDto, toTrimmed } from "../common/query";

export class ListLocationsQuery extends PageQueryDto {
  @IsOptional()
  @IsIn(["AIRPORT", "CAR_BRANCH", "ZONE"])
  type?: "AIRPORT" | "CAR_BRANCH" | "ZONE";

  /** Destination slug, e.g. "cairo". */
  @IsOptional()
  @Transform(toTrimmed)
  @IsString()
  @Length(1, 80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: "must be a lowercase slug" })
  destination?: string;
}
