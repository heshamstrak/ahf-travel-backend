import { Module } from "@nestjs/common";
import { AdminPricingRulesController } from "./admin-pricing-rules.controller";
import { AdminPricingRulesService } from "./admin-pricing-rules.service";

@Module({
  controllers: [AdminPricingRulesController],
  providers: [AdminPricingRulesService],
})
export class AdminPricingRulesModule {}
