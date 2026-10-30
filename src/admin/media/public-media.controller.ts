import { Controller, Get, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { Public } from "../../auth/jwt-auth.guard";
import { AdminMediaService } from "./admin-media.service";

const MIME_OF_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/**
 * Serves admin-uploaded catalogue images back out, unauthenticated — these are public catalogue
 * photos (hotel covers, room galleries, …), not InstaPay receipts, so there is no ownership check
 * here; payments/payments.controller.ts's proof endpoint is the one that IS access-controlled.
 * This stands in for a CDN/object-storage origin in development: MEDIA_CDN_BASE_URL can point
 * here, and a production deployment points it at real object storage instead, unchanged on the
 * `Media.storageKey` side.
 */
@Controller()
export class PublicMediaController {
  constructor(private readonly media: AdminMediaService) {}

  @Public()
  @Get("media/*key")
  async serve(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    // Set before the lookup, so even a 404 error response (handled by the global exception filter,
    // reusing this same res) carries it — helmet's secure default (Cross-Origin-Resource-Policy:
    // same-origin) would otherwise block every <img> load from a different origin/port than this
    // API, success or error alike, exactly the CDN-substitute role this route documents itself as.
    res.set("Cross-Origin-Resource-Policy", "cross-origin");
    const key = req.path.split("/media/")[1] ?? "";
    const extension = key.split(".").pop() ?? "";
    const { buffer } = await this.media.readFile(key);
    res.set({
      "Content-Type": MIME_OF_EXTENSION[extension] ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    });
    res.send(buffer);
  }
}
