import { Transform, Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Length, Max, Min, ValidateNested } from "class-validator";
import { toTrimmed } from "../../catalog/common/query";

export class CancellationRuleDto {
  @IsInt()
  @Min(0)
  hoursBeforeStart!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  refundPercent!: number;
}

export class CreatePolicyDto {
  @Transform(toTrimmed)
  @IsString()
  @Length(1, 40)
  code!: string;

  @IsString()
  @Length(1, 120)
  name!: string;

  @IsString()
  description!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CancellationRuleDto)
  rules!: CancellationRuleDto[];
}

export class UpdatePolicyDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CancellationRuleDto)
  rules?: CancellationRuleDto[];
}
