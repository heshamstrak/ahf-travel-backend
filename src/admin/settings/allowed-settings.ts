import { z } from "zod";

/**
 * Explicit allowlist: an admin can only read and write these specific Setting rows, never an
 * arbitrary key. Nothing related to authentication, JWT keys, database credentials or other
 * environment/secret values is ever reachable here — those are process environment variables, not
 * Setting rows, and this module never touches process.env.
 */
export const ALLOWED_SETTING_KEYS = [
  "payment.instapay",
  "booking.holdMinutes",
  "quote.ttlMinutes",
  "currency.display",
  "booking.guestCheckoutEnabled",
  "branding.identity",
  "branding.header",
  "branding.theme",
  "branding.hero",
] as const;
export type AllowedSettingKey = (typeof ALLOWED_SETTING_KEYS)[number];

/** Every field here is optional: an administrator may set only the handful of branding fields
 *  they care about, and anything unset falls back to the current AHF Travel defaults baked into
 *  the frontend (see src/services/branding.service.ts on the frontend side). */
const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "must be a 6-digit hex color, e.g. #1f6f66");

const brandingIdentitySchema = z.object({
  siteName: z.string().min(1).max(80).optional(),
  tagline: z.string().max(160).optional(),
  description: z.string().max(500).optional(),
  footerCopyright: z.string().max(200).optional(),
});

const brandingHeaderSchema = z.object({
  backgroundColor: hexColor.optional(),
  textColor: hexColor.optional(),
  navLinkColor: hexColor.optional(),
  transparency: z.number().min(0).max(1).optional(),
  logoWidth: z.number().int().min(16).max(400).optional(),
  logoHeight: z.number().int().min(16).max(400).optional(),
  headerHeight: z.number().int().min(40).max(200).optional(),
  backgroundPosition: z.enum(["center", "top", "bottom", "left", "right"]).optional(),
  backgroundSize: z.enum(["cover", "contain"]).optional(),
  overlayColor: hexColor.optional(),
  overlayOpacity: z.number().min(0).max(1).optional(),
});

const brandingThemeSchema = z.object({
  primaryColor: hexColor.optional(),
  secondaryColor: hexColor.optional(),
  accentColor: hexColor.optional(),
  buttonBackgroundColor: hexColor.optional(),
  buttonTextColor: hexColor.optional(),
  footerBackgroundColor: hexColor.optional(),
  footerTextColor: hexColor.optional(),
});

const brandingHeroSchema = z.object({
  title: z.string().max(160).optional(),
  subtitle: z.string().max(300).optional(),
  overlayColor: hexColor.optional(),
  overlayOpacity: z.number().min(0).max(1).optional(),
  textAlign: z.enum(["left", "center", "right"]).optional(),
  buttonText: z.string().max(60).optional(),
  buttonHref: z.string().max(300).optional(),
});

const schemas: Record<AllowedSettingKey, z.ZodTypeAny> = {
  "payment.instapay": z.object({
    recipientName: z.string().min(1).max(200),
    handle: z.string().min(1).max(200),
    instructionsText: z.string().min(1).max(2000),
  }),
  "booking.holdMinutes": z.number().int().min(1).max(1440),
  "quote.ttlMinutes": z.number().int().min(1).max(1440),
  "currency.display": z.array(z.string().length(3)).min(1).max(10),
  "booking.guestCheckoutEnabled": z.boolean(),
  "branding.identity": brandingIdentitySchema,
  "branding.header": brandingHeaderSchema,
  "branding.theme": brandingThemeSchema,
  "branding.hero": brandingHeroSchema,
};

export function validateSettingValue(key: AllowedSettingKey, value: unknown): unknown {
  const schema = schemas[key];
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(result.error.issues.map((i) => i.message).join("; "));
  }
  return result.data;
}
