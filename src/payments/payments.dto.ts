import { Transform } from "class-transformer";
import { IsEmail, IsIn, IsOptional, IsString, Length } from "class-validator";
import { PageQueryDto, toTrimmed } from "../catalog/common/query";

/** Body for selecting CASH. Guests prove ownership with the booking's own email, same as cancel. */
export class SelectCashDto {
  @IsOptional()
  @IsEmail()
  email?: string;
}

/**
 * Text fields for an InstaPay proof submission. The file itself arrives as a separate multipart
 * part, handled by Multer, never by class-validator.
 */
export class SubmitInstapayProofDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @Length(4, 120)
  transferReference!: string;
}

export class RejectInstapayDto {
  @IsString()
  @Length(1, 255)
  reason!: string;
}

const INSTAPAY_LIST_STATUSES = ["PENDING_VERIFICATION", "SUCCEEDED", "REJECTED"] as const;

export class ListInstapayQuery extends PageQueryDto {
  @IsOptional()
  @Transform(toTrimmed)
  @IsIn(INSTAPAY_LIST_STATUSES)
  status?: (typeof INSTAPAY_LIST_STATUSES)[number];
}

export class ProofAccessQuery {
  @IsOptional()
  @IsEmail()
  email?: string;
}
