import { Module } from "@nestjs/common";
import { CatalogCommonModule } from "../common/catalog-common.module";
import { ToursController } from "./tours.controller";
import { ToursRepository } from "./tours.repository";
import { ToursService } from "./tours.service";

@Module({
  imports: [CatalogCommonModule],
  controllers: [ToursController],
  providers: [ToursRepository, ToursService],
})
export class ToursModule {}
