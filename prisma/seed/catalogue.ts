import { ContentStatus, MediaOwnerType, Prisma, PrismaClient } from "@prisma/client";
import { addDays, businessDate, businessDay, zonedInstant } from "../../src/common/business-date";
import {
  CARS,
  CAR_INVENTORY_DAYS,
  CAR_UNITS_PER_BRANCH,
  EXCHANGE_RATES,
  ROOM_INVENTORY_DAYS,
  ROOM_UNITS,
  TRANSFER_CAPACITY_DAYS,
  TRANSFER_UNITS,
  DESTINATIONS,
  DEV_PACKAGE_CAPACITY,
  DEV_PACKAGE_MAX_TRAVELLERS,
  HIDDEN_DEPARTURES,
  HIDDEN_SESSIONS,
  HOTELS,
  LOCATIONS,
  PACKAGES,
  POLICIES,
  PRICING_RULES,
  ROUTES,
  SETTINGS,
  TOURS,
  TRANSFER_VALID_FROM,
  VEHICLE_CLASSES,
  licenceFor,
} from "./data";

type Tx = Prisma.TransactionClient;

export interface CatalogueSeedSummary {
  settings: number;
  pricingRules: number;
  policies: number;
  destinations: number;
  locations: number;
  hotels: number;
  rooms: number;
  ratePlans: number;
  tours: number;
  tourSessions: number;
  carModels: number;
  carInventoryRows: number;
  vehicleClasses: number;
  transferRates: number;
  packages: number;
  packageDepartures: number;
  media: number;
  roomInventoryRows: number;
  transferCapacityRows: number;
  exchangeRates: number;
}

/** Days since the base date at UTC midnight. Used for @db.Date columns. */
function dateOffset(base: Date, days: number): Date {
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + days));
}

/** Minutes from "HH:MM". */
function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Idempotent upsert of the whole development catalogue, in one transaction. Nothing is deleted or
 * truncated: running it twice leaves the same rows, and running it again after a data change updates them.
 */
export async function seedCatalogue(prisma: PrismaClient, now: Date = new Date()): Promise<CatalogueSeedSummary> {
  const summary: CatalogueSeedSummary = {
    settings: 0, pricingRules: 0, policies: 0, destinations: 0, locations: 0, hotels: 0, rooms: 0,
    ratePlans: 0, tours: 0, tourSessions: 0, carModels: 0, carInventoryRows: 0, vehicleClasses: 0,
    transferRates: 0, packages: 0, packageDepartures: 0, media: 0,
    roomInventoryRows: 0, transferCapacityRows: 0, exchangeRates: 0,
  };
  const today = businessDate(now);
  const todayDay = businessDay(now);

  await prisma.$transaction(
    async (tx) => {
      // Settings and pricing.
      for (const [key, value] of Object.entries(SETTINGS)) {
        const json = value as Prisma.InputJsonValue;
        await tx.setting.upsert({ where: { key }, create: { key, value: json }, update: { value: json } });
        summary.settings++;
      }
      for (const rule of PRICING_RULES) {
        const data = {
          kind: rule.kind,
          label: rule.label,
          productType: rule.productType,
          percent: rule.percent,
          flatAmount: rule.flatAmount,
          flatCurrency: rule.flatCurrency,
          conditions: rule.conditions ? (rule.conditions as Prisma.InputJsonValue) : Prisma.DbNull,
          isActive: true,
          validFrom: new Date("2026-01-01"),
        };
        await tx.pricingRule.upsert({ where: { code: rule.code }, create: { code: rule.code, ...data }, update: data });
        summary.pricingRules++;
      }

      // Cancellation policies. Rules are copied into bookings later, so the shape must stay stable.
      const policyId: Record<string, string> = {};
      for (const p of POLICIES) {
        const rules: Prisma.InputJsonValue =
          p.fullRefundHours === null
            ? [{ hoursBeforeStart: 0, refundPercent: 0 }]
            : [
                { hoursBeforeStart: p.fullRefundHours, refundPercent: 100 },
                { hoursBeforeStart: 0, refundPercent: 0 },
              ];
        const row = await tx.cancellationPolicy.upsert({
          where: { code: p.code },
          create: { code: p.code, name: p.name, description: p.description, rules },
          update: { name: p.name, description: p.description, rules },
        });
        policyId[p.code] = row.id;
        summary.policies++;
      }

      // Geography.
      const destinationId: Record<string, string> = {};
      for (const d of DESTINATIONS) {
        const row = await tx.destination.upsert({
          where: { slug: d.slug },
          create: { slug: d.slug, name: d.name, countryCode: d.countryCode, isFeatured: d.isFeatured ?? false, sortOrder: d.sortOrder, status: d.status ?? "PUBLISHED" },
          update: { name: d.name, countryCode: d.countryCode, isFeatured: d.isFeatured ?? false, sortOrder: d.sortOrder, status: d.status ?? "PUBLISHED", deletedAt: null },
        });
        destinationId[d.slug] = row.id;
        summary.destinations++;
        await syncMedia(tx, MediaOwnerType.DESTINATION, `destination/${d.slug}`, row.id, [d.image], d.name);
        summary.media++;
      }

      const locationId: Record<string, string> = {};
      for (const l of LOCATIONS) {
        const data = {
          type: l.type,
          name: l.name,
          code: l.code,
          destinationId: destinationId[l.destination],
          latitude: l.latitude,
          longitude: l.longitude,
          status: l.status ?? ("PUBLISHED"),
          deletedAt: null,
        };
        let row;
        if (l.code) {
          row = await tx.location.upsert({ where: { code: l.code }, create: data, update: data });
        } else {
          // Zones and branches have no unique key in the schema, so match on the natural identity.
          const existing = await tx.location.findFirst({ where: { name: l.name, destinationId: data.destinationId, type: l.type } });
          row = existing
            ? await tx.location.update({ where: { id: existing.id }, data })
            : await tx.location.create({ data });
        }
        locationId[l.key] = row.id;
        summary.locations++;
      }

      // Hotels, rooms and rate plans.
      const roomIds: string[] = [];
      for (const h of HOTELS) {
        const cheapest = h.rooms
          .filter((r) => r.status !== "DRAFT")
          .reduce<number | null>((min, r) => {
            const price = Number(r.pricePerNight);
            return min === null || price < min ? price : min;
          }, null);
        const hotelData = {
          name: h.name,
          destinationId: destinationId[h.destination],
          propertyType: h.propertyType,
          starRating: h.starRating,
          addressLine: h.location,
          latitude: null,
          longitude: null,
          description: h.description,
          // DEV DEFAULT: the frontend shows no check-in or check-out times.
          checkInTime: "14:00",
          checkOutTime: "12:00",
          amenities: h.amenities,
          guestRatingAvg: h.guestRating,
          reviewCount: h.reviewCount,
          fromPriceAmount: cheapest === null ? null : cheapest.toFixed(2),
          fromPriceCurrency: cheapest === null ? null : "EGP",
          status: h.status ?? ("PUBLISHED"),
          deletedAt: h.deleted ? now : null,
        };
        const hotel = await tx.hotel.upsert({ where: { slug: h.slug }, create: { slug: h.slug, ...hotelData }, update: hotelData });
        summary.hotels++;
        await syncMedia(tx, MediaOwnerType.HOTEL, `hotel/${h.slug}`, hotel.id, h.images, h.name);
        summary.media += h.images.length;

        for (const r of h.rooms) {
          const roomData = {
            name: r.name,
            bedType: r.bedType,
            baseOccupancy: Math.min(2, r.capacity),
            maxAdults: r.capacity,
            maxChildren: 0,
            sizeSqm: r.sizeSqm,
            features: r.amenities,
            status: r.status ?? ("PUBLISHED"),
            deletedAt: null,
          };
          const room = await tx.room.upsert({
            where: { hotelId_code: { hotelId: hotel.id, code: r.code } },
            create: { hotelId: hotel.id, code: r.code, ...roomData },
            update: roomData,
          });
          summary.rooms++;
          roomIds.push(room.id);
          await syncMedia(tx, MediaOwnerType.ROOM, `room/${h.slug}/${r.code}`, room.id, [r.image], r.name);
          summary.media++;

          const policy = r.refundable ? h.refundPolicy : "hotel-non-refundable";
          const ratePlanData = {
            name: r.refundable ? "Flexible rate" : "Non-refundable rate",
            mealPlan: h.mealPlan,
            isRefundable: r.refundable,
            cancellationPolicyId: policyId[policy],
            currency: "EGP",
            basePricePerNight: r.pricePerNight,
            extraAdultPerNight: null,
            extraChildPerNight: null,
            status: "PUBLISHED" as ContentStatus,
          };
          const code = r.refundable ? "FLEX" : "NRF";
          await tx.ratePlan.upsert({
            where: { roomId_code: { roomId: room.id, code } },
            create: { roomId: room.id, code, ...ratePlanData },
            update: ratePlanData,
          });
          summary.ratePlans++;
        }
      }

      // Room inventory: a rolling window of sellable units per room and night (DEV units).
      const roomRows: { roomId: string; date: Date; totalUnits: number }[] = [];
      for (const roomId of roomIds) {
        for (let d = 0; d < ROOM_INVENTORY_DAYS; d++) {
          roomRows.push({ roomId, date: dateOffset(todayDay, d), totalUnits: ROOM_UNITS });
        }
      }
      summary.roomInventoryRows += (await tx.roomInventory.createMany({ data: roomRows, skipDuplicates: true })).count;

      // Tours and sessions.
      for (const t of TOURS) {
        const itinerary = t.itinerary.length
          ? t.itinerary.map((step) => ({
              offsetMinutes: minutesOf(step.time) - minutesOf(t.itinerary[0].time),
              time: step.time,
              title: step.title,
              description: step.description,
            }))
          : [];
        const tourData = {
          title: t.title,
          category: t.category,
          destinationId: destinationId[t.destination],
          meetingPoint: t.meetingPoint,
          durationMinutes: t.durationMinutes,
          maxGroupSize: t.maxGroupSize,
          languages: t.languages,
          currency: "EGP",
          pricePerPerson: t.pricePerPerson,
          overview: t.overview,
          highlights: t.highlights,
          included: t.included,
          excluded: t.excluded,
          importantInfo: t.importantInfo,
          itinerary: itinerary as Prisma.InputJsonValue,
          cancellationPolicyId: policyId[t.cancellationPolicy],
          guestRatingAvg: t.rating,
          reviewCount: t.reviewCount,
          status: t.status ?? ("PUBLISHED"),
          deletedAt: null,
        };
        const tour = await tx.tour.upsert({ where: { slug: t.slug }, create: { slug: t.slug, ...tourData }, update: tourData });
        summary.tours++;
        await syncMedia(tx, MediaOwnerType.TOUR, `tour/${t.slug}`, tour.id, t.images, t.title);
        summary.media += t.images.length;

        for (const offset of t.dayOffsets) {
          const date = addDays(today, offset);
          for (const time of t.startTimes) {
            const startsAt = zonedInstant(date, time);
            await tx.tourSession.upsert({
              where: { tourId_startsAt: { tourId: tour.id, startsAt } },
              create: { tourId: tour.id, startsAt, capacity: t.maxGroupSize, status: "OPEN" },
              update: { capacity: t.maxGroupSize, status: "OPEN" },
            });
            summary.tourSessions++;
          }
        }
      }
      for (const fixture of HIDDEN_SESSIONS) {
        const tour = await tx.tour.findUniqueOrThrow({ where: { slug: fixture.tourSlug } });
        const startsAt = fixture.startsAt
          ? new Date(fixture.startsAt)
          : zonedInstant(addDays(today, fixture.dayOffset ?? 0), fixture.time ?? "00:00");
        await tx.tourSession.upsert({
          where: { tourId_startsAt: { tourId: tour.id, startsAt } },
          create: { tourId: tour.id, startsAt, capacity: 40, status: fixture.status },
          update: { status: fixture.status },
        });
        summary.tourSessions++;
      }

      // Cars. Inventory is a rolling window from the seed date.
      const branchIds = [locationId["CAI"], locationId["branch-cairo"], locationId["branch-giza"]];
      for (const c of CARS) {
        const carData = {
          brand: c.brand,
          name: c.name,
          category: c.category,
          transmission: c.transmission,
          hasAirConditioning: c.airConditioning,
          passengers: c.passengers,
          bags: c.bags,
          doors: c.doors,
          includedKmPerDay: c.includedKmPerDay,
          fuelPolicy: c.fuelPolicy,
          minDriverAge: c.minDriverAge,
          currency: "EGP",
          pricePerDay: c.pricePerDay,
          depositAmount: c.depositAmount,
          coverage: c.coverage,
          rentalConditions: c.rentalConditions,
          pickupNotes: c.pickupNotes,
          cancellationPolicyId: policyId["car-default"],
          status: c.status ?? ("PUBLISHED"),
          deletedAt: null,
        };
        const car = await tx.carModel.upsert({ where: { slug: c.slug }, create: { slug: c.slug, ...carData }, update: carData });
        summary.carModels++;
        await syncMedia(tx, MediaOwnerType.CAR_MODEL, `car/${c.slug}`, car.id, c.images, `${c.brand} ${c.name}`);
        summary.media += c.images.length;

        const rows = [];
        for (let d = 0; d < CAR_INVENTORY_DAYS; d++) {
          for (const locationIdValue of branchIds) {
            rows.push({ carModelId: car.id, locationId: locationIdValue, date: dateOffset(todayDay, d), totalUnits: CAR_UNITS_PER_BRANCH });
          }
        }
        const created = await tx.carInventory.createMany({ data: rows, skipDuplicates: true });
        summary.carInventoryRows += created.count;
      }

      // Transfers: vehicle classes, then airport <-> resort-area rates in both directions.
      const classId: Record<string, string> = {};
      for (const v of VEHICLE_CLASSES) {
        const data = { name: v.name, passengersMax: v.passengersMax, luggageMax: v.luggageMax, features: v.features, isActive: true };
        const row = await tx.transferVehicleClass.upsert({ where: { code: v.code }, create: { code: v.code, ...data }, update: data });
        classId[v.code] = row.id;
        summary.vehicleClasses++;
        await syncMedia(tx, MediaOwnerType.TRANSFER_VEHICLE_CLASS, `vehicle/${v.code}`, row.id, [v.image], v.name);
        summary.media++;
      }
      for (const route of ROUTES) {
        const airport = locationId[route.airport];
        const zone = locationId[route.zone];
        for (const v of VEHICLE_CLASSES) {
          for (const [origin, destination] of [[airport, zone], [zone, airport]] as const) {
            const data = {
              amount: v.basePriceEGP.toFixed(2),
              currency: "EGP",
              // DEV PLACEHOLDER: the frontend gives no transfer durations.
              durationMinutes: 60,
              validTo: null,
              isActive: true,
              isDevPlaceholder: true,
            };
            await tx.transferRate.upsert({
              where: {
                originLocationId_destinationLocationId_vehicleClassId_validFrom: {
                  originLocationId: origin,
                  destinationLocationId: destination,
                  vehicleClassId: classId[v.code],
                  validFrom: new Date(TRANSFER_VALID_FROM),
                },
              },
              create: {
                originLocationId: origin,
                destinationLocationId: destination,
                vehicleClassId: classId[v.code],
                validFrom: new Date(TRANSFER_VALID_FROM),
                ...data,
              },
              update: data,
            });
            summary.transferRates++;
          }
        }
      }
      // Transfer capacity: a rolling window of vehicles per class and day (DEV units).
      const capacityRows: { vehicleClassId: string; date: Date; totalUnits: number }[] = [];
      for (const id of Object.values(classId)) {
        for (let d = 0; d < TRANSFER_CAPACITY_DAYS; d++) {
          capacityRows.push({ vehicleClassId: id, date: dateOffset(todayDay, d), totalUnits: TRANSFER_UNITS });
        }
      }
      summary.transferCapacityRows += (await tx.transferCapacity.createMany({ data: capacityRows, skipDuplicates: true })).count;

      // Hidden transfer fixtures: an expired rate and an inactive rate.
      await tx.transferRate.upsert({
        where: {
          originLocationId_destinationLocationId_vehicleClassId_validFrom: {
            originLocationId: locationId["CAI"],
            destinationLocationId: locationId["zone-cairo"],
            vehicleClassId: classId["SEDAN"],
            validFrom: new Date("2024-01-01"),
          },
        },
        create: { originLocationId: locationId["CAI"], destinationLocationId: locationId["zone-cairo"], vehicleClassId: classId["SEDAN"], validFrom: new Date("2024-01-01"), validTo: new Date("2024-12-31"), amount: "500.00", currency: "EGP", durationMinutes: 60, isActive: true, isDevPlaceholder: true },
        update: { validTo: new Date("2024-12-31"), isActive: true, isDevPlaceholder: true },
      });
      await tx.transferRate.upsert({
        where: {
          originLocationId_destinationLocationId_vehicleClassId_validFrom: {
            originLocationId: locationId["HRG"],
            destinationLocationId: locationId["zone-hurghada"],
            vehicleClassId: classId["VAN"],
            validFrom: new Date("2026-02-01"),
          },
        },
        create: { originLocationId: locationId["HRG"], destinationLocationId: locationId["zone-hurghada"], vehicleClassId: classId["VAN"], validFrom: new Date("2026-02-01"), amount: "1300.00", currency: "EGP", durationMinutes: 60, isActive: false, isDevPlaceholder: true },
        update: { isActive: false, isDevPlaceholder: true },
      });

      // Exchange rates for display currencies. DEV PLACEHOLDERS, marked by their source.
      for (const r of EXCHANGE_RATES) {
        const data = { rate: r.rate, source: r.source, fetchedAt: now };
        await tx.exchangeRate.upsert({
          where: { baseCurrency_quoteCurrency: { baseCurrency: r.baseCurrency, quoteCurrency: r.quoteCurrency } },
          create: { baseCurrency: r.baseCurrency, quoteCurrency: r.quoteCurrency, ...data },
          update: data,
        });
        summary.exchangeRates++;
      }

      // Packages and departures.
      for (const p of PACKAGES) {
        const includes = { hotel: p.hotel, tours: p.toursIncluded, transfers: p.transfersIncluded };
        const destinationRefs = p.destinations.map((slug) => ({ id: destinationId[slug] }));
        const data = {
          title: p.title,
          overview: p.overview,
          durationNights: p.durationNights,
          durationDays: p.durationDays,
          budgetTier: p.budgetTier,
          pricingBasis: "PER_PERSON" as const,
          currency: "EGP",
          basePrice: p.startingPrice,
          singleSupplement: null,
          childPrice: null,
          extraPersonPrice: null,
          minTravellers: 1,
          maxTravellers: DEV_PACKAGE_MAX_TRAVELLERS,
          cancellationPolicyId: policyId["package-default"],
          itinerary: p.itinerary as Prisma.InputJsonValue,
          includes: includes as Prisma.InputJsonValue,
          included: p.included,
          excluded: p.excluded,
          status: p.status ?? ("PUBLISHED"),
          deletedAt: p.deleted ? now : null,
        };
        const pkg = await tx.package.upsert({
          where: { slug: p.slug },
          create: { slug: p.slug, ...data, destinations: { connect: destinationRefs } },
          update: { ...data, destinations: { set: destinationRefs } },
        });
        summary.packages++;
        await syncMedia(tx, MediaOwnerType.PACKAGE, `package/${p.slug}`, pkg.id, p.images, p.title);
        summary.media += p.images.length;

        for (const offset of p.dayOffsets) {
          const startsOn = new Date(`${addDays(today, offset)}T00:00:00Z`);
          await tx.packageDeparture.upsert({
            where: { packageId_startsOn: { packageId: pkg.id, startsOn } },
            create: { packageId: pkg.id, startsOn, capacity: DEV_PACKAGE_CAPACITY, status: "OPEN" },
            update: { capacity: DEV_PACKAGE_CAPACITY, status: "OPEN" },
          });
          summary.packageDepartures++;
        }
      }
      for (const fixture of HIDDEN_DEPARTURES) {
        const pkg = await tx.package.findUniqueOrThrow({ where: { slug: fixture.packageSlug } });
        const startsOn = new Date(`${fixture.startsOn}T00:00:00Z`);
        await tx.packageDeparture.upsert({
          where: { packageId_startsOn: { packageId: pkg.id, startsOn } },
          create: { packageId: pkg.id, startsOn, capacity: DEV_PACKAGE_CAPACITY, status: fixture.status },
          update: { status: fixture.status },
        });
        summary.packageDepartures++;
      }
    },
    { timeout: 180_000, maxWait: 20_000 },
  );

  return summary;
}

/**
 * Imported external images. Each owner gets rows with a deterministic storage key, so reruns update
 * rows instead of duplicating them. Width, height and size are 0 because the source files were not
 * downloaded; they must be backfilled before any image pipeline depends on them.
 */
async function syncMedia(
  tx: Tx,
  ownerType: MediaOwnerType,
  ownerKey: string,
  ownerId: string,
  urls: readonly string[],
  altText: string,
): Promise<void> {
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const licence = licenceFor(url);
    const storageKey = `ext/${ownerType}/${ownerKey}/${i}`;
    const data = {
      ownerType,
      ownerId,
      variants: {} as Prisma.InputJsonValue,
      mimeType: "image/jpeg",
      width: 0,
      height: 0,
      sizeBytes: 0,
      altText,
      source: "IMPORTED_EXTERNAL" as const,
      sourceUrl: url,
      attribution: licence.attribution,
      licenseCode: licence.licenseCode,
      status: "READY" as const,
      isCover: i === 0,
      sortOrder: i,
      deletedAt: null,
    };
    await tx.media.upsert({ where: { storageKey }, create: { storageKey, ...data }, update: data });
  }
}
