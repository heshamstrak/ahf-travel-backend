import { Transform, Type } from "class-transformer";
import { IsEmail, IsIn, IsOptional, IsString, IsUUID, Length, Matches, MaxLength, ValidateNested } from "class-validator";
import { PageQueryDto } from "../catalog/common/query";

/** Validated customer/contact input. None of this is authoritative money: the quote is. */
export class BookingCustomerDto {
  @IsString()
  @Length(1, 80)
  firstName!: string;

  @IsString()
  @Length(1, 80)
  lastName!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @Matches(/^\+?[0-9 ()-]{6,20}$/, { message: "must be a plausible phone number" })
  phone!: string;

  @IsString()
  @Matches(/^[A-Z]{2}$/, { message: "must be an ISO 3166-1 alpha-2 code" })
  countryCode!: string;
}

/**
 * Body for POST /bookings. The client supplies only the quote id and the customer's own details.
 * There is no price, tax, fee, discount, inventory counter or alternate product id here: everything
 * authoritative comes from the immutable quote the server already calculated.
 */
export class CreateBookingDto {
  @IsUUID()
  quoteId!: string;

  @ValidateNested()
  @Type(() => BookingCustomerDto)
  customer!: BookingCustomerDto;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  specialRequests?: string;
}

/** Query parameters for reading or cancelling a guest booking: the reference alone is not enough. */
export class BookingAccessQuery {
  @IsOptional()
  @IsEmail()
  email?: string;
}

export class CancelBookingDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}

const BOOKING_STATUSES = ["PENDING_PAYMENT", "CONFIRMED", "COMPLETED", "CANCELLED", "EXPIRED"] as const;

/** Query for GET /bookings — the signed-in customer's own bookings only (Milestone 7). There is no
 *  guest equivalent: a guest has no persistent identity to list by, only the reference+email lookup
 *  GET /bookings/:idOrReference already provides. */
export class ListMyBookingsQuery extends PageQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim().toUpperCase() : value))
  @IsIn(BOOKING_STATUSES)
  status?: (typeof BOOKING_STATUSES)[number];
}
