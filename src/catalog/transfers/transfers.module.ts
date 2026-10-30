import { Module } from "@nestjs/common";
import { CatalogCommonModule } from "../common/catalog-common.module";
import { TransfersController } from "./transfers.controller";
import { TransfersRepository } from "./transfers.repository";
import { TransfersService } from "./transfers.service";

@Module({
  imports: [CatalogCommonModule],
  controllers: [TransfersController],
  providers: [TransfersRepository, TransfersService],
})
export class TransfersModule {}
