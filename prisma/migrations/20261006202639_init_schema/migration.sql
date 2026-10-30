-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CUSTOMER', 'SUPPORT', 'CONTENT_EDITOR', 'FINANCE', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('EN', 'AR');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('HOTEL', 'TOUR', 'CAR', 'TRANSFER', 'PACKAGE');

-- CreateEnum
CREATE TYPE "AuthTokenType" AS ENUM ('REFRESH', 'VERIFY_EMAIL', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('AIRPORT', 'CAR_BRANCH', 'ZONE');

-- CreateEnum
CREATE TYPE "MediaSource" AS ENUM ('UPLOAD', 'IMPORTED_EXTERNAL');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('PROCESSING', 'READY', 'REJECTED');

-- CreateEnum
CREATE TYPE "MediaOwnerType" AS ENUM ('DESTINATION', 'HOTEL', 'ROOM', 'TOUR', 'CAR_MODEL', 'TRANSFER_VEHICLE_CLASS', 'PACKAGE');

-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('HOTEL', 'RESORT', 'APARTMENT', 'VILLA');

-- CreateEnum
CREATE TYPE "MealPlan" AS ENUM ('ROOM_ONLY', 'BREAKFAST', 'HALF_BOARD', 'FULL_BOARD', 'ALL_INCLUSIVE');

-- CreateEnum
CREATE TYPE "PricingBasis" AS ENUM ('PER_PERSON', 'PER_ROOM', 'PER_PACKAGE');

-- CreateEnum
CREATE TYPE "TourCategory" AS ENUM ('HISTORY_CULTURE', 'DINING_ENTERTAINMENT', 'WATER_ACTIVITIES', 'SIGHTSEEING');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CarCategory" AS ENUM ('ECONOMY', 'COMPACT', 'SUV', 'PREMIUM_SUV', 'LUXURY');

-- CreateEnum
CREATE TYPE "Transmission" AS ENUM ('AUTOMATIC', 'MANUAL');

-- CreateEnum
CREATE TYPE "TransferVehicleType" AS ENUM ('SEDAN', 'SUV', 'PREMIUM', 'VAN', 'MINIBUS');

-- CreateEnum
CREATE TYPE "BudgetTier" AS ENUM ('BUDGET', 'MID', 'LUXURY');

-- CreateEnum
CREATE TYPE "PricingRuleKind" AS ENUM ('TAX', 'FEE', 'SURCHARGE', 'DISCOUNT');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "BookingItemStatus" AS ENUM ('HELD', 'CONFIRMED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PENDING', 'PAID', 'PAY_LATER', 'PARTIALLY_REFUNDED', 'REFUNDED', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CARD', 'PAY_LATER');

-- CreateEnum
CREATE TYPE "PaymentState" AS ENUM ('PENDING', 'REQUIRES_ACTION', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RefundState" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('SYSTEM', 'USER', 'GUEST', 'ADMIN', 'PROVIDER');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "firstName" VARCHAR(80) NOT NULL,
    "lastName" VARCHAR(80) NOT NULL,
    "phone" VARCHAR(20),
    "countryCode" CHAR(2),
    "language" "Language" NOT NULL DEFAULT 'EN',
    "currency" CHAR(3) NOT NULL DEFAULT 'EGP',
    "role" "Role" NOT NULL DEFAULT 'CUSTOMER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "emailVerifiedAt" TIMESTAMP(3),
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "AuthTokenType" NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "familyId" UUID,
    "replacedById" UUID,
    "userAgent" VARCHAR(255),
    "ipAddress" VARCHAR(45),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" VARCHAR(80) NOT NULL,
    "value" JSONB NOT NULL,
    "updatedById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "PricingRule" (
    "id" UUID NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "kind" "PricingRuleKind" NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "productType" "ProductType",
    "percent" DECIMAL(7,4),
    "flatAmount" DECIMAL(12,2),
    "flatCurrency" CHAR(3),
    "conditions" JSONB,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" DATE NOT NULL,
    "validTo" DATE,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "baseCurrency" CHAR(3) NOT NULL,
    "quoteCurrency" CHAR(3) NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,
    "source" VARCHAR(60) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("baseCurrency","quoteCurrency")
);

-- CreateTable
CREATE TABLE "Destination" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "nameAr" VARCHAR(120),
    "countryCode" CHAR(2) NOT NULL,
    "description" TEXT,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Destination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" UUID NOT NULL,
    "type" "LocationType" NOT NULL,
    "code" VARCHAR(10),
    "name" VARCHAR(160) NOT NULL,
    "destinationId" UUID NOT NULL,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "status" "ContentStatus" NOT NULL DEFAULT 'PUBLISHED',
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Media" (
    "id" UUID NOT NULL,
    "ownerType" "MediaOwnerType" NOT NULL,
    "ownerId" UUID NOT NULL,
    "storageKey" VARCHAR(512) NOT NULL,
    "variants" JSONB NOT NULL,
    "mimeType" VARCHAR(40) NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "altText" VARCHAR(255) NOT NULL,
    "source" "MediaSource" NOT NULL DEFAULT 'UPLOAD',
    "sourceUrl" VARCHAR(512),
    "attribution" VARCHAR(512),
    "licenseCode" VARCHAR(40),
    "status" "MediaStatus" NOT NULL DEFAULT 'PROCESSING',
    "isCover" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "uploadedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CancellationPolicy" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT NOT NULL,
    "rules" JSONB NOT NULL,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CancellationPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hotel" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "destinationId" UUID NOT NULL,
    "propertyType" "PropertyType" NOT NULL,
    "starRating" INTEGER NOT NULL,
    "addressLine" VARCHAR(255) NOT NULL,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "description" TEXT NOT NULL,
    "checkInTime" VARCHAR(5) NOT NULL,
    "checkOutTime" VARCHAR(5) NOT NULL,
    "amenities" TEXT[],
    "guestRatingAvg" DECIMAL(3,1) NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "fromPriceAmount" DECIMAL(12,2),
    "fromPriceCurrency" CHAR(3),
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Hotel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" UUID NOT NULL,
    "hotelId" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "bedType" VARCHAR(80) NOT NULL,
    "baseOccupancy" INTEGER NOT NULL,
    "maxAdults" INTEGER NOT NULL,
    "maxChildren" INTEGER NOT NULL DEFAULT 0,
    "sizeSqm" INTEGER,
    "features" TEXT[],
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatePlan" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "mealPlan" "MealPlan" NOT NULL DEFAULT 'ROOM_ONLY',
    "isRefundable" BOOLEAN NOT NULL,
    "cancellationPolicyId" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "basePricePerNight" DECIMAL(12,2) NOT NULL,
    "extraAdultPerNight" DECIMAL(12,2),
    "extraChildPerNight" DECIMAL(12,2),
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RatePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomRate" (
    "ratePlanId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "pricePerNight" DECIMAL(12,2) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RoomRate_pkey" PRIMARY KEY ("ratePlanId","date")
);

-- CreateTable
CREATE TABLE "RoomInventory" (
    "roomId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "totalUnits" INTEGER NOT NULL,
    "heldUnits" INTEGER NOT NULL DEFAULT 0,
    "soldUnits" INTEGER NOT NULL DEFAULT 0,
    "blockedUnits" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomInventory_pkey" PRIMARY KEY ("roomId","date")
);

-- CreateTable
CREATE TABLE "Tour" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "category" "TourCategory" NOT NULL,
    "destinationId" UUID NOT NULL,
    "meetingPoint" VARCHAR(255) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "maxGroupSize" INTEGER NOT NULL,
    "languages" TEXT[],
    "currency" CHAR(3) NOT NULL,
    "pricePerPerson" DECIMAL(12,2) NOT NULL,
    "overview" TEXT NOT NULL,
    "highlights" TEXT[],
    "included" TEXT[],
    "excluded" TEXT[],
    "importantInfo" TEXT[],
    "itinerary" JSONB NOT NULL,
    "cancellationPolicyId" UUID NOT NULL,
    "guestRatingAvg" DECIMAL(2,1) NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Tour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TourSession" (
    "id" UUID NOT NULL,
    "tourId" UUID NOT NULL,
    "startsAt" TIMESTAMPTZ(6) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "heldUnits" INTEGER NOT NULL DEFAULT 0,
    "bookedUnits" INTEGER NOT NULL DEFAULT 0,
    "priceOverride" DECIMAL(12,2),
    "overrideCurrency" CHAR(3),
    "status" "SessionStatus" NOT NULL DEFAULT 'OPEN',
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TourSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarModel" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "brand" VARCHAR(60) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "category" "CarCategory" NOT NULL,
    "transmission" "Transmission" NOT NULL,
    "hasAirConditioning" BOOLEAN NOT NULL DEFAULT true,
    "passengers" INTEGER NOT NULL,
    "bags" INTEGER NOT NULL,
    "doors" INTEGER NOT NULL,
    "includedKmPerDay" INTEGER NOT NULL,
    "fuelPolicy" VARCHAR(40) NOT NULL DEFAULT 'FULL_TO_FULL',
    "minDriverAge" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "pricePerDay" DECIMAL(12,2) NOT NULL,
    "depositAmount" DECIMAL(12,2) NOT NULL,
    "coverage" TEXT[],
    "rentalConditions" TEXT[],
    "pickupNotes" TEXT,
    "cancellationPolicyId" UUID NOT NULL,
    "guestRatingAvg" DECIMAL(2,1) NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CarModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarInventory" (
    "carModelId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "totalUnits" INTEGER NOT NULL,
    "heldUnits" INTEGER NOT NULL DEFAULT 0,
    "bookedUnits" INTEGER NOT NULL DEFAULT 0,
    "blockedUnits" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarInventory_pkey" PRIMARY KEY ("carModelId","locationId","date")
);

-- CreateTable
CREATE TABLE "TransferVehicleClass" (
    "id" UUID NOT NULL,
    "code" "TransferVehicleType" NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "passengersMax" INTEGER NOT NULL,
    "luggageMax" INTEGER NOT NULL,
    "features" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransferVehicleClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferRate" (
    "id" UUID NOT NULL,
    "originLocationId" UUID NOT NULL,
    "destinationLocationId" UUID NOT NULL,
    "vehicleClassId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "validFrom" DATE NOT NULL,
    "validTo" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TransferRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferCapacity" (
    "vehicleClassId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "totalUnits" INTEGER NOT NULL,
    "heldUnits" INTEGER NOT NULL DEFAULT 0,
    "bookedUnits" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TransferCapacity_pkey" PRIMARY KEY ("vehicleClassId","date")
);

-- CreateTable
CREATE TABLE "Package" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "overview" TEXT NOT NULL,
    "durationNights" INTEGER NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "budgetTier" "BudgetTier" NOT NULL,
    "pricingBasis" "PricingBasis" NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "basePrice" DECIMAL(12,2) NOT NULL,
    "singleSupplement" DECIMAL(12,2),
    "childPrice" DECIMAL(12,2),
    "extraPersonPrice" DECIMAL(12,2),
    "minTravellers" INTEGER NOT NULL DEFAULT 1,
    "maxTravellers" INTEGER NOT NULL,
    "cancellationPolicyId" UUID NOT NULL,
    "itinerary" JSONB NOT NULL,
    "includes" JSONB NOT NULL,
    "included" TEXT[],
    "excluded" TEXT[],
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackageDeparture" (
    "id" UUID NOT NULL,
    "packageId" UUID NOT NULL,
    "startsOn" DATE NOT NULL,
    "capacity" INTEGER NOT NULL,
    "heldTravellers" INTEGER NOT NULL DEFAULT 0,
    "bookedTravellers" INTEGER NOT NULL DEFAULT 0,
    "priceOverride" DECIMAL(12,2),
    "overrideCurrency" CHAR(3),
    "status" "SessionStatus" NOT NULL DEFAULT 'OPEN',
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PackageDeparture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "productType" "ProductType" NOT NULL,
    "productId" UUID NOT NULL,
    "request" JSONB NOT NULL,
    "lines" JSONB NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(12,2) NOT NULL,
    "fee" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "holdMinutes" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" UUID NOT NULL,
    "reference" VARCHAR(12) NOT NULL,
    "userId" UUID,
    "quoteId" UUID NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "paymentMethod" "PaymentMethod",
    "currency" CHAR(3) NOT NULL,
    "displayCurrency" CHAR(3) NOT NULL,
    "displayFxRate" DECIMAL(18,8),
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(12,2) NOT NULL,
    "fee" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "priceBreakdown" JSONB NOT NULL,
    "cancellationPolicySnapshot" JSONB NOT NULL,
    "customerFirstName" VARCHAR(80) NOT NULL,
    "customerLastName" VARCHAR(80) NOT NULL,
    "customerEmail" VARCHAR(254) NOT NULL,
    "customerPhone" VARCHAR(20) NOT NULL,
    "customerCountryCode" CHAR(2) NOT NULL,
    "specialRequests" TEXT,
    "holdExpiresAt" TIMESTAMP(3),
    "holdMinutes" INTEGER NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledByType" "ActorType",
    "cancelledById" UUID,
    "cancelReason" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingItem" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "productType" "ProductType" NOT NULL,
    "productId" UUID NOT NULL,
    "hotelId" UUID,
    "roomId" UUID,
    "ratePlanId" UUID,
    "tourId" UUID,
    "tourSessionId" UUID,
    "carModelId" UUID,
    "pickupLocationId" UUID,
    "transferRateId" UUID,
    "packageDepartureId" UUID,
    "startsAt" TIMESTAMPTZ(6) NOT NULL,
    "endsAt" TIMESTAMPTZ(6) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "adults" INTEGER,
    "children" INTEGER,
    "details" JSONB NOT NULL,
    "productSnapshot" JSONB NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL,
    "status" "BookingItemStatus" NOT NULL DEFAULT 'HELD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "providerName" VARCHAR(40) NOT NULL,
    "providerPaymentId" VARCHAR(120),
    "idempotencyKey" VARCHAR(64) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentState" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "cardBrand" VARCHAR(20),
    "cardLast4" CHAR(4),
    "cardExpMonth" INTEGER,
    "cardExpYear" INTEGER,
    "failureCode" VARCHAR(60),
    "failureMessage" VARCHAR(255),
    "succeededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "reason" VARCHAR(255) NOT NULL,
    "status" "RefundState" NOT NULL DEFAULT 'PENDING',
    "providerName" VARCHAR(40),
    "providerRefundId" VARCHAR(120),
    "requestedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" UUID NOT NULL,
    "providerName" VARCHAR(40) NOT NULL,
    "providerEventId" VARCHAR(120) NOT NULL,
    "eventType" VARCHAR(80) NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "userId" UUID NOT NULL,
    "productType" "ProductType" NOT NULL,
    "productId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("userId","productType","productId")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" BIGSERIAL NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorType" "ActorType" NOT NULL,
    "actorId" UUID,
    "actorEmail" VARCHAR(254),
    "actorName" VARCHAR(160),
    "actorRole" VARCHAR(20),
    "action" VARCHAR(80) NOT NULL,
    "aggregateType" VARCHAR(40) NOT NULL,
    "aggregateId" VARCHAR(80) NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "requestId" VARCHAR(64),
    "ipAddress" VARCHAR(45),

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" UUID NOT NULL,
    "operation" VARCHAR(40) NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "resourceType" VARCHAR(40) NOT NULL,
    "resourceId" UUID NOT NULL,
    "responseStatus" INTEGER NOT NULL,
    "responseBody" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_DestinationToPackage" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_DestinationToPackage_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_status_idx" ON "User"("role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AuthToken_tokenHash_key" ON "AuthToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthToken_userId_type_revokedAt_idx" ON "AuthToken"("userId", "type", "revokedAt");

-- CreateIndex
CREATE INDEX "AuthToken_familyId_idx" ON "AuthToken"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "PricingRule_code_key" ON "PricingRule"("code");

-- CreateIndex
CREATE INDEX "PricingRule_isActive_productType_validFrom_idx" ON "PricingRule"("isActive", "productType", "validFrom");

-- CreateIndex
CREATE UNIQUE INDEX "Destination_slug_key" ON "Destination"("slug");

-- CreateIndex
CREATE INDEX "Destination_status_isFeatured_sortOrder_idx" ON "Destination"("status", "isFeatured", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Location_code_key" ON "Location"("code");

-- CreateIndex
CREATE INDEX "Location_type_destinationId_status_idx" ON "Location"("type", "destinationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Media_storageKey_key" ON "Media"("storageKey");

-- CreateIndex
CREATE INDEX "Media_ownerType_ownerId_sortOrder_idx" ON "Media"("ownerType", "ownerId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "CancellationPolicy_code_key" ON "CancellationPolicy"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Hotel_slug_key" ON "Hotel"("slug");

-- CreateIndex
CREATE INDEX "Hotel_destinationId_status_fromPriceAmount_idx" ON "Hotel"("destinationId", "status", "fromPriceAmount");

-- CreateIndex
CREATE INDEX "Hotel_status_starRating_idx" ON "Hotel"("status", "starRating");

-- CreateIndex
CREATE INDEX "Hotel_status_guestRatingAvg_idx" ON "Hotel"("status", "guestRatingAvg");

-- CreateIndex
CREATE INDEX "Hotel_amenities_idx" ON "Hotel" USING GIN ("amenities");

-- CreateIndex
CREATE UNIQUE INDEX "Room_hotelId_code_key" ON "Room"("hotelId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "RatePlan_roomId_code_key" ON "RatePlan"("roomId", "code");

-- CreateIndex
CREATE INDEX "RoomInventory_date_idx" ON "RoomInventory"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Tour_slug_key" ON "Tour"("slug");

-- CreateIndex
CREATE INDEX "Tour_destinationId_status_category_idx" ON "Tour"("destinationId", "status", "category");

-- CreateIndex
CREATE INDEX "TourSession_tourId_status_startsAt_idx" ON "TourSession"("tourId", "status", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "TourSession_tourId_startsAt_key" ON "TourSession"("tourId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "CarModel_slug_key" ON "CarModel"("slug");

-- CreateIndex
CREATE INDEX "CarModel_status_category_transmission_idx" ON "CarModel"("status", "category", "transmission");

-- CreateIndex
CREATE INDEX "CarModel_status_pricePerDay_idx" ON "CarModel"("status", "pricePerDay");

-- CreateIndex
CREATE INDEX "CarInventory_locationId_date_idx" ON "CarInventory"("locationId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "TransferVehicleClass_code_key" ON "TransferVehicleClass"("code");

-- CreateIndex
CREATE UNIQUE INDEX "TransferRate_originLocationId_destinationLocationId_vehicle_key" ON "TransferRate"("originLocationId", "destinationLocationId", "vehicleClassId", "validFrom");

-- CreateIndex
CREATE UNIQUE INDEX "Package_slug_key" ON "Package"("slug");

-- CreateIndex
CREATE INDEX "Package_status_budgetTier_durationNights_idx" ON "Package"("status", "budgetTier", "durationNights");

-- CreateIndex
CREATE INDEX "PackageDeparture_packageId_status_startsOn_idx" ON "PackageDeparture"("packageId", "status", "startsOn");

-- CreateIndex
CREATE UNIQUE INDEX "PackageDeparture_packageId_startsOn_key" ON "PackageDeparture"("packageId", "startsOn");

-- CreateIndex
CREATE INDEX "Quote_expiresAt_idx" ON "Quote"("expiresAt");

-- CreateIndex
CREATE INDEX "Quote_userId_createdAt_idx" ON "Quote"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_reference_key" ON "Booking"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_quoteId_key" ON "Booking"("quoteId");

-- CreateIndex
CREATE INDEX "Booking_userId_createdAt_idx" ON "Booking"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Booking_status_holdExpiresAt_idx" ON "Booking"("status", "holdExpiresAt");

-- CreateIndex
CREATE INDEX "Booking_status_createdAt_idx" ON "Booking"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Booking_customerEmail_reference_idx" ON "Booking"("customerEmail", "reference");

-- CreateIndex
CREATE INDEX "BookingItem_bookingId_idx" ON "BookingItem"("bookingId");

-- CreateIndex
CREATE INDEX "BookingItem_productType_productId_status_idx" ON "BookingItem"("productType", "productId", "status");

-- CreateIndex
CREATE INDEX "BookingItem_roomId_startsAt_idx" ON "BookingItem"("roomId", "startsAt");

-- CreateIndex
CREATE INDEX "BookingItem_tourSessionId_status_idx" ON "BookingItem"("tourSessionId", "status");

-- CreateIndex
CREATE INDEX "BookingItem_carModelId_pickupLocationId_startsAt_idx" ON "BookingItem"("carModelId", "pickupLocationId", "startsAt");

-- CreateIndex
CREATE INDEX "BookingItem_transferRateId_startsAt_idx" ON "BookingItem"("transferRateId", "startsAt");

-- CreateIndex
CREATE INDEX "BookingItem_packageDepartureId_status_idx" ON "BookingItem"("packageDepartureId", "status");

-- CreateIndex
CREATE INDEX "Payment_bookingId_status_idx" ON "Payment"("bookingId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_bookingId_idempotencyKey_key" ON "Payment"("bookingId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerName_providerPaymentId_key" ON "Payment"("providerName", "providerPaymentId");

-- CreateIndex
CREATE INDEX "Refund_bookingId_idx" ON "Refund"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_providerName_providerRefundId_key" ON "Refund"("providerName", "providerRefundId");

-- CreateIndex
CREATE INDEX "WebhookEvent_processedAt_idx" ON "WebhookEvent"("processedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_providerName_providerEventId_key" ON "WebhookEvent"("providerName", "providerEventId");

-- CreateIndex
CREATE INDEX "Favorite_productType_productId_idx" ON "Favorite"("productType", "productId");

-- CreateIndex
CREATE INDEX "AuditEvent_aggregateType_aggregateId_occurredAt_idx" ON "AuditEvent"("aggregateType", "aggregateId", "occurredAt");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_occurredAt_idx" ON "AuditEvent"("actorId", "occurredAt");

-- CreateIndex
CREATE INDEX "AuditEvent_occurredAt_idx" ON "AuditEvent"("occurredAt");

-- CreateIndex
CREATE INDEX "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_operation_key_key" ON "IdempotencyKey"("operation", "key");

-- CreateIndex
CREATE INDEX "_DestinationToPackage_B_index" ON "_DestinationToPackage"("B");

-- AddForeignKey
ALTER TABLE "AuthToken" ADD CONSTRAINT "AuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hotel" ADD CONSTRAINT "Hotel_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatePlan" ADD CONSTRAINT "RatePlan_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatePlan" ADD CONSTRAINT "RatePlan_cancellationPolicyId_fkey" FOREIGN KEY ("cancellationPolicyId") REFERENCES "CancellationPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomRate" ADD CONSTRAINT "RoomRate_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomInventory" ADD CONSTRAINT "RoomInventory_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tour" ADD CONSTRAINT "Tour_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tour" ADD CONSTRAINT "Tour_cancellationPolicyId_fkey" FOREIGN KEY ("cancellationPolicyId") REFERENCES "CancellationPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourSession" ADD CONSTRAINT "TourSession_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarModel" ADD CONSTRAINT "CarModel_cancellationPolicyId_fkey" FOREIGN KEY ("cancellationPolicyId") REFERENCES "CancellationPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarInventory" ADD CONSTRAINT "CarInventory_carModelId_fkey" FOREIGN KEY ("carModelId") REFERENCES "CarModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarInventory" ADD CONSTRAINT "CarInventory_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferRate" ADD CONSTRAINT "TransferRate_originLocationId_fkey" FOREIGN KEY ("originLocationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferRate" ADD CONSTRAINT "TransferRate_destinationLocationId_fkey" FOREIGN KEY ("destinationLocationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferRate" ADD CONSTRAINT "TransferRate_vehicleClassId_fkey" FOREIGN KEY ("vehicleClassId") REFERENCES "TransferVehicleClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferCapacity" ADD CONSTRAINT "TransferCapacity_vehicleClassId_fkey" FOREIGN KEY ("vehicleClassId") REFERENCES "TransferVehicleClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_cancellationPolicyId_fkey" FOREIGN KEY ("cancellationPolicyId") REFERENCES "CancellationPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageDeparture" ADD CONSTRAINT "PackageDeparture_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingItem" ADD CONSTRAINT "BookingItem_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingItem" ADD CONSTRAINT "BookingItem_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingItem" ADD CONSTRAINT "BookingItem_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingItem" ADD CONSTRAINT "BookingItem_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingItem" ADD CONSTRAINT "BookingItem_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingItem" ADD CONSTRAINT "BookingItem_tourSessionId_fkey" FOREIGN KEY ("tourSessionId") REFERENCES "TourSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingItem" ADD CONSTRAINT "BookingItem_carModelId_fkey" FOREIGN KEY ("carModelId") REFERENCES "CarModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingItem" ADD CONSTRAINT "BookingItem_pickupLocationId_fkey" FOREIGN KEY ("pickupLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingItem" ADD CONSTRAINT "BookingItem_transferRateId_fkey" FOREIGN KEY ("transferRateId") REFERENCES "TransferRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingItem" ADD CONSTRAINT "BookingItem_packageDepartureId_fkey" FOREIGN KEY ("packageDepartureId") REFERENCES "PackageDeparture"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DestinationToPackage" ADD CONSTRAINT "_DestinationToPackage_A_fkey" FOREIGN KEY ("A") REFERENCES "Destination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DestinationToPackage" ADD CONSTRAINT "_DestinationToPackage_B_fkey" FOREIGN KEY ("B") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE;
