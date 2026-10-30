import { IsIn, IsObject, IsOptional, IsUUID, Matches } from "class-validator";

export const QUOTE_PRODUCT_TYPES = ["HOTEL", "TOUR", "CAR", "TRANSFER", "PACKAGE"] as const;
export type QuoteProductType = (typeof QUOTE_PRODUCT_TYPES)[number];

/**
 * Request body for POST /quotes. Only the product and the selection are accepted. The whitelist refuses
 * any other field, so a client cannot send its own subtotal, tax, fee, discount or total.
 */
export class CreateQuoteDto {
  @IsIn(QUOTE_PRODUCT_TYPES)
  productType!: QuoteProductType;

  /** The sold unit: ratePlanId | tourSessionId | carModelId | transferRateId | packageDepartureId. */
  @IsUUID()
  productId!: string;

  /** Validated per product by a strict schema (quote-selection.ts). */
  @IsObject()
  selection!: Record<string, unknown>;

  /** Presentation only. Omitted means the quote currency. */
  @IsOptional()
  @Matches(/^[A-Z]{3}$/, { message: "must be an ISO 4217 code" })
  displayCurrency?: string;
}
