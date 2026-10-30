import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { Roles, RolesGuard, CurrentUser } from "../common/authz";
import type { AuthenticatedUser } from "../auth/jwt-auth.guard";
import { ListInstapayQuery, RejectInstapayDto } from "./payments.dto";
import { PaymentsService } from "./payments.service";

/**
 * Review endpoints for a future Admin Dashboard (not built in this milestone). Every route requires
 * ADMIN or FINANCE; JwtAuthGuard (global) establishes the caller's identity first, RolesGuard
 * (global) then checks the role this controller declares.
 */
@Controller("admin/payments")
@UseGuards(RolesGuard)
@Roles(Role.ADMIN, Role.FINANCE)
export class AdminPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get("instapay")
  list(@Query() query: ListInstapayQuery) {
    return this.payments.listInstapaySubmissions(query.status, query.page, query.pageSize);
  }

  @Get(":paymentId")
  detail(@Param("paymentId") paymentId: string) {
    return this.payments.getAdminPaymentDetail(paymentId);
  }

  @Post(":paymentId/approve")
  approve(@Param("paymentId") paymentId: string, @CurrentUser() admin: AuthenticatedUser) {
    return this.payments.approveInstapay(paymentId, { id: admin.id, role: admin.role });
  }

  @Post(":paymentId/reject")
  reject(@Param("paymentId") paymentId: string, @CurrentUser() admin: AuthenticatedUser, @Body() dto: RejectInstapayDto) {
    return this.payments.rejectInstapay(paymentId, { id: admin.id, role: admin.role }, dto);
  }

  @Post(":paymentId/cash-collected")
  markCashCollected(@Param("paymentId") paymentId: string, @CurrentUser() admin: AuthenticatedUser) {
    return this.payments.markCashCollected(paymentId, { id: admin.id, role: admin.role });
  }
}
