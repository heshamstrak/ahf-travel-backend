import { Module } from "@nestjs/common";
import { CatalogCommonModule } from "../catalog/common/catalog-common.module";
import { PublicSettingsController } from "./public-settings.controller";
import { PublicSettingsService } from "./public-settings.service";

@Module({
  imports: [CatalogCommonModule],
  controllers: [PublicSettingsController],
  providers: [PublicSettingsService],
})
export class PublicSettingsModule {}
