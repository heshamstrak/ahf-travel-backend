import { Module } from "@nestjs/common";
import { AdminPoliciesController } from "./admin-policies.controller";
import { AdminPoliciesService } from "./admin-policies.service";

@Module({
  controllers: [AdminPoliciesController],
  providers: [AdminPoliciesService],
  exports: [AdminPoliciesService],
})
export class AdminPoliciesModule {}
