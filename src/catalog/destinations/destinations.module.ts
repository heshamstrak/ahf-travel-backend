import { Module } from "@nestjs/common";
import { CatalogCommonModule } from "../common/catalog-common.module";
import { DestinationsController } from "./destinations.controller";
import { DestinationsRepository } from "./destinations.repository";
import { DestinationsService } from "./destinations.service";

@Module({
  imports: [CatalogCommonModule],
  controllers: [DestinationsController],
  providers: [DestinationsRepository, DestinationsService],
  exports: [DestinationsRepository],
})
export class DestinationsModule {}
