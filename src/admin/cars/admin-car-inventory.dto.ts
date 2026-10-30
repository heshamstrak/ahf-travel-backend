import { Transform } from "class-transformer";
import { IsInt, IsUUID, Matches, Max, Min } from "class-validator";
import { toInt } from "../../catalog/common/query";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class SetCarInventoryDto {
  @IsUUID()
  locationId!: string;

  @Matches(DATE, { message: "must be a date (YYYY-MM-DD)" })
  startDate!: string;

  @Matches(DATE, { message: "must be a date (YYYY-MM-DD)" })
  endDate!: string;

  @Transform(toInt)
  @IsInt()
  @Min(0)
  @Max(999)
  totalUnits!: number;
}
