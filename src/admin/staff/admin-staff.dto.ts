import { Transform } from "class-transformer";
import { IsEmail, IsIn, IsString, Length, MaxLength, MinLength } from "class-validator";

const trim = ({ value }: { value: unknown }): unknown => (typeof value === "string" ? value.trim() : value);
const STAFF_ROLES = ["ADMIN", "FINANCE", "SUPPORT", "CONTENT_EDITOR"] as const;

/** Never CUSTOMER here: this endpoint provisions staff accounts only. A customer becomes staff
 *  only through this admin-authorized action, never through public registration. */
export class CreateStaffDto {
  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsString()
  @Length(1, 80)
  firstName!: string;

  @IsString()
  @Length(1, 80)
  lastName!: string;

  @IsIn(STAFF_ROLES)
  role!: (typeof STAFF_ROLES)[number];
}
