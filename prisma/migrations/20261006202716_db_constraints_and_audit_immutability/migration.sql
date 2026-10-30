-- Database-enforced invariants that Prisma cannot express.
-- Inventory counters: no negative counts, and held + sold + blocked never exceeds total.

ALTER TABLE "RoomInventory"
  ADD CONSTRAINT "RoomInventory_counters_nonneg" CHECK ("totalUnits" >= 0 AND "heldUnits" >= 0 AND "soldUnits" >= 0 AND "blockedUnits" >= 0),
  ADD CONSTRAINT "RoomInventory_capacity" CHECK ("soldUnits" + "heldUnits" + "blockedUnits" <= "totalUnits");

ALTER TABLE "TourSession"
  ADD CONSTRAINT "TourSession_counters_nonneg" CHECK ("capacity" >= 0 AND "heldUnits" >= 0 AND "bookedUnits" >= 0),
  ADD CONSTRAINT "TourSession_capacity" CHECK ("bookedUnits" + "heldUnits" <= "capacity");

ALTER TABLE "CarInventory"
  ADD CONSTRAINT "CarInventory_counters_nonneg" CHECK ("totalUnits" >= 0 AND "heldUnits" >= 0 AND "bookedUnits" >= 0 AND "blockedUnits" >= 0),
  ADD CONSTRAINT "CarInventory_capacity" CHECK ("bookedUnits" + "heldUnits" + "blockedUnits" <= "totalUnits");

ALTER TABLE "TransferCapacity"
  ADD CONSTRAINT "TransferCapacity_counters_nonneg" CHECK ("totalUnits" >= 0 AND "heldUnits" >= 0 AND "bookedUnits" >= 0),
  ADD CONSTRAINT "TransferCapacity_capacity" CHECK ("bookedUnits" + "heldUnits" <= "totalUnits");

ALTER TABLE "PackageDeparture"
  ADD CONSTRAINT "PackageDeparture_counters_nonneg" CHECK ("capacity" >= 0 AND "heldTravellers" >= 0 AND "bookedTravellers" >= 0),
  ADD CONSTRAINT "PackageDeparture_capacity" CHECK ("bookedTravellers" + "heldTravellers" <= "capacity");

-- Catalogue and pricing sanity.
ALTER TABLE "Hotel" ADD CONSTRAINT "Hotel_star_rating_range" CHECK ("starRating" BETWEEN 1 AND 5);
ALTER TABLE "Room" ADD CONSTRAINT "Room_occupancy" CHECK ("baseOccupancy" >= 1 AND "baseOccupancy" <= "maxAdults" AND "maxChildren" >= 0);
ALTER TABLE "CarModel" ADD CONSTRAINT "CarModel_min_driver_age" CHECK ("minDriverAge" >= 18);
ALTER TABLE "Package" ADD CONSTRAINT "Package_traveller_bounds" CHECK ("minTravellers" >= 1 AND "minTravellers" <= "maxTravellers");
ALTER TABLE "TransferRate" ADD CONSTRAINT "TransferRate_distinct_ends" CHECK ("originLocationId" <> "destinationLocationId");
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_amount_present" CHECK ("percent" IS NOT NULL OR "flatAmount" IS NOT NULL);
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_flat_currency" CHECK ("flatAmount" IS NULL OR "flatCurrency" IS NOT NULL);

-- Money arithmetic must reconcile. Totals are never trusted from the client; these guard the stored values.
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_total_reconciles" CHECK ("total" = "subtotal" - "discount" + "tax" + "fee");
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_total_reconciles" CHECK ("total" = "subtotal" - "discount" + "tax" + "fee");
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_hold_present" CHECK ("status" <> 'PENDING_PAYMENT' OR "holdExpiresAt" IS NOT NULL);

-- Each booking item carries exactly the keys of its product type and no others.
ALTER TABLE "BookingItem" ADD CONSTRAINT "BookingItem_product_keys" CHECK (
  CASE "productType"
    WHEN 'HOTEL' THEN "hotelId" IS NOT NULL AND "roomId" IS NOT NULL AND "ratePlanId" IS NOT NULL
      AND "tourId" IS NULL AND "tourSessionId" IS NULL AND "carModelId" IS NULL AND "pickupLocationId" IS NULL
      AND "transferRateId" IS NULL AND "packageDepartureId" IS NULL
    WHEN 'TOUR' THEN "tourId" IS NOT NULL AND "tourSessionId" IS NOT NULL
      AND "hotelId" IS NULL AND "roomId" IS NULL AND "ratePlanId" IS NULL AND "carModelId" IS NULL
      AND "pickupLocationId" IS NULL AND "transferRateId" IS NULL AND "packageDepartureId" IS NULL
    WHEN 'CAR' THEN "carModelId" IS NOT NULL AND "pickupLocationId" IS NOT NULL
      AND "hotelId" IS NULL AND "roomId" IS NULL AND "ratePlanId" IS NULL AND "tourId" IS NULL
      AND "tourSessionId" IS NULL AND "transferRateId" IS NULL AND "packageDepartureId" IS NULL
    WHEN 'TRANSFER' THEN "transferRateId" IS NOT NULL
      AND "hotelId" IS NULL AND "roomId" IS NULL AND "ratePlanId" IS NULL AND "tourId" IS NULL
      AND "tourSessionId" IS NULL AND "carModelId" IS NULL AND "pickupLocationId" IS NULL
      AND "packageDepartureId" IS NULL
    WHEN 'PACKAGE' THEN "packageDepartureId" IS NOT NULL
      AND "hotelId" IS NULL AND "roomId" IS NULL AND "ratePlanId" IS NULL AND "tourId" IS NULL
      AND "tourSessionId" IS NULL AND "carModelId" IS NULL AND "pickupLocationId" IS NULL
      AND "transferRateId" IS NULL
    ELSE FALSE
  END
);

-- AuditEvent is append-only. Updates, deletes and truncation are rejected for every role,
-- including the table owner, because the trigger does not depend on privileges.
CREATE OR REPLACE FUNCTION eb_audit_event_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditEvent is append-only (% rejected)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditEvent_no_update_delete"
  BEFORE UPDATE OR DELETE ON "AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION eb_audit_event_immutable();

CREATE TRIGGER "AuditEvent_no_truncate"
  BEFORE TRUNCATE ON "AuditEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION eb_audit_event_immutable();
