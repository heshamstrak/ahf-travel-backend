import { Module } from "@nestjs/common";
import { CatalogCommonModule } from "../common/catalog-common.module";
import { CarsController } from "./cars.controller";
import { CarsRepository } from "./cars.repository";
import { CarsService } from "./cars.service";

@Module({
  imports: [CatalogCommonModule],
  controllers: [CarsController],
  providers: [CarsRepository, CarsService],
})
export class CarsModule {}
