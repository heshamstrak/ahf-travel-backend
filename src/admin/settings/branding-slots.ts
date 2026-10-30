/**
 * Site-branding images (logo, favicon, header backgrounds, hero backgrounds) are single-purpose
 * slots, not a per-product gallery — there is no catalogue row for them to belong to. Each slot
 * gets a fixed, well-known UUID as its Media.ownerId (SITE_BRANDING is the ownerType), so the
 * existing ImageManager/Media upload pipeline can manage one image per slot unchanged.
 */
export const BRANDING_SLOTS = {
  // Version-4-shaped so class-validator's @IsUUID() (which checks the RFC 4122 version/variant
  // nibbles, not just the general shape) accepts them like any real generated UUID.
  logo: "10000000-0000-4000-8000-000000000001",
  favicon: "10000000-0000-4000-8000-000000000002",
  headerBackgroundDesktop: "10000000-0000-4000-8000-000000000003",
  headerBackgroundMobile: "10000000-0000-4000-8000-000000000004",
  heroBackgroundDesktop: "10000000-0000-4000-8000-000000000005",
  heroBackgroundMobile: "10000000-0000-4000-8000-000000000006",
} as const;

export type BrandingSlot = keyof typeof BRANDING_SLOTS;
export const BRANDING_SLOT_OWNER_IDS: string[] = Object.values(BRANDING_SLOTS);
