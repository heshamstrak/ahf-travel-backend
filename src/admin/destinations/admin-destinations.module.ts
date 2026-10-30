import { Module } from "@nestjs/common";
import { CatalogCommonModule } from "../../catalog/common/catalog-common.module";
import { AdminDestinationsController } from "./admin-destinations.controller";
import { AdminDestinationsService } from "./admin-destinations.service";

@Module({
  imports: [CatalogCommonModule],
  controllers: [AdminDestinationsController],
  providers: [AdminDestinationsService],
  exports: [AdminDestinationsService],
})
export class AdminDestinationsModule {}
