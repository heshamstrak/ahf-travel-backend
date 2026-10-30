import { Module } from "@nestjs/common";
import { CatalogCommonModule } from "../common/catalog-common.module";
import { PackagesController } from "./packages.controller";
import { PackagesRepository } from "./packages.repository";
import { PackagesService } from "./packages.service";

@Module({
  imports: [CatalogCommonModule],
  controllers: [PackagesController],
  providers: [PackagesRepository, PackagesService],
})
export class PackagesModule {}
