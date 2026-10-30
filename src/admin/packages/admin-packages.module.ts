import { Module } from "@nestjs/common";
import { CatalogCommonModule } from "../../catalog/common/catalog-common.module";
import { AdminPackagesController } from "./admin-packages.controller";
import { AdminPackagesService } from "./admin-packages.service";
import { AdminPackageDeparturesController } from "./admin-package-departures.controller";
import { AdminPackageDeparturesService } from "./admin-package-departures.service";

@Module({
  imports: [CatalogCommonModule],
  controllers: [AdminPackagesController, AdminPackageDeparturesController],
  providers: [AdminPackagesService, AdminPackageDeparturesService],
})
export class AdminPackagesModule {}
