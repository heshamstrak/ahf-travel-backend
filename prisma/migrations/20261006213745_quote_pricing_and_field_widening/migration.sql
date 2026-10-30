-- AlterTable
ALTER TABLE "CarModel" ALTER COLUMN "fuelPolicy" SET DATA TYPE VARCHAR(200);

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "displayCurrency" CHAR(3),
ADD COLUMN     "displayFxRate" DECIMAL(18,8),
ADD COLUMN     "displayTotal" DECIMAL(12,2),
ADD COLUMN     "guestTokenHash" CHAR(64),
ADD COLUMN     "surcharge" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "TransferRate" ADD COLUMN     "isDevPlaceholder" BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- Hand-written rules (not expressible in the Prisma schema)
-- ---------------------------------------------------------------------------

-- Money is never negative, and the breakdown must add up exactly to the total.
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_money_nonnegative"
  CHECK (subtotal >= 0 AND discount >= 0 AND surcharge >= 0 AND fee >= 0 AND tax >= 0 AND total >= 0);
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_discount_within_subtotal"
  CHECK (discount <= subtotal);
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_total_adds_up"
  CHECK (total = subtotal - discount + surcharge + fee + tax);
-- Display conversion is all or nothing.
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_display_complete"
  CHECK (("displayCurrency" IS NULL AND "displayFxRate" IS NULL AND "displayTotal" IS NULL)
      OR ("displayCurrency" IS NOT NULL AND "displayFxRate" IS NOT NULL AND "displayTotal" IS NOT NULL));
-- Every quote belongs to a user or to a guest token.
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_has_owner"
  CHECK (("userId" IS NOT NULL) OR ("guestTokenHash" IS NOT NULL));
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_expiry_after_creation"
  CHECK ("expiresAt" > "createdAt");

-- Immutable snapshot. The only permitted change is consumedAt going from NULL to a timestamp,
-- which Milestone 4 uses for single-use consumption. Every other column is frozen.
CREATE OR REPLACE FUNCTION eb_quote_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Quote is immutable: deletion is not allowed';
  END IF;
  IF OLD."consumedAt" IS NULL AND NEW."consumedAt" IS NOT NULL
     AND (to_jsonb(NEW) - 'consumedAt') = (to_jsonb(OLD) - 'consumedAt') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Quote is immutable after creation';
END;
$$;

CREATE TRIGGER eb_quote_immutable
  BEFORE UPDATE OR DELETE ON "Quote"
  FOR EACH ROW EXECUTE FUNCTION eb_quote_immutable();

CREATE OR REPLACE FUNCTION eb_quote_no_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Quote is immutable: truncation is not allowed';
END;
$$;

CREATE TRIGGER eb_quote_no_truncate
  BEFORE TRUNCATE ON "Quote"
  FOR EACH STATEMENT EXECUTE FUNCTION eb_quote_no_truncate();
