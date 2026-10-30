import { Transform } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsOptional, IsUUID, Length, Min } from "class-validator";
import { toBoolean, toInt } from "../../catalog/common/query";

/** Every owner type Media supports except PAYMENT_PROOF: that one is created only by the payments
 *  module's own InstaPay submission flow, never through this general admin upload endpoint. */
export const PUBLIC_MEDIA_OWNER_TYPES = [
  "DESTINATION",
  "HOTEL",
  "ROOM",
  "TOUR",
  "CAR_MODEL",
  "TRANSFER_VEHICLE_CLASS",
  "PACKAGE",
  "SITE_BRANDING",
] as const;
export type PublicMediaOwnerType = (typeof PUBLIC_MEDIA_OWNER_TYPES)[number];

export class ListMediaQuery {
  @IsIn(PUBLIC_MEDIA_OWNER_TYPES)
  ownerType!: PublicMediaOwnerType;

  @IsUUID()
  ownerId!: string;
}

export class UploadMediaDto {
  @IsIn(PUBLIC_MEDIA_OWNER_TYPES)
  ownerType!: PublicMediaOwnerType;

  @IsUUID()
  ownerId!: string;

  @IsOptional()
  @Length(1, 255)
  altText?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isCover?: boolean;
}

export class UpdateMediaDto {
  @IsOptional()
  @Length(1, 255)
  altText?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isCover?: boolean;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
