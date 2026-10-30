import { Transform } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsISO8601, IsNumber, IsObject, IsOptional, IsString, Length, Max, Min } from "class-validator";
import { PageQueryDto, toBoolean, toInt, toNumber, toTrimmed } from "../../catalog/common/query";

const PRICING_RULE_KINDS = ["TAX", "FEE", "SURCHARGE", "DISCOUNT"] as const;
export type PricingRuleKindCode = (typeof PRICING_RULE_KINDS)[number];

const PRODUCT_TYPES = ["HOTEL", "TOUR", "CAR", "TRANSFER", "PACKAGE"] as const;
export type ProductTypeCode = (typeof PRODUCT_TYPES)[number];

export class ListPricingRulesQuery extends PageQueryDto {
  @IsOptional()
  @IsIn(PRICING_RULE_KINDS)
  kind?: PricingRuleKindCode;

  @IsOptional()
  @IsIn(PRODUCT_TYPES)
  productType?: ProductTypeCode;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;
}

export class CreatePricingRuleDto {
  @Transform(toTrimmed)
  @IsString()
  @Length(1, 60)
  code!: string;

  @IsIn(PRICING_RULE_KINDS)
  kind!: PricingRuleKindCode;

  @IsString()
  @Length(1, 120)
  label!: string;

  @IsOptional()
  @IsIn(PRODUCT_TYPES)
  productType?: ProductTypeCode;

  @IsOptional()
  @Transform(toNumber)
  @IsNumber()
  @Min(0)
  @Max(1)
  percent?: number;

  @IsOptional()
  @Transform(toNumber)
  @IsNumber()
  @Min(0)
  flatAmount?: number;

  @IsOptional()
  @Transform(toTrimmed)
  @Length(3, 3)
  flatCurrency?: string;

  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown>;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(0)
  @Max(1000)
  priority?: number;

  @IsISO8601()
  validFrom!: string;

  @IsOptional()
  @IsISO8601()
  validTo?: string;
}

export class UpdatePricingRuleDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  label?: string;

  @IsOptional()
  @IsIn(PRODUCT_TYPES)
  productType?: ProductTypeCode;

  @IsOptional()
  @Transform(toNumber)
  @IsNumber()
  @Min(0)
  @Max(1)
  percent?: number;

  @IsOptional()
  @Transform(toNumber)
  @IsNumber()
  @Min(0)
  flatAmount?: number;

  @IsOptional()
  @Transform(toTrimmed)
  @Length(3, 3)
  flatCurrency?: string;

  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown>;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(0)
  @Max(1000)
  priority?: number;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsISO8601()
  validFrom?: string;

  @IsOptional()
  @IsISO8601()
  validTo?: string;
}
