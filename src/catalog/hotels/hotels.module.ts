import { Module } from "@nestjs/common";
import { CatalogCommonModule } from "../common/catalog-common.module";
import { HotelsController } from "./hotels.controller";
import { HotelsRepository } from "./hotels.repository";
import { HotelsService } from "./hotels.service";

@Module({
  imports: [CatalogCommonModule],
  controllers: [HotelsController],
  providers: [HotelsRepository, HotelsService],
})
export class HotelsModule {}
