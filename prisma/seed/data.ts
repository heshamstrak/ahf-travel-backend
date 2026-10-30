/*
 * Development catalogue. Product names, prices, descriptions, amenities, itineraries and dates
 * mirror the frontend mock data in H:\Booking\src\data so the API can replace the mocks one to one.
 *
 * Where the schema needs a value the frontend does not provide, the value is a labelled DEV DEFAULT
 * (check-in times, car cancellation, package traveller limits, transfer prices). Those are listed in
 * the Milestone 2 report and must be replaced with real data before launch.
 *
 * Fixtures whose names start with "hidden-" exercise visibility rules and must never be listed.
 */
import type {
  BudgetTier,
  CarCategory,
  ContentStatus,
  LocationType,
  MealPlan,
  PricingRuleKind,
  ProductType,
  PropertyType,
  TourCategory,
  TransferVehicleType,
  Transmission,
} from "@prisma/client";

const unsplash = (id: string, w = 1400) =>
  `https://images.unsplash.com/photo-${id}?q=80&w=${w}&auto=format&fit=crop`;
const commons = (path: string) => `https://thumb.wikimedia.org/wikipedia/commons/thumb/${path}`;

/** Mirrors H:\Booking\src\data\images.ts. Commons licences still need a per-file check before launch. */
export const IMG = {
  hero: unsplash("1568322445389-f64ac2515020", 2400),
  cairo: unsplash("1572252009286-268acec5ca0a"),
  giza: unsplash("1539768942893-daf53e448371"),
  sharm: commons("8/83/Naama_Bay_Beach_R01.jpg/1920px-Naama_Bay_Beach_R01.jpg"),
  hurghada: "https://upload.wikimedia.org/wikipedia/commons/2/26/Hurghada_Hilton_Resort_Beach_Red_Sea_-_panoramio.jpg",
  luxor: commons("1/11/Luxor_Temple%2C_Pillars%2C_Luxor%2C_Egypt.jpg/1920px-Luxor_Temple%2C_Pillars%2C_Luxor%2C_Egypt.jpg"),
  aswan: commons("3/3b/Aswan_Nile_R05.jpg/1920px-Aswan_Nile_R05.jpg"),
  marriottView: commons("0/0d/View_from_the_Oberoi_-_Mena_House_Hotel%2C_Egypt.jpg/1920px-View_from_the_Oberoi_-_Mena_House_Hotel%2C_Egypt.jpg"),
  marriottExterior: commons("c/c1/3._Mena_House_C.jpg/1920px-3._Mena_House_C.jpg"),
  marriottFacade: commons("3/36/2._Mena_House_Hotel_1_C.jpg/1920px-2._Mena_House_Hotel_1_C.jpg"),
  fourSeasons: commons("b/bf/Four_Seasons_Hotel_in_Cairo.JPG/1920px-Four_Seasons_Hotel_in_Cairo.JPG"),
  poolResort: unsplash("1520250497591-112f2f40a3f4"),
  pool: unsplash("1566073771259-6a8506099945"),
  sheratonHurghada: commons("3/3b/Sheraton_hurghada_-_panoramio.jpg/1920px-Sheraton_hurghada_-_panoramio.jpg"),
  winterPalace: commons("2/27/Luxor_Winter_Palace_R01.jpg/1920px-Luxor_Winter_Palace_R01.jpg"),
  oldCataract: commons("3/3f/Aswan_Old_Cataract_Hotel_R01.jpg/1920px-Aswan_Old_Cataract_Hotel_R01.jpg"),
  pyramidsSphinx: commons("d/db/Great_Sphinx_of_Giza_%28%D8%A3%D8%A8%D9%88_%D8%A7%D9%84%D9%87%D9%88%D9%84%29.jpg/1920px-Great_Sphinx_of_Giza_%28%D8%A3%D8%A8%D9%88_%D8%A7%D9%84%D9%87%D9%88%D9%84%29.jpg"),
  nileCruise: commons("3/32/Sun_Ray_Nile_cruise_ship_R01.jpg/1920px-Sun_Ray_Nile_cruise_ship_R01.jpg"),
  karnak: commons("c/c8/Karnak_Khonsu_Temple_R01.jpg/1920px-Karnak_Khonsu_Temple_R01.jpg"),
  luxorPillars: commons("1/11/Luxor_Temple%2C_Pillars%2C_Luxor%2C_Egypt.jpg/1920px-Luxor_Temple%2C_Pillars%2C_Luxor%2C_Egypt.jpg"),
  reef: commons("e/e7/%D0%9A%D0%BE%D1%80%D0%B0%D0%BB%D0%BB%D0%BE%D0%B2%D1%8B%D0%B9_%D1%80%D0%B8%D1%84_%D0%9D%D0%B0%D0%B0%D0%BC%D0%B0_%D0%91%D0%B5%D0%B9.jpg/1920px-%D0%9A%D0%BE%D1%80%D0%B0%D0%BB%D0%BB%D0%BE%D0%B2%D1%8B%D0%B9_%D1%80%D0%B8%D1%84_%D0%9D%D0%B0%D0%B0%D0%BC%D0%B0_%D0%91%D0%B5%D0%B9.jpg"),
  redSeaCoast: commons("5/55/Red_sea_2_-_panoramio.jpg/1920px-Red_sea_2_-_panoramio.jpg"),
  corolla: commons("2/24/2018_Toyota_Corolla_%28ZRE172R%29_Ascent_sedan_%282018-11-02%29_02.jpg/1920px-2018_Toyota_Corolla_%28ZRE172R%29_Ascent_sedan_%282018-11-02%29_02.jpg"),
  accent: commons("a/a2/2012_Hyundai_Accent_%28RB%29_Premium_sedan_%282018-10-01%29_02.jpg/1920px-2012_Hyundai_Accent_%28RB%29_Premium_sedan_%282018-10-01%29_02.jpg"),
  elantra: commons("9/9a/HYUNDAI_ELANTRA_SEDAN_%28XD%29_China.jpg/1920px-HYUNDAI_ELANTRA_SEDAN_%28XD%29_China.jpg"),
  mgOne: commons("b/b9/MG_ZS_EV_Facelift_1X7A5867.jpg/1920px-MG_ZS_EV_Facelift_1X7A5867.jpg"),
  rav4: commons("9/9f/Toyota_RAV4_Plug-in_Hybrid_GR_Sport_IMG_9891.jpg/1920px-Toyota_RAV4_Plug-in_Hybrid_GR_Sport_IMG_9891.jpg"),
  prado: commons("2/28/Toyota_Land_Cruiser_Prado%2C_Baku_%28P1090223%29.jpg/1920px-Toyota_Land_Cruiser_Prado%2C_Baku_%28P1090223%29.jpg"),
  mercedesC: unsplash("1493238792000-8113da705763"),
  van: commons("5/50/Mercedes_eVito_hotel_vans.jpg/1920px-Mercedes_eVito_hotel_vans.jpg"),
  minibus: commons("1/1f/1989_Toyota_HiAce_9-seater_minibus_%28LH51%29%2C_front_right.jpg/1920px-1989_Toyota_HiAce_9-seater_minibus_%28LH51%29%2C_front_right.jpg"),
  packageCairo: commons("f/fc/Muhammad_Ali_Mosque_1.jpg/1920px-Muhammad_Ali_Mosque_1.jpg"),
  packageClassic: commons("b/b2/Thebes%2C_Luxor%2C_Egypt%2C_Panoramic_view_of_the_Valley_of_the_Kings.jpg/1920px-Thebes%2C_Luxor%2C_Egypt%2C_Panoramic_view_of_the_Valley_of_the_Kings.jpg"),
  packageHighlights: commons("3/31/Templo_de_Nefertari%2C_Abu_Simbel%2C_Egipto%2C_2022-04-02%2C_DD_153.jpg/1920px-Templo_de_Nefertari%2C_Abu_Simbel%2C_Egipto%2C_2022-04-02%2C_DD_153.jpg"),
} as const;

/** Attribution per source host. Commons files are marked unverified until each licence is checked. */
export function licenceFor(url: string): { attribution: string; licenseCode: string } {
  if (url.includes("unsplash.com")) return { attribution: "Photo via Unsplash", licenseCode: "UNSPLASH" };
  return { attribution: "Photo via Wikimedia Commons (licence to be verified per file)", licenseCode: "UNVERIFIED-COMMONS" };
}

export const SETTINGS: Record<string, unknown> = {
  "currency.base": "EGP",
  "currency.display": ["EGP", "USD", "EUR"],
  "booking.holdMinutes": 15,
  "quote.ttlMinutes": 15,
  "booking.guestCheckoutEnabled": true,
  "payment.payLaterProductTypes": ["HOTEL", "PACKAGE"],
  // Milestone 5: shown to the customer when they select INSTAPAY, never hard-coded in the UI layer.
  "payment.instapay": {
    recipientName: "AHF Travel LLC",
    handle: "01000000000",
    instructionsText: "Send the exact booking total via InstaPay to the number above, then submit the transfer reference and a screenshot or PDF of the receipt. An admin verifies it, usually within one business day.",
  },
};

export interface PricingRuleSeed {
  code: string;
  kind: PricingRuleKind;
  label: string;
  productType: ProductType | null;
  percent: string | null;
  flatAmount: string | null;
  flatCurrency: string | null;
  conditions: Record<string, unknown> | null;
}

/** VAT 14% and service fee 3% are the values from the brief. They are data, changed by an admin, not by a deploy. */
export const PRICING_RULES: PricingRuleSeed[] = [
  { code: "vat-eg", kind: "TAX", label: "VAT", productType: null, percent: "0.1400", flatAmount: null, flatCurrency: null, conditions: null },
  { code: "platform-fee", kind: "FEE", label: "Service fee", productType: null, percent: "0.0300", flatAmount: null, flatCurrency: null, conditions: null },
  {
    // DEV PLACEHOLDER percentage. Applies only to stays of 7 nights or more.
    code: "long-stay-discount",
    kind: "DISCOUNT",
    label: "Long-stay discount, 5% (dev placeholder)",
    productType: "HOTEL",
    percent: "0.0500",
    flatAmount: null,
    flatCurrency: null,
    conditions: { minNights: 7 },
  },
  {
    code: "young-driver-surcharge",
    kind: "SURCHARGE",
    label: "Young driver surcharge",
    productType: "CAR",
    percent: null,
    flatAmount: "150.00",
    flatCurrency: "EGP",
    conditions: { driverAgeBelow: 25, perDay: true },
  },
];

export interface PolicySeed {
  code: string;
  name: string;
  description: string;
  /** Hours before the start that still give a full refund. null = non-refundable. */
  fullRefundHours: number | null;
}

/** Cancellation texts are copied from the frontend listings. The two DEV DEFAULT entries are not in the frontend. */
export const POLICIES: PolicySeed[] = [
  { code: "hotel-flex-48h", name: "Free cancellation 48 hours", description: "Free cancellation up to 48 hours before check-in.", fullRefundHours: 48 },
  { code: "hotel-flex-72h", name: "Free cancellation 72 hours", description: "Free cancellation up to 72 hours before check-in.", fullRefundHours: 72 },
  { code: "hotel-flex-5d", name: "Free cancellation 5 days", description: "Free cancellation up to 5 days before check-in.", fullRefundHours: 120 },
  { code: "hotel-flex-7d", name: "Free cancellation 7 days", description: "Free cancellation up to 7 days before check-in.", fullRefundHours: 168 },
  { code: "hotel-non-refundable", name: "Non-refundable", description: "Non-refundable. No refund if cancelled.", fullRefundHours: null },
  { code: "tour-24h", name: "Free cancellation 24 hours", description: "Free cancellation up to 24 hours before the tour starts.", fullRefundHours: 24 },
  { code: "tour-48h", name: "Free cancellation 48 hours", description: "Free cancellation up to 48 hours before departure.", fullRefundHours: 48 },
  { code: "tour-24h-weather", name: "Free cancellation 24 hours, weather refund", description: "Free cancellation up to 24 hours before the trip. Weather cancellations are refunded in full.", fullRefundHours: 24 },
  { code: "car-default", name: "DEV DEFAULT car cancellation", description: "DEV DEFAULT: free cancellation up to 72 hours before pick-up. Not in the frontend mock.", fullRefundHours: 72 },
  { code: "package-default", name: "DEV DEFAULT package cancellation", description: "DEV DEFAULT: free cancellation up to 14 days before departure. Not in the frontend mock.", fullRefundHours: 336 },
];

export interface DestinationSeed {
  slug: string;
  name: string;
  countryCode: string;
  isFeatured?: boolean;
  sortOrder: number;
  image: string;
  status?: ContentStatus;
}

export const DESTINATIONS: DestinationSeed[] = [
  { slug: "cairo", name: "Cairo", countryCode: "EG", isFeatured: true, sortOrder: 1, image: IMG.cairo },
  { slug: "giza", name: "Giza", countryCode: "EG", sortOrder: 2, image: IMG.giza },
  { slug: "sharm-el-sheikh", name: "Sharm El Sheikh", countryCode: "EG", sortOrder: 3, image: IMG.sharm },
  { slug: "hurghada", name: "Hurghada", countryCode: "EG", sortOrder: 4, image: IMG.hurghada },
  { slug: "luxor", name: "Luxor", countryCode: "EG", sortOrder: 5, image: IMG.luxor },
  { slug: "aswan", name: "Aswan", countryCode: "EG", sortOrder: 6, image: IMG.aswan },
  { slug: "hidden-siwa", name: "Hidden draft destination", countryCode: "EG", sortOrder: 99, image: IMG.hero, status: "DRAFT" },
];

export interface LocationSeed {
  /** Stable key used by routes. Not stored. */
  key: string;
  code: string | null;
  name: string;
  type: LocationType;
  destination: string;
  latitude: string | null;
  longitude: string | null;
  status?: ContentStatus;
}

export const LOCATIONS: LocationSeed[] = [
  { key: "CAI", code: "CAI", name: "Cairo International Airport", type: "AIRPORT", destination: "cairo", latitude: "30.121900", longitude: "31.405600" },
  { key: "HRG", code: "HRG", name: "Hurghada International Airport", type: "AIRPORT", destination: "hurghada", latitude: "27.178300", longitude: "33.799400" },
  { key: "SSH", code: "SSH", name: "Sharm El Sheikh International Airport", type: "AIRPORT", destination: "sharm-el-sheikh", latitude: "27.977000", longitude: "34.394700" },
  { key: "LXR", code: "LXR", name: "Luxor International Airport", type: "AIRPORT", destination: "luxor", latitude: "25.671000", longitude: "32.706600" },
  { key: "ASW", code: "ASW", name: "Aswan International Airport", type: "AIRPORT", destination: "aswan", latitude: "23.964400", longitude: "32.820000" },
  { key: "zone-cairo", code: null, name: "Cairo city centre", type: "ZONE", destination: "cairo", latitude: null, longitude: null },
  { key: "zone-sharm", code: null, name: "Naama Bay", type: "ZONE", destination: "sharm-el-sheikh", latitude: null, longitude: null },
  { key: "zone-hurghada", code: null, name: "Hurghada resort area", type: "ZONE", destination: "hurghada", latitude: null, longitude: null },
  { key: "zone-luxor", code: null, name: "Luxor city centre", type: "ZONE", destination: "luxor", latitude: null, longitude: null },
  { key: "zone-aswan", code: null, name: "Aswan city centre", type: "ZONE", destination: "aswan", latitude: null, longitude: null },
  { key: "branch-cairo", code: null, name: "Cairo city car branch", type: "CAR_BRANCH", destination: "cairo", latitude: null, longitude: null },
  { key: "branch-giza", code: null, name: "Giza car branch", type: "CAR_BRANCH", destination: "giza", latitude: null, longitude: null },
  { key: "hidden-branch-luxor", code: null, name: "Archived Luxor branch", type: "CAR_BRANCH", destination: "luxor", latitude: null, longitude: null, status: "ARCHIVED" },
];

export interface RoomSeed {
  code: string;
  name: string;
  bedType: string;
  /** Frontend "capacity". Stored as maxAdults; baseOccupancy is the first two adults. */
  capacity: number;
  sizeSqm: number;
  amenities: string[];
  pricePerNight: string;
  refundable: boolean;
  image: string;
  status?: ContentStatus;
}

export interface HotelSeed {
  slug: string;
  name: string;
  destination: string;
  location: string;
  propertyType: PropertyType;
  starRating: number;
  description: string;
  amenities: string[];
  guestRating: string;
  reviewCount: number;
  /** Cancellation policy for refundable rate plans. */
  refundPolicy: string;
  mealPlan: MealPlan;
  images: string[];
  rooms: RoomSeed[];
  status?: ContentStatus;
  deleted?: boolean;
}

export const HOTELS: HotelSeed[] = [
  {
    slug: "marriott-mena-house",
    name: "Marriott Mena House",
    destination: "giza",
    location: "Giza, Cairo",
    propertyType: "HOTEL",
    starRating: 5,
    description:
      "A legendary palace hotel set in palm gardens, with uninterrupted views of the Great Pyramids of Giza. Enjoy a heated pool, a restorative spa and refined dining steps from the plateau.",
    amenities: ["Pyramid view", "Pool", "Spa", "Free Wi-Fi", "Restaurant", "Airport shuttle"],
    guestRating: "9.2",
    reviewCount: 3120,
    refundPolicy: "hotel-flex-48h",
    mealPlan: "ROOM_ONLY",
    images: [IMG.marriottView, IMG.marriottExterior, IMG.marriottFacade, IMG.pool],
    rooms: [
      { code: "mena-pyramid-view-king", name: "Pyramid View King", bedType: "1 King bed", capacity: 2, sizeSqm: 42, amenities: ["Pyramid view", "Balcony", "Minibar", "Air conditioning"], pricePerNight: "6800.00", refundable: true, image: IMG.marriottView },
      { code: "mena-garden-twin", name: "Garden Twin", bedType: "2 Twin beds", capacity: 2, sizeSqm: 36, amenities: ["Garden view", "Air conditioning", "Safe"], pricePerNight: "5200.00", refundable: false, image: IMG.marriottFacade },
    ],
  },
  {
    slug: "four-seasons-cairo",
    name: "Four Seasons Cairo at Nile Plaza",
    destination: "cairo",
    location: "Garden City, Cairo",
    propertyType: "HOTEL",
    starRating: 5,
    description:
      "Two towers rising above the Nile in the heart of Cairo. Rooms face the river, and the hotel offers a spa, a rooftop pool and a private beach club on the water.",
    amenities: ["Nile view", "Spa", "Rooftop pool", "Fine dining", "Fitness centre", "Free Wi-Fi"],
    guestRating: "9.5",
    reviewCount: 2745,
    refundPolicy: "hotel-flex-72h",
    mealPlan: "ROOM_ONLY",
    images: [IMG.fourSeasons, IMG.pool, IMG.marriottExterior],
    rooms: [
      { code: "fs-nile-king", name: "Nile View King", bedType: "1 King bed", capacity: 2, sizeSqm: 48, amenities: ["Nile view", "Bathtub", "Nespresso", "Smart TV"], pricePerNight: "8200.00", refundable: true, image: IMG.fourSeasons },
      { code: "fs-family-suite", name: "Family Suite", bedType: "1 King + sofa bed", capacity: 4, sizeSqm: 85, amenities: ["Separate lounge", "Two bathrooms", "Nile view"], pricePerNight: "14500.00", refundable: true, image: IMG.pool },
      { code: "hidden-draft-room", name: "Hidden draft room", bedType: "1 King bed", capacity: 2, sizeSqm: 30, amenities: [], pricePerNight: "1000.00", refundable: true, image: IMG.hero, status: "DRAFT" },
    ],
  },
  {
    slug: "steigenberger-alcazar",
    name: "Steigenberger Alcazar",
    destination: "sharm-el-sheikh",
    location: "Naama Bay, Sharm El Sheikh",
    propertyType: "RESORT",
    starRating: 5,
    description:
      "A Red Sea resort on Naama Bay with a private beach, several pools and direct access to some of the region's best coral reefs and dive sites.",
    amenities: ["Private beach", "3 pools", "All inclusive", "Diving centre", "Kids club"],
    guestRating: "8.9",
    reviewCount: 1988,
    refundPolicy: "hotel-flex-7d",
    mealPlan: "ALL_INCLUSIVE",
    images: [IMG.sharm, IMG.poolResort, IMG.sheratonHurghada],
    rooms: [
      { code: "alc-sea-view-double", name: "Sea View Double", bedType: "1 Double bed", capacity: 2, sizeSqm: 34, amenities: ["Sea view", "Balcony", "Air conditioning"], pricePerNight: "4950.00", refundable: false, image: IMG.sharm },
      { code: "alc-beach-suite", name: "Beach Front Suite", bedType: "1 King bed + sofa", capacity: 3, sizeSqm: 62, amenities: ["Direct beach access", "Living area", "Mini bar"], pricePerNight: "8700.00", refundable: true, image: IMG.poolResort },
    ],
  },
  {
    slug: "rixos-premium-seagate",
    name: "Rixos Premium Seagate",
    destination: "hurghada",
    location: "Sahl Hasheesh, Hurghada",
    propertyType: "RESORT",
    starRating: 5,
    description:
      "An ultra all-inclusive resort on a long sandy beach, with lush tropical gardens, a children's club and a full spa programme.",
    amenities: ["Ultra all inclusive", "Private beach", "Kids club", "Spa", "Water sports"],
    guestRating: "9.0",
    reviewCount: 2210,
    refundPolicy: "hotel-flex-5d",
    mealPlan: "ALL_INCLUSIVE",
    images: [IMG.poolResort, IMG.hurghada, IMG.pool],
    rooms: [
      { code: "rixos-deluxe-room", name: "Deluxe Garden Room", bedType: "1 King bed", capacity: 2, sizeSqm: 40, amenities: ["Garden view", "Ultra all inclusive", "Balcony"], pricePerNight: "5400.00", refundable: true, image: IMG.poolResort },
      { code: "rixos-family-room", name: "Family Connecting Room", bedType: "2 Double beds", capacity: 4, sizeSqm: 58, amenities: ["Two rooms", "Sea view", "Kids amenities"], pricePerNight: "7900.00", refundable: false, image: IMG.hurghada },
    ],
  },
  {
    slug: "sheraton-hurghada",
    name: "Sheraton Hurghada Resort",
    destination: "hurghada",
    location: "Al Dahar, Hurghada",
    propertyType: "RESORT",
    starRating: 5,
    description:
      "A family-friendly beachfront resort with a long private beach, a spacious pool area and easy access to the marina and the city.",
    amenities: ["Beachfront", "Pool", "Family rooms", "Restaurants", "Free Wi-Fi"],
    guestRating: "8.6",
    reviewCount: 1475,
    refundPolicy: "hotel-flex-48h",
    mealPlan: "ROOM_ONLY",
    images: [IMG.sheratonHurghada, IMG.hurghada, IMG.poolResort],
    rooms: [
      { code: "sheraton-superior-room", name: "Superior Sea View", bedType: "1 King bed", capacity: 2, sizeSqm: 38, amenities: ["Sea view", "Balcony", "Air conditioning"], pricePerNight: "3900.00", refundable: true, image: IMG.sheratonHurghada },
    ],
  },
  {
    slug: "sofitel-winter-palace",
    name: "Sofitel Winter Palace Luxor",
    destination: "luxor",
    location: "Luxor Corniche",
    propertyType: "HOTEL",
    starRating: 5,
    description:
      "A historic Nile-side palace from the 1900s with manicured gardens, a grand colonnaded lobby and a view across the river to the Theban hills.",
    amenities: ["Nile view", "Garden", "Pool", "Spa", "Historic landmark"],
    guestRating: "9.1",
    reviewCount: 1310,
    refundPolicy: "hotel-flex-72h",
    mealPlan: "ROOM_ONLY",
    images: [IMG.winterPalace, IMG.luxor, IMG.pool],
    rooms: [
      { code: "wp-nile-room", name: "Nile View Room", bedType: "1 King bed", capacity: 2, sizeSqm: 44, amenities: ["Nile view", "Balcony", "Antique furnishings"], pricePerNight: "5100.00", refundable: true, image: IMG.winterPalace },
    ],
  },
  {
    slug: "old-cataract-aswan",
    name: "Old Cataract Aswan",
    destination: "aswan",
    location: "Aswan Corniche",
    propertyType: "HOTEL",
    starRating: 5,
    description:
      "A landmark hotel perched on granite cliffs above the First Cataract of the Nile. Terraces, a heated pool and sunset views over the river make it a classic Aswan stay.",
    amenities: ["Nile view", "Terrace", "Pool", "Spa", "Boat trips"],
    guestRating: "9.3",
    reviewCount: 980,
    refundPolicy: "hotel-flex-7d",
    mealPlan: "ROOM_ONLY",
    images: [IMG.oldCataract, IMG.aswan, IMG.pool],
    rooms: [
      { code: "oc-cataract-suite", name: "Cataract Suite", bedType: "1 King bed + sofa", capacity: 3, sizeSqm: 70, amenities: ["Nile view", "Terrace", "Bathtub"], pricePerNight: "9800.00", refundable: true, image: IMG.oldCataract },
      { code: "oc-classic-room", name: "Classic River Room", bedType: "1 Double bed", capacity: 2, sizeSqm: 36, amenities: ["River view", "Air conditioning", "Safe"], pricePerNight: "6100.00", refundable: false, image: IMG.aswan },
    ],
  },
  // Hidden fixtures. Each one is excluded from public listings for a different reason.
  {
    slug: "hidden-draft-lodge",
    name: "Hidden draft lodge",
    destination: "cairo",
    location: "Not published",
    propertyType: "VILLA",
    starRating: 4,
    description: "Draft listing, never shown publicly.",
    amenities: ["Pool"],
    guestRating: "0",
    reviewCount: 0,
    refundPolicy: "hotel-flex-48h",
    mealPlan: "ROOM_ONLY",
    images: [],
    status: "DRAFT",
    rooms: [
      { code: "hidden-room", name: "Hidden room", bedType: "1 King bed", capacity: 2, sizeSqm: 30, amenities: [], pricePerNight: "1000.00", refundable: true, image: IMG.hero },
    ],
  },
  {
    slug: "hidden-deleted-hotel",
    name: "Hidden deleted hotel",
    destination: "cairo",
    location: "Not published",
    propertyType: "HOTEL",
    starRating: 3,
    description: "Published but soft-deleted, never shown publicly.",
    amenities: [],
    guestRating: "0",
    reviewCount: 0,
    refundPolicy: "hotel-flex-48h",
    mealPlan: "ROOM_ONLY",
    images: [],
    status: "PUBLISHED",
    deleted: true,
    rooms: [
      { code: "hidden-deleted-room", name: "Deleted room", bedType: "1 Double bed", capacity: 2, sizeSqm: 25, amenities: [], pricePerNight: "900.00", refundable: true, image: IMG.hero },
    ],
  },
  {
    slug: "hidden-unsellable-hotel",
    name: "Hidden hotel with no sellable rooms",
    destination: "cairo",
    location: "Not published",
    propertyType: "HOTEL",
    starRating: 3,
    description: "Published, but its only room is a draft, so no rate can be sold.",
    amenities: [],
    guestRating: "0",
    reviewCount: 0,
    refundPolicy: "hotel-flex-48h",
    mealPlan: "ROOM_ONLY",
    images: [],
    status: "PUBLISHED",
    rooms: [
      { code: "hidden-unsellable-room", name: "Unsellable room", bedType: "1 Double bed", capacity: 2, sizeSqm: 25, amenities: [], pricePerNight: "800.00", refundable: true, image: IMG.hero, status: "DRAFT" },
    ],
  },
  {
    slug: "hidden-siwa-lodge",
    name: "Hidden lodge in a draft destination",
    destination: "hidden-siwa",
    location: "Siwa Oasis",
    propertyType: "APARTMENT",
    starRating: 3,
    description: "Published, but its destination is a draft, so it stays hidden.",
    amenities: [],
    guestRating: "0",
    reviewCount: 0,
    refundPolicy: "hotel-flex-48h",
    mealPlan: "ROOM_ONLY",
    images: [],
    status: "PUBLISHED",
    rooms: [
      { code: "hidden-siwa-room", name: "Siwa room", bedType: "1 Double bed", capacity: 2, sizeSqm: 28, amenities: [], pricePerNight: "700.00", refundable: true, image: IMG.hero },
    ],
  },
];

export interface TourSeed {
  slug: string;
  title: string;
  category: TourCategory;
  destination: string;
  meetingPoint: string;
  durationMinutes: number;
  maxGroupSize: number;
  languages: string[];
  pricePerPerson: string;
  rating: string;
  reviewCount: number;
  overview: string;
  highlights: string[];
  included: string[];
  excluded: string[];
  importantInfo: string[];
  cancellationPolicy: string;
  startTimes: string[];
  itinerary: { time: string; title: string; description: string }[];
  images: string[];
  status?: ContentStatus;
  /** Days after the seed date (Africa/Cairo), following the frontend pattern rolled forward. */
  dayOffsets: number[];
}

const TOUR_DAY_OFFSETS = [2, 3, 4, 6, 8, 10, 12, 14, 17, 20];

export const TOURS: TourSeed[] = [
  {
    slug: "pyramids-sphinx-tour",
    title: "Pyramids & Sphinx Tour",
    category: "HISTORY_CULTURE",
    destination: "giza",
    meetingPoint: "Hotel lobby pick-up, or the Pyramids Gate at the plateau entrance.",
    durationMinutes: 300,
    maxGroupSize: 12,
    languages: ["English", "Arabic", "French"],
    pricePerPerson: "950.00",
    rating: "4.8",
    reviewCount: 1542,
    overview:
      "Stand before the Great Pyramid of Khufu and the Great Sphinx with a licensed Egyptologist. The tour covers the plateau, the valley temple and the Sphinx enclosure, with time for photos and questions.",
    highlights: ["Entry to the Giza plateau", "Licensed Egyptologist guide", "Sphinx enclosure access", "Air-conditioned transport"],
    included: ["Professional guide", "Air-conditioned vehicle", "Entrance tickets", "Bottled water"],
    excluded: ["Camel or horse rides", "Gratuities", "Meals", "Entry to the Grand Egyptian Museum"],
    importantInfo: ["Wear comfortable walking shoes", "Bring sun protection and a hat", "Modest dress recommended"],
    cancellationPolicy: "tour-24h",
    startTimes: ["08:00", "09:00", "14:00"],
    itinerary: [
      { time: "08:00", title: "Hotel pick-up", description: "Your driver collects you from your hotel in Cairo or Giza." },
      { time: "08:45", title: "Sphinx & valley temple", description: "Walk the sandy approach and learn how the Sphinx was carved." },
      { time: "10:00", title: "Great Pyramid of Khufu", description: "Explore the plateau and see the construction theories up close." },
      { time: "11:30", title: "Camel ride (optional)", description: "Ride around the pyramids at your own pace, with photo stops." },
      { time: "12:30", title: "Return", description: "Drop-off at your hotel with time to spare for lunch." },
    ],
    images: [IMG.pyramidsSphinx, IMG.giza, IMG.cairo],
    dayOffsets: TOUR_DAY_OFFSETS,
  },
  {
    slug: "nile-dinner-cruise",
    title: "Nile Dinner Cruise with Show",
    category: "DINING_ENTERTAINMENT",
    destination: "cairo",
    meetingPoint: "Zamalek Nile dock, Cairo. Exact pier shown in your confirmation.",
    durationMinutes: 180,
    maxGroupSize: 40,
    languages: ["English", "Arabic"],
    pricePerPerson: "720.00",
    rating: "4.6",
    reviewCount: 987,
    overview:
      "Glide along the Nile by night on a lit cruise boat. Enjoy a buffet dinner, live music and a Tanoura dance show while the city's skyline slides past.",
    highlights: ["Buffet dinner", "Live Tanoura show", "Illuminated Nile views", "Soft drinks included"],
    included: ["Buffet dinner", "Soft drinks", "Live entertainment"],
    excluded: ["Alcoholic beverages", "Hotel transfers (available as add-on)", "Gratuities"],
    importantInfo: ["Smart casual dress code", "Boarding closes 15 minutes before departure"],
    cancellationPolicy: "tour-48h",
    startTimes: ["20:00"],
    itinerary: [
      { time: "20:00", title: "Boarding", description: "Welcome drink and seating on the upper deck." },
      { time: "20:30", title: "Dinner buffet", description: "Egyptian and international dishes with a live cooking station." },
      { time: "21:30", title: "Tanoura show", description: "Traditional music and whirling dancers." },
      { time: "22:45", title: "Return to dock", description: "Transfers back to your hotel are available on request." },
    ],
    images: [IMG.nileCruise, IMG.cairo, IMG.aswan],
    dayOffsets: TOUR_DAY_OFFSETS,
  },
  {
    slug: "luxor-full-day-tour",
    title: "Luxor Full-Day Tour",
    category: "HISTORY_CULTURE",
    destination: "luxor",
    meetingPoint: "Hotel pick-up in Luxor. Guides meet guests in the lobby.",
    durationMinutes: 600,
    maxGroupSize: 10,
    languages: ["English", "Arabic", "German"],
    pricePerPerson: "1450.00",
    rating: "4.9",
    reviewCount: 764,
    overview:
      "A full day across the Nile's west and east banks: the Valley of the Kings, Hatshepsut's temple, the Colossi of Memnon and the great temple complex of Karnak.",
    highlights: ["Valley of the Kings", "Temple of Hatshepsut", "Karnak Temple", "Luxor Temple at dusk"],
    included: ["English-speaking Egyptologist", "Private air-conditioned vehicle", "Entry tickets", "Lunch"],
    excluded: ["Tomb upgrade tickets", "Gratuities", "Drinks"],
    importantInfo: ["Bring your passport for site entry", "Cash for small tips is useful"],
    cancellationPolicy: "tour-24h",
    startTimes: ["06:30", "07:30"],
    itinerary: [
      { time: "06:30", title: "Hotel pick-up", description: "Early start to beat the midday heat." },
      { time: "07:30", title: "West Bank", description: "Valley of the Kings and Hatshepsut's temple." },
      { time: "12:00", title: "Lunch", description: "Lunch at a riverside restaurant on the Nile." },
      { time: "14:00", title: "Karnak Temple", description: "Explore the vast hypostyle hall and sacred lake." },
      { time: "17:00", title: "Luxor Temple", description: "Golden-hour walk through the colonnade." },
    ],
    images: [IMG.karnak, IMG.luxorPillars, IMG.luxor],
    dayOffsets: TOUR_DAY_OFFSETS,
  },
  {
    slug: "red-sea-snorkeling-adventure",
    title: "Red Sea Snorkeling Adventure",
    category: "WATER_ACTIVITIES",
    destination: "hurghada",
    meetingPoint: "Hurghada Marina, boat #4.",
    durationMinutes: 360,
    maxGroupSize: 20,
    languages: ["English", "Russian", "German"],
    pricePerPerson: "890.00",
    rating: "4.7",
    reviewCount: 1103,
    overview:
      "Sail to two house reefs of the Red Sea with a certified crew. Snorkel with colourful reef fish, turtles on good days, and enjoy a lunch on board.",
    highlights: ["Two snorkel stops", "Equipment included", "Lunch on board", "Certified crew"],
    included: ["Snorkel gear", "Lunch and soft drinks", "Life vest", "Hotel transfer"],
    excluded: ["Underwater camera hire", "Gratuities"],
    importantInfo: ["Non-swimmers can use a life vest", "Sunscreen safe for reefs is recommended"],
    cancellationPolicy: "tour-24h-weather",
    startTimes: ["08:30", "13:30"],
    itinerary: [
      { time: "08:30", title: "Marina check-in", description: "Briefing and equipment fitting on the dock." },
      { time: "09:30", title: "First reef", description: "Snorkel session with the guide." },
      { time: "11:30", title: "Second reef", description: "Relax on deck or snorkel again." },
      { time: "13:00", title: "Lunch and return", description: "Lunch served on the boat before heading back." },
    ],
    images: [IMG.reef, IMG.redSeaCoast, IMG.hurghada],
    dayOffsets: TOUR_DAY_OFFSETS,
  },
  {
    slug: "aswan-felucca-philae",
    title: "Aswan Felucca & Philae Temple",
    category: "HISTORY_CULTURE",
    destination: "aswan",
    meetingPoint: "Aswan Corniche, near the Old Cataract Hotel.",
    durationMinutes: 300,
    maxGroupSize: 8,
    languages: ["English", "Arabic"],
    pricePerPerson: "1100.00",
    rating: "4.8",
    reviewCount: 612,
    overview:
      "Sail a traditional felucca across the Nile to the island of Philae, home of the Temple of Isis, then visit the Nubian village of Elephantine.",
    highlights: ["Traditional felucca sail", "Temple of Isis at Philae", "Nubian village visit"],
    included: ["Felucca with captain", "Philae entry ticket", "Bottled water", "Guide"],
    excluded: ["Lunch", "Gratuities"],
    importantInfo: ["Bring a hat and sunscreen", "Sailing depends on the wind"],
    cancellationPolicy: "tour-24h",
    startTimes: ["08:00", "15:00"],
    itinerary: [
      { time: "08:00", title: "Hotel pick-up", description: "Transfer to the Aswan Corniche." },
      { time: "08:30", title: "Felucca sail", description: "Sail the Nile between granite islands." },
      { time: "10:30", title: "Philae Temple", description: "Explore the temple complex by boat." },
      { time: "12:30", title: "Nubian village", description: "Tea and a visit to a local family home." },
    ],
    images: [IMG.aswan, IMG.redSeaCoast, IMG.luxor],
    dayOffsets: TOUR_DAY_OFFSETS,
  },
  {
    slug: "giza-pyramids-sunset",
    title: "Giza Pyramids Sunset Experience",
    category: "SIGHTSEEING",
    destination: "giza",
    meetingPoint: "Hotel pick-up within central Cairo.",
    durationMinutes: 240,
    maxGroupSize: 10,
    languages: ["English", "Arabic"],
    pricePerPerson: "780.00",
    rating: "4.7",
    reviewCount: 530,
    overview:
      "Watch the sun set behind the three great pyramids from a rooftop terrace, then take a camel ride across the desert edge as the sky turns gold.",
    highlights: ["Rooftop sunset view", "Camel ride", "Evening return to Cairo"],
    included: ["Transport", "Camel ride", "Terrace access", "Bottled water"],
    excluded: ["Meals", "Gratuities"],
    importantInfo: ["Dress warmly, desert evenings are cool", "Camel rides are optional"],
    cancellationPolicy: "tour-24h",
    startTimes: ["15:30"],
    itinerary: [
      { time: "15:30", title: "Pick-up", description: "Transfer from your hotel to Giza." },
      { time: "16:30", title: "Camel ride", description: "A short ride along the desert edge." },
      { time: "17:45", title: "Sunset terrace", description: "Golden hour views of the pyramids." },
      { time: "19:00", title: "Return", description: "Drop-off at your hotel." },
    ],
    images: [IMG.giza, IMG.pyramidsSphinx, IMG.giza],
    dayOffsets: TOUR_DAY_OFFSETS,
  },
  {
    slug: "hidden-archived-tour",
    title: "Hidden archived desert safari",
    category: "SIGHTSEEING",
    destination: "luxor",
    meetingPoint: "Not published",
    durationMinutes: 480,
    maxGroupSize: 6,
    languages: ["English"],
    pricePerPerson: "2000.00",
    rating: "0",
    reviewCount: 0,
    overview: "Archived, never shown publicly.",
    highlights: [],
    included: [],
    excluded: [],
    importantInfo: [],
    cancellationPolicy: "tour-24h",
    startTimes: ["07:00"],
    itinerary: [],
    images: [],
    status: "ARCHIVED",
    dayOffsets: [5],
  },
];

export interface CarSeed {
  slug: string;
  brand: string;
  name: string;
  category: CarCategory;
  transmission: Transmission;
  airConditioning: boolean;
  passengers: number;
  bags: number;
  doors: number;
  includedKmPerDay: number;
  fuelPolicy: string;
  minDriverAge: number;
  pricePerDay: string;
  depositAmount: string;
  coverage: string[];
  rentalConditions: string[];
  pickupNotes: string;
  images: string[];
  status?: ContentStatus;
}

const STANDARD_COVERAGE = ["Basic damage waiver", "Theft protection", "Third-party liability"];
const STANDARD_CONDITIONS = [
  "Driver must be 21 or older with a valid licence held for 2+ years",
  "Passport and valid international or national licence required at pick-up",
  "No smoking inside the vehicle",
];
const FULL_TO_FULL = "Full to full.";

export const CARS: CarSeed[] = [
  { slug: "toyota-corolla", brand: "Toyota", name: "Corolla", category: "ECONOMY", transmission: "AUTOMATIC", airConditioning: true, passengers: 5, bags: 2, doors: 4, includedKmPerDay: 250, fuelPolicy: "Full to full. Refuel before returning to avoid charges.", minDriverAge: 21, pricePerDay: "650.00", depositAmount: "3000.00", coverage: STANDARD_COVERAGE, rentalConditions: STANDARD_CONDITIONS, pickupNotes: "Cairo International Airport (CAI) arrivals hall, or your hotel on request.", images: [IMG.corolla, IMG.accent, IMG.mercedesC] },
  { slug: "hyundai-elantra", brand: "Hyundai", name: "Elantra", category: "COMPACT", transmission: "AUTOMATIC", airConditioning: true, passengers: 5, bags: 2, doors: 4, includedKmPerDay: 250, fuelPolicy: FULL_TO_FULL, minDriverAge: 21, pricePerDay: "720.00", depositAmount: "3500.00", coverage: STANDARD_COVERAGE, rentalConditions: STANDARD_CONDITIONS, pickupNotes: "Cairo International Airport, Hurghada Airport or city branches.", images: [IMG.elantra, IMG.accent, IMG.corolla] },
  { slug: "hyundai-accent", brand: "Hyundai", name: "Accent", category: "ECONOMY", transmission: "MANUAL", airConditioning: true, passengers: 5, bags: 2, doors: 4, includedKmPerDay: 200, fuelPolicy: FULL_TO_FULL, minDriverAge: 21, pricePerDay: "550.00", depositAmount: "2500.00", coverage: STANDARD_COVERAGE, rentalConditions: STANDARD_CONDITIONS, pickupNotes: "City branches in Cairo and Giza, delivery available.", images: [IMG.accent, IMG.corolla] },
  { slug: "mg-one", brand: "MG", name: "One", category: "SUV", transmission: "AUTOMATIC", airConditioning: true, passengers: 5, bags: 3, doors: 5, includedKmPerDay: 300, fuelPolicy: FULL_TO_FULL, minDriverAge: 21, pricePerDay: "980.00", depositAmount: "4000.00", coverage: STANDARD_COVERAGE, rentalConditions: STANDARD_CONDITIONS, pickupNotes: "Airports and major hotels across Egypt.", images: [IMG.mgOne, IMG.rav4] },
  { slug: "toyota-rav4", brand: "Toyota", name: "RAV4", category: "SUV", transmission: "AUTOMATIC", airConditioning: true, passengers: 5, bags: 3, doors: 5, includedKmPerDay: 300, fuelPolicy: FULL_TO_FULL, minDriverAge: 21, pricePerDay: "1250.00", depositAmount: "5000.00", coverage: STANDARD_COVERAGE, rentalConditions: STANDARD_CONDITIONS, pickupNotes: "Cairo International Airport and Hurghada Airport.", images: [IMG.rav4, IMG.mgOne, IMG.prado] },
  { slug: "toyota-land-cruiser-prado", brand: "Toyota", name: "Land Cruiser Prado", category: "PREMIUM_SUV", transmission: "AUTOMATIC", airConditioning: true, passengers: 7, bags: 4, doors: 5, includedKmPerDay: 350, fuelPolicy: FULL_TO_FULL, minDriverAge: 21, pricePerDay: "1900.00", depositAmount: "7000.00", coverage: [...STANDARD_COVERAGE, "Excess reduction"], rentalConditions: STANDARD_CONDITIONS, pickupNotes: "Cairo International Airport, Luxor and Aswan branches.", images: [IMG.prado, IMG.rav4] },
  { slug: "mercedes-c-class", brand: "Mercedes-Benz", name: "C-Class", category: "LUXURY", transmission: "AUTOMATIC", airConditioning: true, passengers: 4, bags: 2, doors: 4, includedKmPerDay: 200, fuelPolicy: "Full to full. Premium fuel required.", minDriverAge: 25, pricePerDay: "2100.00", depositAmount: "10000.00", coverage: [...STANDARD_COVERAGE, "Excess reduction", "Roadside assistance"], rentalConditions: [...STANDARD_CONDITIONS, "Driver must be 25 or older for luxury category"], pickupNotes: "Cairo airport and Nile hotels. Chauffeur option available.", images: [IMG.mercedesC, IMG.prado] },
  { slug: "hidden-draft-car", brand: "Test", name: "Hidden draft model", category: "ECONOMY", transmission: "MANUAL", airConditioning: false, passengers: 4, bags: 1, doors: 4, includedKmPerDay: 100, fuelPolicy: FULL_TO_FULL, minDriverAge: 21, pricePerDay: "300.00", depositAmount: "500.00", coverage: [], rentalConditions: [], pickupNotes: "Never shown publicly.", images: [], status: "DRAFT" },
];

export interface VehicleClassSeed {
  code: TransferVehicleType;
  name: string;
  passengersMax: number;
  luggageMax: number;
  features: string[];
  basePriceEGP: number;
  image: string;
}

export const VEHICLE_CLASSES: VehicleClassSeed[] = [
  { code: "SEDAN", name: "Standard Sedan", passengersMax: 3, luggageMax: 2, features: ["Air conditioning", "Bottled water", "Meet & greet"], basePriceEGP: 850, image: IMG.corolla },
  { code: "SUV", name: "Comfort SUV", passengersMax: 4, luggageMax: 4, features: ["Extra legroom", "Air conditioning", "Meet & greet", "Phone charger"], basePriceEGP: 1200, image: IMG.prado },
  { code: "PREMIUM", name: "Executive Mercedes", passengersMax: 3, luggageMax: 3, features: ["Leather seats", "Chauffeur in suit", "Newspapers & water", "Free waiting time"], basePriceEGP: 2200, image: IMG.mercedesC },
  { code: "VAN", name: "Family Van", passengersMax: 7, luggageMax: 6, features: ["Sliding doors", "Air conditioning", "Child seats on request"], basePriceEGP: 1500, image: IMG.van },
  { code: "MINIBUS", name: "Group Minibus", passengersMax: 12, luggageMax: 10, features: ["Group travel", "Luggage space", "Air conditioning", "Driver assistance"], basePriceEGP: 2400, image: IMG.minibus },
];

/**
 * Airport <-> resort-area routes, in both directions. The frontend gives one price per vehicle class,
 * not per route, so every route uses that base price. These are DEV PLACEHOLDERS until finance confirms.
 */
export const ROUTES: { airport: string; zone: string }[] = [
  { airport: "CAI", zone: "zone-cairo" },
  { airport: "HRG", zone: "zone-hurghada" },
  { airport: "SSH", zone: "zone-sharm" },
  { airport: "LXR", zone: "zone-luxor" },
  { airport: "ASW", zone: "zone-aswan" },
];

export const TRANSFER_VALID_FROM = "2026-01-01";

export interface PackageSeed {
  slug: string;
  title: string;
  destinations: string[];
  budgetTier: BudgetTier;
  durationDays: number;
  durationNights: number;
  /** Frontend startingPrice. Modelled as PER_PERSON, the frontend does not say otherwise. */
  startingPrice: string;
  overview: string;
  hotel: { name: string; stars: number; description: string };
  toursIncluded: string[];
  transfersIncluded: string[];
  itinerary: { day: number; title: string; description: string }[];
  included: string[];
  excluded: string[];
  images: string[];
  dayOffsets: number[];
  status?: ContentStatus;
  deleted?: boolean;
}

const PACKAGE_DAY_OFFSETS = [5, 12, 19, 33, 40];

/** DEV DEFAULT. The frontend shows no traveller limits or departure capacity. */
export const DEV_PACKAGE_CAPACITY = 20;
export const DEV_PACKAGE_MAX_TRAVELLERS = 10;

export const PACKAGES: PackageSeed[] = [
  {
    slug: "cairo-weekend",
    title: "Cairo Weekend",
    destinations: ["cairo", "giza"],
    budgetTier: "MID",
    durationDays: 3,
    durationNights: 2,
    startingPrice: "7200.00",
    overview:
      "A compact long weekend covering Cairo's Islamic quarter, the pyramids of Giza and a Nile dinner cruise, with a comfortable hotel and private transfers.",
    hotel: { name: "Marriott Mena House", stars: 5, description: "Deluxe room with pyramid views, breakfast included." },
    toursIncluded: ["Pyramids & Sphinx Tour", "Nile Dinner Cruise with Show"],
    transfersIncluded: ["Airport pick-up", "Airport drop-off"],
    itinerary: [
      { day: 1, title: "Arrival & Islamic Cairo", description: "Airport transfer, check-in, then a guided walk through the Citadel and Muhammad Ali Mosque." },
      { day: 2, title: "Giza pyramids", description: "Full morning at the Giza plateau with an Egyptologist. Afternoon at leisure." },
      { day: 3, title: "Nile dinner & departure", description: "Evening Nile cruise with dinner and show. Transfer to the airport the next morning." },
    ],
    included: ["2 nights in a deluxe room", "Breakfast daily", "2 guided tours", "Airport transfers", "Nile dinner cruise"],
    excluded: ["International flights", "Visa fees", "Personal expenses", "Gratuities"],
    images: [IMG.packageCairo, IMG.cairo, IMG.giza],
    dayOffsets: PACKAGE_DAY_OFFSETS,
  },
  {
    slug: "classic-egypt",
    title: "Classic Egypt",
    destinations: ["cairo", "luxor", "aswan"],
    budgetTier: "LUXURY",
    durationDays: 7,
    durationNights: 6,
    startingPrice: "18500.00",
    overview:
      "The complete ancient Egypt journey. Explore the pyramids in Cairo, the temples and tombs of Luxor and a felucca sail through Aswan, with five-star hotels in each city.",
    hotel: { name: "Four Seasons / Winter Palace / Old Cataract", stars: 5, description: "Five-star stays in Cairo, Luxor and Aswan." },
    toursIncluded: ["Pyramids & Sphinx Tour", "Luxor Full-Day Tour", "Aswan Felucca & Philae Temple"],
    transfersIncluded: ["Airport transfers", "Inter-city transfers by car"],
    itinerary: [
      { day: 1, title: "Arrive in Cairo", description: "Airport pick-up and check-in at the Nile hotel." },
      { day: 2, title: "Giza pyramids", description: "Morning tour of the plateau and the Sphinx." },
      { day: 3, title: "Cairo at leisure", description: "Free time, with an optional Nile dinner cruise." },
      { day: 4, title: "Fly to Luxor", description: "Domestic flight and transfer to the Nile hotel." },
      { day: 5, title: "Luxor temples", description: "Full-day tour of the Valley of the Kings and Karnak." },
      { day: 6, title: "Fly to Aswan", description: "Afternoon felucca sail to Philae." },
      { day: 7, title: "Departure", description: "Transfer to Aswan airport." },
    ],
    included: ["6 nights in five-star hotels", "Breakfast daily", "3 guided tours", "Domestic flights", "All transfers"],
    excluded: ["International flights", "Visa fees", "Meals not listed", "Gratuities"],
    images: [IMG.packageClassic, IMG.luxor, IMG.aswan],
    dayOffsets: PACKAGE_DAY_OFFSETS,
  },
  {
    slug: "red-sea-escape",
    title: "Red Sea Escape",
    destinations: ["hurghada"],
    budgetTier: "MID",
    durationDays: 5,
    durationNights: 4,
    startingPrice: "11200.00",
    overview:
      "Four nights on the Red Sea with a beach resort, a snorkeling trip to the house reefs and an easy airport transfer.",
    hotel: { name: "Sheraton Hurghada Resort", stars: 5, description: "Beachfront room with half board." },
    toursIncluded: ["Red Sea Snorkeling Adventure"],
    transfersIncluded: ["Airport pick-up", "Airport drop-off"],
    itinerary: [
      { day: 1, title: "Arrival", description: "Airport transfer and beach welcome." },
      { day: 2, title: "Relax on the beach", description: "Free day for water sports and the pool." },
      { day: 3, title: "Snorkeling trip", description: "Boat trip to the two house reefs with lunch." },
      { day: 4, title: "Free day", description: "Spa, marina walk or a day at leisure." },
      { day: 5, title: "Departure", description: "Transfer to Hurghada airport." },
    ],
    included: ["4 nights beachfront", "Half board", "Snorkeling trip", "Airport transfers"],
    excluded: ["Drinks", "Water sports", "Gratuities"],
    images: [IMG.redSeaCoast, IMG.hurghada, IMG.reef],
    dayOffsets: PACKAGE_DAY_OFFSETS,
  },
  {
    slug: "egypt-highlights",
    title: "Egypt Highlights",
    destinations: ["cairo", "luxor", "aswan", "hurghada"],
    budgetTier: "LUXURY",
    durationDays: 10,
    durationNights: 9,
    startingPrice: "27900.00",
    overview:
      "The grand tour of Egypt in ten days: the pyramids, the temples of Luxor, Abu Simbel, a Nile cruise and a finish on the Red Sea.",
    hotel: { name: "Mix of five-star hotels", stars: 5, description: "Four five-star stays across four destinations." },
    toursIncluded: ["Pyramids & Sphinx Tour", "Luxor Full-Day Tour", "Aswan Felucca & Philae Temple", "Red Sea Snorkeling Adventure"],
    transfersIncluded: ["All airport transfers", "Inter-city private transfers"],
    itinerary: [
      { day: 1, title: "Arrive in Cairo", description: "Airport transfer and check-in." },
      { day: 2, title: "Giza pyramids", description: "Full morning on the plateau." },
      { day: 3, title: "Cairo & Nile dinner", description: "Egyptian Museum and an evening Nile dinner cruise." },
      { day: 4, title: "Fly to Luxor", description: "Transfer to the Nile hotel." },
      { day: 5, title: "Luxor temples", description: "Valley of the Kings, Karnak and Luxor Temple." },
      { day: 6, title: "Aswan", description: "Drive to Abu Simbel in the early morning, then the afternoon at leisure." },
      { day: 7, title: "Felucca & Philae", description: "Sail to Philae and visit Elephantine." },
      { day: 8, title: "Fly to Hurghada", description: "Transfer to the Red Sea resort." },
      { day: 9, title: "Snorkeling", description: "Boat trip to the house reefs." },
      { day: 10, title: "Departure", description: "Transfer to Hurghada airport." },
    ],
    included: ["9 nights across 4 destinations", "Breakfast daily", "4 guided tours", "Domestic flights", "All transfers"],
    excluded: ["International flights", "Visa fees", "Tips", "Entry to Abu Simbel (optional add-on)"],
    images: [IMG.packageHighlights, IMG.packageClassic, IMG.packageCairo],
    dayOffsets: PACKAGE_DAY_OFFSETS,
  },
  {
    slug: "hidden-draft-package",
    title: "Hidden draft package",
    destinations: ["cairo"],
    budgetTier: "BUDGET",
    durationDays: 2,
    durationNights: 1,
    startingPrice: "1000.00",
    overview: "Draft, never shown publicly.",
    hotel: { name: "Draft", stars: 3, description: "Draft" },
    toursIncluded: [],
    transfersIncluded: [],
    itinerary: [],
    included: [],
    excluded: [],
    images: [],
    dayOffsets: [5],
    status: "DRAFT",
  },
  {
    slug: "hidden-deleted-package",
    title: "Hidden deleted package",
    destinations: ["cairo"],
    budgetTier: "BUDGET",
    durationDays: 2,
    durationNights: 1,
    startingPrice: "1000.00",
    overview: "Soft-deleted, never shown publicly.",
    hotel: { name: "Deleted", stars: 3, description: "Deleted" },
    toursIncluded: [],
    transfersIncluded: [],
    itinerary: [],
    included: [],
    excluded: [],
    images: [],
    dayOffsets: [5],
    status: "PUBLISHED",
    deleted: true,
  },
];

/**
 * Non-visible date fixtures. Their dates are fixed far in the past or in a non-open state, so they stay
 * hidden whatever the clock says.
 */
export const HIDDEN_SESSIONS: {
  tourSlug: string;
  status: "OPEN" | "CLOSED";
  /** Absolute instant for fixtures that must stay in the past. */
  startsAt?: string;
  /** Rolling fixtures: days after the seed date, at a wall-clock time in the business zone. */
  dayOffset?: number;
  time?: string;
}[] = [
  { tourSlug: "nile-dinner-cruise", startsAt: "2025-06-01T20:00:00+03:00", status: "OPEN" },
  { tourSlug: "nile-dinner-cruise", dayOffset: 23, time: "20:00", status: "CLOSED" },
];
export const HIDDEN_DEPARTURES = [
  { packageSlug: "cairo-weekend", startsOn: "2025-06-01", status: "OPEN" as const },
];

/** Rolling inventory windows, in days from the seed date. Units are DEV values. */
export const ROOM_INVENTORY_DAYS = 60;
export const ROOM_UNITS = 5;
export const TRANSFER_CAPACITY_DAYS = 30;
export const TRANSFER_UNITS = 10;

/**
 * Exchange rates used only when a quote asks for a display currency. Every row is a DEV PLACEHOLDER
 * (source "DEV_PLACEHOLDER"), not a fetched market rate.
 */
export const EXCHANGE_RATES = [
  { baseCurrency: "EGP", quoteCurrency: "USD", rate: "0.02050000", source: "DEV_PLACEHOLDER" },
  { baseCurrency: "EGP", quoteCurrency: "EUR", rate: "0.01800000", source: "DEV_PLACEHOLDER" },
];

/** Rolling car inventory window in days from the seed date, and units per branch. */
export const CAR_INVENTORY_DAYS = 30;
export const CAR_UNITS_PER_BRANCH = 3;
