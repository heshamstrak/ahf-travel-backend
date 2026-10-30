import { Module } from "@nestjs/common";
import { QuotesController } from "./quotes.controller";
import { QuotesRepository } from "./quotes.repository";
import { QuotesService } from "./quotes.service";
import { ProductPricer } from "./product-pricer";

@Module({
  controllers: [QuotesController],
  providers: [QuotesRepository, ProductPricer, QuotesService],
})
export class QuotesModule {}
