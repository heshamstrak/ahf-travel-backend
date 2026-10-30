-- The original total check (Milestone 1) predates surcharges, so any quote with a surcharge violated it.
-- Quote_total_adds_up (added with the quote pricing migration) states the complete rule:
--   total = subtotal - discount + surcharge + fee + tax
-- so the old constraint is dropped, not weakened.
ALTER TABLE "Quote" DROP CONSTRAINT "Quote_total_reconciles";
