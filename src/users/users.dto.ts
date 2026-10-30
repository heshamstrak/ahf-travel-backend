import { Language } from "@prisma/client";
import { Transform } from "class-transformer";
import { IsEnum, IsOptional, IsString, Length, Matches, MaxLength, MinLength } from "class-validator";

const trim = ({ value }: { value: unknown }): unknown => (typeof value === "string" ? value.trim() : value);

export class UpdateProfileDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 80)
  firstName?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 80)
  lastName?: string;

  /** E.164 format, e.g. +201001234567 */
  @IsOptional()
  @Matches(/^\+[1-9]\d{6,14}$/)
  phone?: string;

  /** ISO 3166-1 alpha-2 */
  @IsOptional()
  @Matches(/^[A-Z]{2}$/)
  countryCode?: string;
}

export class UpdatePreferencesDto {
  @IsOptional()
  @IsEnum(Language)
  language?: Language;

  /** ISO 4217. Currency list is configuration, validated against Setting in a later milestone. */
  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;
}

export class ChangePasswordBodyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}
