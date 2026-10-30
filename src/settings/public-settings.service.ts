import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { MediaReader } from "../catalog/common/media";
import { BRANDING_SLOTS } from "../admin/settings/branding-slots";

const BRANDING_KEYS = ["branding.identity", "branding.header", "branding.theme", "branding.hero"] as const;

interface BrandingIdentity {
  siteName?: string;
  tagline?: string;
  description?: string;
  footerCopyright?: string;
}
interface BrandingHeader {
  backgroundColor?: string;
  textColor?: string;
  navLinkColor?: string;
  transparency?: number;
  logoWidth?: number;
  logoHeight?: number;
  headerHeight?: number;
  backgroundPosition?: string;
  backgroundSize?: string;
  overlayColor?: string;
  overlayOpacity?: number;
}
interface BrandingTheme {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  buttonBackgroundColor?: string;
  buttonTextColor?: string;
  footerBackgroundColor?: string;
  footerTextColor?: string;
}
interface BrandingHero {
  title?: string;
  subtitle?: string;
  overlayColor?: string;
  overlayOpacity?: number;
  textAlign?: string;
  buttonText?: string;
  buttonHref?: string;
}

/**
 * The public, read-only view of site branding. Only the four `branding.*` Setting keys and their
 * associated SITE_BRANDING images are ever reachable here — nothing else in the Setting table
 * (payment handles, booking windows, …) is exposed through this endpoint, regardless of what
 * future keys get added elsewhere.
 */
@Injectable()
export class PublicSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaReader,
  ) {}

  async branding() {
    const rows = await this.prisma.setting.findMany({ where: { key: { in: [...BRANDING_KEYS] } } });
    const byKey = new Map(rows.map((r) => [r.key, r.value]));
    const identity = (byKey.get("branding.identity") ?? {}) as BrandingIdentity;
    const header = (byKey.get("branding.header") ?? {}) as BrandingHeader;
    const theme = (byKey.get("branding.theme") ?? {}) as BrandingTheme;
    const hero = (byKey.get("branding.hero") ?? {}) as BrandingHero;

    const covers = await this.media.coversByOwner("SITE_BRANDING", Object.values(BRANDING_SLOTS));
    const imageOf = (ownerId: string) => covers.get(ownerId)?.url ?? null;

    return {
      identity,
      header: { ...header, backgroundImageDesktop: imageOf(BRANDING_SLOTS.headerBackgroundDesktop), backgroundImageMobile: imageOf(BRANDING_SLOTS.headerBackgroundMobile) },
      theme,
      hero: { ...hero, backgroundImageDesktop: imageOf(BRANDING_SLOTS.heroBackgroundDesktop), backgroundImageMobile: imageOf(BRANDING_SLOTS.heroBackgroundMobile) },
      logoUrl: imageOf(BRANDING_SLOTS.logo),
      faviconUrl: imageOf(BRANDING_SLOTS.favicon),
    };
  }
}
