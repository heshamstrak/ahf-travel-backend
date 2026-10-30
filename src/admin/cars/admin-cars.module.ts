import { Module } from "@nestjs/common";
import { CatalogCommonModule } from "../../catalog/common/catalog-common.module";
import { AdminCarsController } from "./admin-cars.controller";
import { AdminCarsService } from "./admin-cars.service";
import { AdminCarInventoryController } from "./admin-car-inventory.controller";
import { AdminCarInventoryService } from "./admin-car-inventory.service";

@Module({
  imports: [CatalogCommonModule],
  controllers: [AdminCarsController, AdminCarInventoryController],
  providers: [AdminCarsService, AdminCarInventoryService],
})
export class AdminCarsModule {}
