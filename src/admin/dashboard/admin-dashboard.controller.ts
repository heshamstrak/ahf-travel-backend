import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { Roles, RolesGuard } from "../../common/authz";
import { DashboardAnalyticsQuery } from "./admin-dashboard.dto";
import { AdminDashboardService } from "./admin-dashboard.service";

@Controller("admin/dashboard")
@UseGuards(RolesGuard)
@Roles(Role.ADMIN, Role.FINANCE)
export class AdminDashboardController {
  constructor(private readonly dashboard: AdminDashboardService) {}

  @Get()
  overview() {
    return this.dashboard.overview();
  }

  @Get("analytics")
  analytics(@Query() query: DashboardAnalyticsQuery) {
    return this.dashboard.analytics(query);
  }
}
