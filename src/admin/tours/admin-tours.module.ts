import { Module } from "@nestjs/common";
import { CatalogCommonModule } from "../../catalog/common/catalog-common.module";
import { AdminToursController } from "./admin-tours.controller";
import { AdminToursService } from "./admin-tours.service";
import { AdminTourSessionsController, AdminTourSessionsIndexController } from "./admin-tour-sessions.controller";
import { AdminTourSessionsService } from "./admin-tour-sessions.service";

@Module({
  imports: [CatalogCommonModule],
  controllers: [AdminToursController, AdminTourSessionsController, AdminTourSessionsIndexController],
  providers: [AdminToursService, AdminTourSessionsService],
})
export class AdminToursModule {}
