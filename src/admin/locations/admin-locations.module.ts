import { Module } from "@nestjs/common";
import { AdminLocationsController } from "./admin-locations.controller";
import { AdminLocationsService } from "./admin-locations.service";

@Module({
  controllers: [AdminLocationsController],
  providers: [AdminLocationsService],
  exports: [AdminLocationsService],
})
export class AdminLocationsModule {}
