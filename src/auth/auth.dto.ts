import { Language } from "@prisma/client";
import { Transform } from "class-transformer";
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  MinLength,
  Matches,
} from "class-validator";

const trim = ({ value }: { value: unknown }): unknown => (typeof value === "string" ? value.trim() : value);

export class RegisterDto {
  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 80)
  firstName!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 80)
  lastName!: string;

  @IsOptional()
  @IsEnum(Language)
  language?: Language;

  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;
}

export class LoginDto {
  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}

export class EmailDto {
  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class TokenDto {
  @IsString()
  @Length(20, 200)
  token!: string;
}

export class ResetPasswordDto {
  @IsString()
  @Length(20, 200)
  token!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}
