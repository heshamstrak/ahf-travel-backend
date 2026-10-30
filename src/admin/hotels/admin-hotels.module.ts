import { Module } from "@nestjs/common";
import { CatalogCommonModule } from "../../catalog/common/catalog-common.module";
import { AdminHotelsController } from "./admin-hotels.controller";
import { AdminHotelsService } from "./admin-hotels.service";
import { AdminRoomsController, AdminRoomsIndexController } from "./admin-rooms.controller";
import { AdminRoomsService } from "./admin-rooms.service";
import { AdminRatePlansController } from "./admin-rate-plans.controller";
import { AdminRatePlansService } from "./admin-rate-plans.service";
import { AdminRoomInventoryController } from "./admin-room-inventory.controller";
import { AdminRoomInventoryService } from "./admin-room-inventory.service";

@Module({
  imports: [CatalogCommonModule],
  controllers: [AdminHotelsController, AdminRoomsController, AdminRoomsIndexController, AdminRatePlansController, AdminRoomInventoryController],
  providers: [AdminHotelsService, AdminRoomsService, AdminRatePlansService, AdminRoomInventoryService],
})
export class AdminHotelsModule {}
