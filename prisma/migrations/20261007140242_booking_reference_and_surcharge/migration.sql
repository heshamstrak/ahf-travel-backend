-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "surcharge" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- Hand-written rules (not expressible in the Prisma schema)
-- ---------------------------------------------------------------------------

-- The Milestone 1 total check predates surcharges (same issue fixed on Quote in Milestone 3).
-- Any booking with a surcharge (for example a young driver on a car rental) violated it.
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_total_reconciles";
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_total_reconciles"
  CHECK ("total" = "subtotal" - "discount" + "surcharge" + "tax" + "fee");
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_surcharge_nonnegative" CHECK ("surcharge" >= 0);

-- Source of booking references. Not a Prisma model: Prisma manages tables, not bare sequences,
-- and nothing here needs an ORM mapping. The application reads nextval() and encodes it
-- (backend/src/bookings/booking-reference.ts) into the customer-facing "EB-xxxxxxx" code.
-- Starting well above zero and applying a bijective scramble keeps references from reading as
-- a simple visit counter, without needing a second random-collision-prone generator.
CREATE SEQUENCE "booking_reference_seq" AS BIGINT START WITH 100000 INCREMENT BY 1;
