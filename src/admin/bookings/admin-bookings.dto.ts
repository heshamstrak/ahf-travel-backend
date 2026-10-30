import { Transform } from "class-transformer";
import { IsIn, IsOptional, IsString, Length, Matches } from "class-validator";
import { PageQueryDto, toTrimmed } from "../../catalog/common/query";

const BOOKING_STATUSES = ["PENDING_PAYMENT", "CONFIRMED", "COMPLETED", "CANCELLED", "EXPIRED"] as const;
const PRODUCT_TYPES = ["HOTEL", "TOUR", "CAR", "TRANSFER", "PACKAGE"] as const;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class ListBookingsQuery extends PageQueryDto {
  @IsOptional()
  @Transform(toTrimmed)
  @IsString()
  @Length(1, 20)
  reference?: string;

  @IsOptional()
  @IsIn(BOOKING_STATUSES)
  status?: (typeof BOOKING_STATUSES)[number];

  @IsOptional()
  @IsIn(PRODUCT_TYPES)
  productType?: (typeof PRODUCT_TYPES)[number];

  @IsOptional()
  @Matches(DATE, { message: "must be a date (YYYY-MM-DD)" })
  dateFrom?: string;

  @IsOptional()
  @Matches(DATE, { message: "must be a date (YYYY-MM-DD)" })
  dateTo?: string;
}

export class AdminCancelBookingDto {
  @IsOptional()
  @IsString()
  @Length(1, 255)
  reason?: string;
}
