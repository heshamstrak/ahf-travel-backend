import { Module } from "@nestjs/common";
import { AdminMediaController } from "./admin-media.controller";
import { PublicMediaController } from "./public-media.controller";
import { AdminMediaService } from "./admin-media.service";
import { PUBLIC_MEDIA_STORAGE, LocalPublicMediaStorage } from "./public-media-storage";

@Module({
  controllers: [AdminMediaController, PublicMediaController],
  providers: [AdminMediaService, { provide: PUBLIC_MEDIA_STORAGE, useClass: LocalPublicMediaStorage }],
})
export class AdminMediaModule {}
