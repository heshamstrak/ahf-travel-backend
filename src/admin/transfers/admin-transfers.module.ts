import { Module } from "@nestjs/common";
import { AdminTransferVehicleClassesController } from "./admin-transfer-vehicle-classes.controller";
import { AdminTransferVehicleClassesService } from "./admin-transfer-vehicle-classes.service";
import { AdminTransferRatesController } from "./admin-transfer-rates.controller";
import { AdminTransferRatesService } from "./admin-transfer-rates.service";
import { AdminTransferCapacityController } from "./admin-transfer-capacity.controller";
import { AdminTransferCapacityService } from "./admin-transfer-capacity.service";

@Module({
  controllers: [AdminTransferVehicleClassesController, AdminTransferRatesController, AdminTransferCapacityController],
  providers: [AdminTransferVehicleClassesService, AdminTransferRatesService, AdminTransferCapacityService],
})
export class AdminTransfersModule {}
