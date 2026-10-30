import { Module } from "@nestjs/common";
import { AdminStaffController } from "./admin-staff.controller";
import { AdminStaffService } from "./admin-staff.service";
import { AdminProfileController } from "./admin-profile.controller";

@Module({
  controllers: [AdminStaffController, AdminProfileController],
  providers: [AdminStaffService],
})
export class AdminStaffModule {}
