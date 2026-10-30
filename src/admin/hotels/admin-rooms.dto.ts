import { Transform } from "class-transformer";
import { ArrayUnique, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from "class-validator";
import { toInt, toTrimmed } from "../../catalog/common/query";
import { toStringList } from "../../catalog/common/lists";
import { PageQueryDto } from "../../catalog/common/query";
import { CONTENT_STATUSES, ContentStatusCode } from "../common/set-status.dto";

/** The cross-hotel "Hotel Rooms" admin table — every room, across every hotel, searchable by
 *  room/hotel name and filterable by hotel or status. */
export class ListAllRoomsQuery extends PageQueryDto {
  @IsOptional()
  @Transform(toTrimmed)
  @Length(1, 120)
  q?: string;

  @IsOptional()
  @IsUUID()
  hotelId?: string;

  @IsOptional()
  @IsIn(CONTENT_STATUSES)
  status?: ContentStatusCode;
}

export class CreateRoomDto {
  @Transform(toTrimmed)
  @IsString()
  @Length(1, 40)
  code!: string;

  @IsString()
  @Length(1, 120)
  name!: string;

  @IsString()
  @Length(1, 80)
  bedType!: string;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  baseOccupancy!: number;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  maxAdults!: number;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(0)
  maxChildren?: number;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(1000)
  sizeSqm?: number;

  @IsOptional()
  @Transform(toStringList)
  @IsArray()
  @ArrayUnique()
  features?: string[];
}

export class UpdateRoomDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  bedType?: string;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  baseOccupancy?: number;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  maxAdults?: number;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(0)
  maxChildren?: number;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(1000)
  sizeSqm?: number;

  @IsOptional()
  @Transform(toStringList)
  @IsArray()
  @ArrayUnique()
  features?: string[];
}
