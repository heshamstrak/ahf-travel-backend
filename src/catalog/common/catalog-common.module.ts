import { Module } from "@nestjs/common";
import { MediaReader } from "./media";

@Module({
  providers: [MediaReader],
  exports: [MediaReader],
})
export class CatalogCommonModule {}
